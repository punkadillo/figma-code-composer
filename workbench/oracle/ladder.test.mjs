import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LADDER, oracleSourceFor } from './ladder.mjs';

test('LADDER covers the heroui-20260606 rungs, named by complexity', () => {
  assert.equal(LADDER.length, 11);
  assert.deepEqual(LADDER.map(r => r.rung),
    ['trivial-icon','tokens','trivial-button','trivial-chip','moderate-input','moderate-switch',
     'complex-card','complex-alert','complex-tabs','complex-dashboard','extreme-calendar']);
  assert.equal(oracleSourceFor('trivial-button'), 'storybook');
  assert.equal(oracleSourceFor('tokens'), 'styles');
  assert.equal(oracleSourceFor('complex-dashboard'), 'storybook-demo');
  assert.equal(oracleSourceFor('extreme-calendar'), 'storybook');
  assert.equal(oracleSourceFor('trivial-icon'), 'storybook');
});

test('component rungs are named by complexity tier, not atomic design', () => {
  const atomicTerms = ['atom', 'molecule', 'organism', 'template'];
  for (const r of LADDER) {
    assert.ok(!atomicTerms.includes(r.rung), `${r.rung} should not be an atomic-design term`);
  }
});

test('every ladder rung has a known tier and an oracle source', () => {
  for (const r of LADDER) {
    assert.ok(['trivial', 'moderate', 'complex', 'extreme'].includes(r.tier), `${r.rung} tier`);
    assert.ok(r.oracle, `${r.rung} oracle`);
  }
});
