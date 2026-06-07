import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composeQuality } from './quality-score.mjs';

const dims = {
  optimizedCode: { score: 80, metric: 80, judge: { score: 80, rationales: [] } },
  dx:            { score: 60, metric: 60, judge: { score: 60, rationales: [] } },
  docs:          { score: 40, metric: 40, judge: { score: 40, rationales: [] } },
  testDepth:     { score: 100, metric: 100, judge: { score: 100, rationales: [] } },
  storybook:     { score: 20, metric: 20, judge: { score: 20, rationales: [] } },
};
const weights = { optimizedCode: 0.25, dx: 0.20, docs: 0.15, testDepth: 0.25, storybook: 0.15 };

test('composeQuality weights the five dimensions into a composite', () => {
  const q = composeQuality(dims, weights);
  // 0.25*80 + 0.20*60 + 0.15*40 + 0.25*100 + 0.15*20 = 20+12+6+25+3 = 66
  assert.equal(q.composite, 66);
  assert.equal(q.dimensions.testDepth.score, 100);
  assert.deepEqual(q.weights, weights);
});
