import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateRun, fanInBlocking, buildRollup } from './aggregate.mjs';

const events = [
  { agent: 'icon-generator',  model: 'claude-haiku-4-5', requestId: 'i1', inputTokens: 50, outputTokens: 10, cacheReadTokens: 0, cacheCreationTokens: 0, costUsd: 0.01, durationMs: 500 },
  { agent: 'component-builder', model: 'claude-opus-4-8', requestId: 'c1', inputTokens: 200, outputTokens: 80, cacheReadTokens: 20, cacheCreationTokens: 5, costUsd: 0.20, durationMs: 1500 },
  { agent: 'component-builder', model: 'claude-opus-4-8', requestId: 'c2', inputTokens: 100, outputTokens: 40, cacheReadTokens: 0, cacheCreationTokens: 0, costUsd: 0.10, durationMs: 700 },
];
const spans = [
  { querySource: 'icon-generator',  startNs: 1000000n, endNs: 4000000n, ttftMs: 200 },
  { querySource: 'component-builder', startNs: 1500000n, endNs: 9000000n, ttftMs: 300 },
];
const thinkingByAgent = new Map([['component-builder', 24]]);

test('aggregateRun produces per-agent token/time/cost rows', () => {
  const agents = aggregateRun(events, spans, thinkingByAgent);
  const cb = agents.find(a => a.agent === 'component-builder');
  assert.equal(cb.requests, 2);
  assert.equal(cb.tokens.input, 300);
  assert.equal(cb.tokens.output, 120);
  assert.equal(cb.tokens.thinkingEst, 24);
  assert.equal(cb.tokens.cacheRead, 20);
  assert.equal(cb.tokens.cacheCreation, 5);
  assert.equal(cb.tokens.total, 300 + 120 + 20 + 5);
  assert.equal(cb.timeMs.sumDuration, 2200);
  assert.equal(cb.timeMs.wallSpan, 7);
  assert.equal(cb.toolUses, 0);
  assert.ok(Math.abs(cb.costUsd - 0.30) < 1e-9);
});

test('fanInBlocking = max(0, iconEnd - componentEnd) in ms; 0 when icon finishes first', () => {
  assert.deepEqual(fanInBlocking(spans), [{ iconEndNs: '4000000', componentEndNs: '9000000', blockedMs: 0 }]);
  const blocked = fanInBlocking([
    { querySource: 'component-builder', startNs: 0n, endNs: 3000000n },
    { querySource: 'icon-generator', startNs: 0n, endNs: 5000000n },
  ]);
  assert.equal(blocked[0].blockedMs, 2);
});

test('fanInBlocking returns [] when there is no icon-generator span (control)', () => {
  assert.deepEqual(fanInBlocking([{ querySource: 'component-builder', startNs: 0n, endNs: 1n }]), []);
});

test('buildRollup picks token- and time-dominant agents and computes cross-check delta', () => {
  const runs = [{
    agents: aggregateRun(events, spans, thinkingByAgent),
    scenario: { tier: 'moderate' },
  }];
  const rollup = buildRollup(runs, { otelTotalTokens: 525, costsJsonlTotalTokens: 500 });
  assert.equal(rollup.dominance.tokens, 'component-builder');
  assert.equal(rollup.dominance.time, 'component-builder');
  assert.equal(rollup.dominance.byTier.moderate.tokens, 'component-builder');
  assert.equal(rollup.crossCheck.deltaPct, 5);
});
