import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderTrialsetDashboard } from './dashboard.mjs';

const ts = {
  trialId: 'heroui', generatedAt: null,
  rungs: [], comparisons: { coldWarm: { coldRunId: 'c', warmRunId: 'w', tokenDeltaPct: -25 } },
  rollup: { perAgent: [{ agent: 'component-builder', tokens: { total: 100 }, timeMs: 10, costUsd: 0 }],
    dominance: { tokens: 'component-builder', time: 'component-builder', byTier: {} },
    crossCheck: { otelTotalTokens: 100, costsJsonlTotalTokens: 100, deltaPct: 0 } },
  accuracyByRung: [{ rung: 'atom', composite: 95 }, { rung: 'page', composite: 40 }],
};

test('renderTrialsetDashboard is self-contained html with an accuracy chart', () => {
  const html = renderTrialsetDashboard(ts);
  assert.match(html, /<!doctype html>/i);
  assert.match(html, /Accuracy by rung/i);
  assert.match(html, /atom/);
  assert.equal((html.match(/<rect/g) || []).length >= 2, true);
  assert.doesNotMatch(html, /src=["']https?:/);
  assert.match(html, /id="trialset-data"/);
});
