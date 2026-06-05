// oracle/effective-weights.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { effectiveWeights } from './effective-weights.mjs';

const BASE = { visual: 0.35, style: 0.30, structural: 0.20, gates: 0.15, buildFailCeiling: 20 };

test('all available → unchanged (sum 1, ceiling preserved)', () => {
  const w = effectiveWeights(BASE, { visual: true, style: true, structural: true, gates: true });
  assert.equal(w.buildFailCeiling, 20);
  assert.ok(Math.abs(w.visual + w.style + w.structural + w.gates - 1) < 1e-9);
  assert.ok(Math.abs(w.visual - 0.35) < 1e-9);
});

test('visual+style unavailable → weight 0, structural/gates renormalised', () => {
  const w = effectiveWeights(BASE, { visual: false, style: false, structural: true, gates: true });
  assert.equal(w.visual, 0);
  assert.equal(w.style, 0);
  assert.ok(Math.abs(w.structural - 0.20 / 0.35) < 1e-9);
  assert.ok(Math.abs(w.gates - 0.15 / 0.35) < 1e-9);
  assert.ok(Math.abs(w.structural + w.gates - 1) < 1e-9);
});
