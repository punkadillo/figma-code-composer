import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderTrialsetMarkdown } from './markdown.mjs';

const dim = (s) => ({ score: s, metric: s, judge: { score: s, rationales: [] } });
const ts = {
  trialId: 'heroui', generatedAt: null,
  rungs: [{ rung: 'atom', tier: 'trivial', runId: 'r2', icon: false, agents: [], fanIn: [],
    accuracy: { composite: 95, cappedAt: null, visual: { score: 98 }, style: { matchRate: 96 }, structural: { score: 90 }, gates: { build: true } },
    quality: { composite: 82, dimensions: { optimizedCode: dim(80), dx: dim(85), docs: dim(70), testDepth: dim(90), storybook: dim(80) }, weights: {} } }],
  comparisons: {}, accuracyByRung: [{ rung: 'atom', composite: 95 }], qualityByRung: [{ rung: 'atom', composite: 82 }],
  rollup: { perAgent: [], dominance: { tokens: 'component-builder', time: 'component-builder', byTier: {} }, crossCheck: { otelTotalTokens: 1, costsJsonlTotalTokens: 1, deltaPct: 0 } },
};

test('renderTrialsetMarkdown adds a Quality-by-rung table', () => {
  const md = renderTrialsetMarkdown(ts);
  assert.match(md, /Quality by ladder rung/i);
  assert.match(md, /optimized|optimizedCode/i);
  assert.match(md, /\| *82 *\|/);
});
