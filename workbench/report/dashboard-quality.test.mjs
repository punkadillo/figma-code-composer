import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderTrialsetDashboard } from './dashboard.mjs';

const ts = {
  trialId: 'heroui', generatedAt: null, rungs: [], comparisons: {},
  rollup: { perAgent: [{ agent: 'component-builder', tokens: { total: 100 }, timeMs: 10, costUsd: 0 }],
    dominance: { tokens: 'component-builder', time: 'component-builder', byTier: {} },
    crossCheck: { otelTotalTokens: 100, costsJsonlTotalTokens: 100, deltaPct: 0 } },
  accuracyByRung: [{ rung: 'atom', composite: 95 }],
  qualityByRung: [{ rung: 'atom', composite: 82 }, { rung: 'page', composite: 30 }],
};

test('renderTrialsetDashboard adds a quality-by-rung chart', () => {
  const html = renderTrialsetDashboard(ts);
  assert.match(html, /Quality by rung/i);
  assert.match(html, /atom/);
  assert.doesNotMatch(html, /src=["']https?:/);
});
