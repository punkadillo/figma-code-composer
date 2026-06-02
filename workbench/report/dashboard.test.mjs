import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderDashboard, svgBars } from './dashboard.mjs';

test('svgBars renders one <rect> per datum, width scaled to max', () => {
  const svg = svgBars([{ label: 'a', value: 10 }, { label: 'b', value: 5 }], { width: 200 });
  assert.match(svg, /<svg/);
  assert.equal((svg.match(/<rect/g) || []).length, 2);
});

test('renderDashboard is self-contained html with embedded data and no external src', () => {
  const results = { trialId: 'demo', generatedAt: null, runs: [],
    rollup: { perAgent: [{ agent: 'component-builder', tokens: { total: 445 }, timeMs: 2200, costUsd: 0.3 }],
      dominance: { tokens: 'component-builder', time: 'component-builder', byTier: {} },
      crossCheck: { otelTotalTokens: 445, costsJsonlTotalTokens: 430, deltaPct: 3 } } };
  const html = renderDashboard(results);
  assert.match(html, /<!doctype html>/i);
  assert.match(html, /component-builder/);
  assert.doesNotMatch(html, /src=["']https?:/);
  assert.match(html, /id="results-data"/);
});
