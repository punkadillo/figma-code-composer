import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderTrialsetMarkdown } from './markdown.mjs';

const ts = {
  trialId: 'heroui', generatedAt: '2026-06-03T00:00:00Z',
  rungs: [
    { rung: 'atom', tier: 'trivial', runId: 'r2', icon: false, agents: [], fanIn: [], accuracy: { composite: 95, cappedAt: null, visual: { score: 98 }, style: { matchRate: 96 }, structural: { score: 90 }, gates: { typecheck: true, build: true, tests: true, a11y: true } } },
    { rung: 'page', tier: 'extreme', runId: 'r6', icon: false, agents: [], fanIn: [], accuracy: { composite: 20, cappedAt: 20, visual: { score: 50 }, style: { matchRate: 45 }, structural: { score: 30 }, gates: { typecheck: true, build: false, tests: false, a11y: true } } },
  ],
  comparisons: {
    iconFanIn: { withIconsRung: 'all-icons', controlRung: 'organism', blockedMsDelta: 12 },
    coldWarm: { coldRunId: 'cold', warmRunId: 'warm', tokenDeltaPct: -25 },
    buildUpdate: { buildRunId: 'b', updateRunId: 'u', tokenDeltaPct: -55 },
  },
  rollup: { perAgent: [], dominance: { tokens: 'component-builder', time: 'component-builder', byTier: {} }, crossCheck: { otelTotalTokens: 1, costsJsonlTotalTokens: 1, deltaPct: 0 } },
  accuracyByRung: [{ rung: 'atom', composite: 95 }, { rung: 'page', composite: 20 }],
};

test('renderTrialsetMarkdown shows ladder accuracy and comparisons', () => {
  const md = renderTrialsetMarkdown(ts);
  assert.match(md, /# Workbench Trial Report — heroui/);
  assert.match(md, /atom/);
  assert.match(md, /\| *95 *\|/);
  assert.match(md, /icon fan-in.*12 ?ms/is);
  assert.match(md, /cold.*warm.*-25%/is);
  assert.match(md, /build.*update.*-55%/is);
});

test('renderTrialsetMarkdown flags a capped rung', () => {
  const md = renderTrialsetMarkdown(ts);
  assert.match(md, /capped/i);   // the page rung was build-capped at 20
});
