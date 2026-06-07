import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rungTokenConsumption, rungCost, tokensByRung, costByRung, buildOtelReport } from './otel-report.mjs';

const tok = (o = {}) => ({ input: 0, output: 0, thinkingEst: 0, cacheRead: 0, cacheCreation: 0, total: 0, ...o });
const agent = (name, t, costUsd, requests = 1, timeMs = { sumDuration: 100, ttftAvg: 50 }) =>
  ({ agent: name, tokens: tok(t), costUsd, requests, timeMs });

const rungs = [
  { rung: 'trivial-button', tier: 'trivial', agents: [
    agent('component-builder', { total: 1000, output: 400 }, 0.02, 3, { sumDuration: 300, ttftAvg: 60 }),
    agent('figma-fetcher', { total: 200, output: 50 }, 0.005, 1, { sumDuration: 80, ttftAvg: 40 }),
  ] },
  { rung: 'complex-card', tier: 'complex', agents: [
    agent('component-builder', { total: 5000, output: 2000 }, 0.10, 5, { sumDuration: 900, ttftAvg: 80 }),
  ] },
];

test('rungTokenConsumption sums tokens and ranks agents by total', () => {
  const r = rungTokenConsumption(rungs[0].agents);
  assert.equal(r.total, 1200);
  assert.equal(r.output, 450);
  assert.deepEqual(r.byAgent.map((a) => a.agent), ['component-builder', 'figma-fetcher']);
});

test('rungCost sums USD and ranks agents by cost', () => {
  const r = rungCost(rungs[0].agents);
  assert.equal(r.usd, 0.025);
  assert.equal(r.byAgent[0].agent, 'component-builder');
});

test('tokensByRung / costByRung carry rung + tier', () => {
  const t = tokensByRung(rungs);
  assert.equal(t[1].rung, 'complex-card');
  assert.equal(t[1].total, 5000);
  const c = costByRung(rungs);
  assert.equal(c[1].usd, 0.1);
});

test('buildOtelReport aggregates per-agent across rungs with request-weighted ttft', () => {
  const rep = buildOtelReport(rungs, { otelTotalTokens: 6200, costsJsonlTotalTokens: 6000 });
  const cb = rep.perAgent.find((a) => a.agent === 'component-builder');
  assert.equal(cb.tokens.total, 6000);
  assert.equal(cb.requests, 8);
  // ttft weighted: (60*3 + 80*5)/8 = (180+400)/8 = 72.5 → 73
  assert.equal(cb.ttftAvgMs, 73);
  assert.equal(rep.costDominantAgent, 'component-builder');
  assert.equal(rep.totals.tokens, 6200);
  assert.equal(rep.crossCheck.deltaPct, 3); // (6200-6000)/6000 ≈ 3%
});

test('buildOtelReport handles empty input', () => {
  const rep = buildOtelReport([], { otelTotalTokens: 0, costsJsonlTotalTokens: 0 });
  assert.deepEqual(rep.perAgent, []);
  assert.equal(rep.costDominantAgent, null);
  assert.equal(rep.totals.costUsd, 0);
});
