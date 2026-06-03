import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blendDimension } from './blend.mjs';
import { scoreDimensions, metricSubScores } from './dimensions.mjs';

test('blendDimension blends metric and judge by the configured ratio', () => {
  const d = blendDimension(80, { score: 60, rationales: ['x'] }, { metricWeight: 0.5, judgeWeight: 0.5 });
  assert.equal(d.score, 70);
  assert.equal(d.metric, 80);
  assert.equal(d.judge.score, 60);
});

test('metricSubScores maps raw metrics into per-dimension 0-100 sub-scores', () => {
  const sub = metricSubScores({
    code: { metricScore: 90, complexity: 3, size: 200, loc: 10, imports: 2 },
    surface: { hasTypes: true, propCount: 3, namedExports: 1, storyCount: 4, testCount: 6, docWords: 80, hasPropTable: true },
  });
  for (const k of ['optimizedCode','dx','docs','testDepth','storybook'])
    assert.ok(sub[k] >= 0 && sub[k] <= 100, `${k}=${sub[k]}`);
  assert.equal(sub.optimizedCode, 90);
  assert.equal(sub.docs, 100);
  assert.equal(sub.storybook >= 80, true);
});

test('scoreDimensions blends metric subscores with judge results using weights', () => {
  const sub = { optimizedCode: 80, dx: 80, docs: 80, testDepth: 80, storybook: 80 };
  const judges = {
    optimizedCode: { score: 60, rationales: [] }, dx: { score: 60, rationales: [] },
    docs: { score: 60, rationales: [] }, testDepth: { score: 60, rationales: [] }, storybook: { score: 60, rationales: [] },
  };
  const blend = {
    optimizedCode: { metricWeight: 0.5, judgeWeight: 0.5 }, dx: { metricWeight: 0.5, judgeWeight: 0.5 },
    docs: { metricWeight: 0.5, judgeWeight: 0.5 }, testDepth: { metricWeight: 0.5, judgeWeight: 0.5 }, storybook: { metricWeight: 0.5, judgeWeight: 0.5 },
  };
  const dims = scoreDimensions(sub, judges, blend);
  assert.equal(dims.optimizedCode.score, 70);
  assert.equal(dims.storybook.judge.score, 60);
});
