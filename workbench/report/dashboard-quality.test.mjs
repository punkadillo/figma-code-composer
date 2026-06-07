import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderTrialsetDashboard } from './dashboard.mjs';

const ts = {
  trialId: 'reference', generatedAt: null, rungs: [], comparisons: {},
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

const tsTables = {
  ...ts,
  rungs: [
    { rung: 'atom', tier: 'trivial',
      quality: { composite: 86, dimensions: { optimizedCode: { score: 88 }, dx: { score: 90 }, docs: { score: 87 }, testDepth: { score: 78 }, storybook: { score: 90 } } },
      gates: { tsc: true, build: true, tests: { passed: 17, total: 17 } } },
    { rung: 'template', tier: 'complex',
      quality: { composite: 50, dimensions: { optimizedCode: { score: 52 }, dx: { score: 38 }, docs: { score: 55 }, testDepth: { score: 55 }, storybook: { score: 52 } } },
      gates: { tsc: true, build: true, tests: { passed: 12, total: 13 } } },
    { rung: 'page', tier: 'extreme', quality: null, gates: null },
  ],
};

test('renderTrialsetDashboard renders per-dimension Quality + Build-gates tables', () => {
  const html = renderTrialsetDashboard(tsTables);
  // Two HTML tables: quality (per-dimension) and build gates.
  assert.equal((html.match(/<table>/g) || []).length, 2);
  assert.match(html, /optimizedCode/);
  assert.match(html, /testDepth/);
  // atom composite cell + template gate fail (12/13 → ✗); page is out of scope (no row).
  assert.match(html, /<td>atom<\/td><td style="text-align:right">86</);
  assert.match(html, /12\/13/);
  assert.match(html, /✗/);
  assert.doesNotMatch(html, /<td>page<\/td>/);
});
