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

test('cappedAt records the applied ceiling only when the build cap fires', () => {
  const base = {
    visual: { diffPct: 0, score: 100 },
    style: { matchRate: 100, properties: {} },
    structural: { score: 100 },
  };
  const passing = composeAccuracy({ ...base, gates: { typecheck: true, build: true, tests: true, a11y: true } }, weights);
  assert.equal(passing.cappedAt, null);
  const capped = composeAccuracy({ ...base, gates: { typecheck: true, build: false, tests: true, a11y: true } }, weights);
  assert.equal(capped.cappedAt, 20);
  assert.equal(capped.composite, 20);
});

test('gate term uses only evaluated gates (a11y omitted → denom 3)', () => {
  const weights = { visual: 0.35, style: 0.30, structural: 0.20, gates: 0.15, buildFailCeiling: 20 };
  const acc = composeAccuracy({
    visual: { diffPct: 0, score: 100 },
    style: { matchRate: 100, properties: {} },
    structural: { score: 100 },
    gates: { typecheck: true, build: true, tests: true },   // a11y absent
  }, weights);
  // all 3 evaluated gates pass → gate term 100 → full composite 100
  assert.equal(acc.composite, 100);
});
