import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreRuntimePerf } from './score-runtime-perf.mjs';

test('null perf → null score', () => {
  assert.equal(scoreRuntimePerf(null).score, null);
});

test('fast mount → 100; slow mount → low', () => {
  assert.equal(scoreRuntimePerf({ mountMs: 30 }).score, 100);
  assert.equal(scoreRuntimePerf({ mountMs: 400 }).score, 0);
  assert.equal(scoreRuntimePerf({ mountMs: 225 }).mount, 50); // midpoint of 50..400
});

test('inp folds into composite when present', () => {
  const r = scoreRuntimePerf({ mountMs: 30, inpMs: 350 }); // mount 100, inp 50 → 75
  assert.equal(r.score, 75);
});

test('reRenders/memory are gated (null passthrough)', () => {
  const r = scoreRuntimePerf({ mountMs: 30 });
  assert.equal(r.reRenders, null);
  assert.equal(r.memoryMB, null);
});
