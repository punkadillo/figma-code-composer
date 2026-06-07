import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreA11y } from './score-a11y.mjs';

const W = { penalty: { critical: 25, serious: 15, moderate: 7, minor: 3 }, perNodeCap: 3, floor: 0 };

test('null axe results → null score, no source', () => {
  const r = scoreA11y(null, W);
  assert.equal(r.score, null);
  assert.equal(r.source, null);
});

test('no violations → 100', () => {
  const r = scoreA11y({ violations: [], passes: [1, 2, 3] }, W);
  assert.equal(r.score, 100);
  assert.equal(r.source, 'axe');
  assert.equal(r.passCount, 3);
});

test('one serious violation with 2 nodes deducts penalty × nodes', () => {
  const r = scoreA11y({ violations: [{ id: 'color-contrast', impact: 'serious', nodes: [{}, {}] }] }, W);
  assert.equal(r.score, 100 - 15 * 2); // 70
  assert.equal(r.violationCount, 1);
  assert.equal(r.nodeCount, 2);
});

test('node penalty is capped at perNodeCap', () => {
  const r = scoreA11y({ violations: [{ id: 'x', impact: 'minor', nodes: new Array(10).fill({}) }] }, W);
  assert.equal(r.score, 100 - 3 * 3); // capped at 3 nodes → 91
});

test('score never goes below floor', () => {
  const many = new Array(20).fill({ id: 'x', impact: 'critical', nodes: [{}, {}, {}] });
  const r = scoreA11y({ violations: many }, W);
  assert.equal(r.score, 0);
});

test('unknown impact falls back to minor penalty', () => {
  const r = scoreA11y({ violations: [{ id: 'x', impact: 'weird', nodes: [{}] }] }, W);
  assert.equal(r.score, 100 - 3);
});
