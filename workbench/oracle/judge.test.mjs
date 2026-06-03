import { test } from 'node:test';
import assert from 'node:assert/strict';
import { judgePanel } from './judge.mjs';

test('judgePanel takes the median of an odd vote count', () => {
  const r = judgePanel([{ score: 90, rationale: 'a' }, { score: 60, rationale: 'b' }, { score: 80, rationale: 'c' }]);
  assert.equal(r.score, 80);
  assert.deepEqual(r.rationales, ['a', 'b', 'c']);
});

test('judgePanel averages the two middle values for an even count', () => {
  const r = judgePanel([{ score: 50, rationale: 'a' }, { score: 90, rationale: 'b' }]);
  assert.equal(r.score, 70);
});

test('judgePanel with a single vote returns that score', () => {
  assert.equal(judgePanel([{ score: 42, rationale: 'x' }]).score, 42);
});

test('judgePanel on empty votes returns score 0 and no rationales', () => {
  const r = judgePanel([]);
  assert.equal(r.score, 0);
  assert.deepEqual(r.rationales, []);
});
