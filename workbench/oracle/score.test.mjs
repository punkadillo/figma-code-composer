import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composeAccuracy } from './score.mjs';

const weights = { visual: 0.35, style: 0.30, structural: 0.20, gates: 0.15, buildFailCeiling: 20 };

test('all-perfect composite is 100', () => {
  const acc = composeAccuracy({
    visual: { diffPct: 0, score: 100 },
    style: { matchRate: 100, properties: {} },
    structural: { score: 100 },
    gates: { typecheck: true, build: true, tests: true, a11y: true },
  }, weights);
  assert.equal(acc.composite, 100);
  assert.deepEqual(acc.weights, { visual: 0.35, style: 0.30, structural: 0.20, gates: 0.15 });
});

test('gates contribute the fraction passed', () => {
  const acc = composeAccuracy({
    visual: { diffPct: 0, score: 100 },
    style: { matchRate: 100, properties: {} },
    structural: { score: 100 },
    gates: { typecheck: true, build: true, tests: false, a11y: false },
  }, weights);
  // 0.35*100 + 0.30*100 + 0.20*100 + 0.15*50 = 92.5 -> 93
  assert.equal(acc.composite, 93);
});

test('a failed build gate caps the composite at the ceiling', () => {
  const acc = composeAccuracy({
    visual: { diffPct: 0, score: 100 },
    style: { matchRate: 100, properties: {} },
    structural: { score: 100 },
    gates: { typecheck: true, build: false, tests: true, a11y: true },
  }, weights);
  assert.equal(acc.composite, 20);
});
