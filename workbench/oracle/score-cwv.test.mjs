import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreCwv } from './score-cwv.mjs';

const W = {
  lcp: { good: 2500, poor: 4000, weight: 0.4 },
  cls: { good: 0.1, poor: 0.25, weight: 0.3 },
  tbt: { good: 200, poor: 600, weight: 0.3 },
};

test('null metrics → null score, no source', () => {
  const r = scoreCwv(null, W);
  assert.equal(r.score, null);
  assert.equal(r.source, null);
});

test('all-good vitals → 100 and good ratings', () => {
  const r = scoreCwv({ lcpMs: 1000, cls: 0.0, tbtMs: 50 }, W);
  assert.equal(r.score, 100);
  assert.equal(r.lcp.rating, 'good');
  assert.equal(r.cls.rating, 'good');
  assert.equal(r.tbt.rating, 'good');
});

test('value exactly at good threshold is good and 100', () => {
  const r = scoreCwv({ lcpMs: 2500, cls: 0.1, tbtMs: 200 }, W);
  assert.equal(r.lcp.score, 100);
  assert.equal(r.score, 100);
});

test('midway between good and poor → ~75 and needs-improvement', () => {
  const r = scoreCwv({ lcpMs: 3250, cls: 0.175, tbtMs: 400 }, W); // midpoints
  assert.equal(r.lcp.rating, 'needs-improvement');
  assert.equal(r.lcp.score, 75);
  assert.equal(r.score, 75);
});

test('beyond poor → poor rating and sub-50 score', () => {
  const r = scoreCwv({ lcpMs: 8000, cls: 1.0, tbtMs: 2000 }, W);
  assert.equal(r.lcp.rating, 'poor');
  assert.ok(r.lcp.score < 50);
  assert.ok(r.score < 50);
});

test('composite respects per-metric weights', () => {
  // lcp poor (0), cls good (100), tbt good (100) → 0.4*0 + 0.3*100 + 0.3*100 = 60
  const r = scoreCwv({ lcpMs: 4000, cls: 0, tbtMs: 0 }, W);
  assert.equal(r.lcp.score, 50); // at poor threshold
  // recompute with clearly-poor lcp
  const r2 = scoreCwv({ lcpMs: 10000, cls: 0, tbtMs: 0 }, W);
  assert.equal(r2.lcp.score, 0);
  assert.equal(r2.score, 60);
});
