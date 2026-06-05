import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreGates, GATES } from './score-gates.mjs';

test('GATES is the fixed four-gate list', () => {
  assert.deepEqual(GATES, ['typecheck', 'build', 'tests', 'a11y']);
});

test('all gates pass when the runner returns ok for each', async () => {
  const r = await scoreGates({ runGate: async () => ({ ok: true }) });
  assert.deepEqual(r, { typecheck: true, build: true, tests: true, a11y: true });
});

test('a failing runner marks that gate false', async () => {
  const r = await scoreGates({ runGate: async (g) => ({ ok: g !== 'build' }) });
  assert.equal(r.build, false);
  assert.equal(r.typecheck, true);
});

test('a thrown runner is treated as a failed gate, not a crash', async () => {
  const r = await scoreGates({ runGate: async (g) => { if (g === 'tests') throw new Error('boom'); return { ok: true }; } });
  assert.equal(r.tests, false);
  assert.equal(r.a11y, true);
});

test('scoreGates honours a gates subset (a11y omitted)', async () => {
  const runGate = async (g) => ({ ok: g !== 'tests' });   // tests fails
  const res = await scoreGates({ runGate, gates: ['typecheck', 'build', 'tests'] });
  assert.deepEqual(Object.keys(res).sort(), ['build', 'tests', 'typecheck']);
  assert.equal(res.a11y, undefined);
  assert.equal(res.tests, false);
});
