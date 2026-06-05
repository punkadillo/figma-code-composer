// oracle/assemble-accuracy.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assembleAccuracy } from './assemble-accuracy.mjs';

const BASE = { visual: 0.35, style: 0.30, structural: 0.20, gates: 0.15, buildFailCeiling: 20 };

test('structural+gates only → composite from renormalised weights, availability flagged', () => {
  const acc = assembleAccuracy({
    visual: null, style: null,
    structural: { score: 80 },
    gates: { typecheck: true, build: true, tests: true },
  }, BASE);
  // structural 80 @ 0.20/0.35 + gates 100 @ 0.15/0.35 = 45.71 + 42.86 = 88.57 -> 89
  assert.equal(acc.composite, 89);
  assert.deepEqual(acc.availability, { visual: false, style: false, structural: true, gates: true });
  assert.equal(acc.weights.visual, 0);
  // unavailable sub-scores are nulled so the report renders `—`, not a misleading 0
  assert.equal(acc.visual, null);
  assert.equal(acc.style, null);
});

test('all sub-scores available → standard weighting', () => {
  const acc = assembleAccuracy({
    visual: { diffPct: 0, score: 60 },
    style: { matchRate: 50, properties: {} },
    structural: { score: 70 },
    gates: { typecheck: true, build: true, tests: true, a11y: true },
  }, BASE);
  // 0.35*60 + 0.30*50 + 0.20*70 + 0.15*100 = 21+15+14+15 = 65
  assert.equal(acc.composite, 65);
  assert.equal(acc.availability.visual, true);
});
