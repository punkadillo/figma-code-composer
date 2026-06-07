import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rungEfficiency, efficiencyByRung } from './efficiency.mjs';

const agent = (over = {}) => ({
  agent: 'component-builder',
  tokens: { input: 0, output: 0, thinkingEst: 0, cacheRead: 0, cacheCreation: 0, total: 0, ...(over.tokens || {}) },
  timeMs: over.timeMs ?? { sumDuration: 100, ttftAvg: 50 },
  costUsd: over.costUsd ?? 0,
  toolUses: over.toolUses ?? 0,
  requests: over.requests ?? 1,
});

test('rungEfficiency computes cache-hit ratio, tool-calls, weighted ttft', () => {
  const r = {
    rung: 'complex-card', tier: 'complex', wallMs: 42000, accuracy: { composite: 50 },
    agents: [
      agent({ tokens: { total: 1000, cacheRead: 700 }, costUsd: 0.10, toolUses: 30, requests: 4, timeMs: { ttftAvg: 60 } }),
      agent({ tokens: { total: 0, cacheRead: 0 }, costUsd: 0, toolUses: 5, requests: 1, timeMs: { ttftAvg: 100 } }),
    ],
  };
  const e = rungEfficiency(r);
  assert.equal(e.latencyMs, 42000);
  assert.equal(e.cacheHitRatio, 0.7);          // 700 / 1000
  assert.equal(e.toolUses, 35);
  assert.equal(e.requests, 5);
  assert.equal(e.ttftAvgMs, 68);               // (60*4 + 100*1)/5 = 68
});

test('cost/token-per-accuracy-point composites use accuracy.composite', () => {
  const r = { rung: 'x', tier: 'trivial', wallMs: 1000, accuracy: { composite: 80 },
    agents: [agent({ tokens: { total: 8000 }, costUsd: 1.6 })] };
  const e = rungEfficiency(r);
  assert.equal(e.costPerAccuracyPoint, 0.02);  // 1.6 / 80
  assert.equal(e.tokensPerAccuracyPoint, 100); // 8000 / 80
});

test('composites are null when accuracy is unscored', () => {
  const r = { rung: 'x', tier: 'trivial', wallMs: 1000, accuracy: { composite: null },
    agents: [agent({ tokens: { total: 8000 }, costUsd: 1.6 })] };
  const e = rungEfficiency(r);
  assert.equal(e.costPerAccuracyPoint, null);
  assert.equal(e.tokensPerAccuracyPoint, null);
});

test('zero tokens → cacheHitRatio 0, no divide-by-zero', () => {
  const e = rungEfficiency({ rung: 'x', tier: 'trivial', wallMs: null, accuracy: null, agents: [] });
  assert.equal(e.cacheHitRatio, 0);
  assert.equal(e.ttftAvgMs, 0);
  assert.equal(e.latencyMs, null);
});

test('efficiencyByRung carries rung/label/tier', () => {
  const rows = efficiencyByRung([{ rung: 'a', label: 'a (cold)', tier: 'moderate', wallMs: 1, accuracy: { composite: 10 }, agents: [agent({ tokens: { total: 100 }, costUsd: 0.1 })] }]);
  assert.equal(rows[0].label, 'a (cold)');
  assert.equal(rows[0].tier, 'moderate');
});
