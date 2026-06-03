import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreVisual } from './score-visual.mjs';

const solid = (w, h, [r, g, b, a]) => {
  const data = new Array(w * h * 4);
  for (let i = 0; i < w * h; i++) { data[i*4]=r; data[i*4+1]=g; data[i*4+2]=b; data[i*4+3]=a; }
  return { width: w, height: h, data };
};

test('identical images score 100 / 0% diff', () => {
  const a = solid(2, 2, [10, 20, 30, 255]);
  const r = scoreVisual(a, solid(2, 2, [10, 20, 30, 255]));
  assert.equal(r.diffPct, 0);
  assert.equal(r.score, 100);
});

test('fully different images score 0 / 100% diff', () => {
  const r = scoreVisual(solid(2, 2, [0,0,0,255]), solid(2, 2, [255,255,255,255]));
  assert.equal(r.diffPct, 100);
  assert.equal(r.score, 0);
});

test('half-different images score 50', () => {
  const a = { width: 2, height: 1, data: [0,0,0,255, 0,0,0,255] };
  const b = { width: 2, height: 1, data: [0,0,0,255, 255,255,255,255] };
  const r = scoreVisual(a, b);
  assert.equal(r.diffPct, 50);
  assert.equal(r.score, 50);
});

test('mismatched dimensions score 0', () => {
  const r = scoreVisual(solid(2,2,[0,0,0,255]), solid(3,3,[0,0,0,255]));
  assert.equal(r.diffPct, 100);
  assert.equal(r.score, 0);
});

test('sub-tolerance differences do not count', () => {
  const a = { width: 1, height: 1, data: [100,100,100,255] };
  const b = { width: 1, height: 1, data: [104,100,100,255] };
  assert.equal(scoreVisual(a, b, { tolerance: 8 }).diffPct, 0);
});
