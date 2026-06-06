import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LADDER, oracleSourceFor } from './ladder.mjs';

test('LADDER covers the heroui-20260606 rungs with tiers and oracle sources', () => {
  assert.equal(LADDER.length, 11);
  assert.deepEqual(LADDER.map(r => r.rung),
    ['icon-only','tokens','atom','chip','molecule','switch','organism','all-icons','tabs','template','extreme']);
  assert.equal(oracleSourceFor('atom'), 'storybook');
  assert.equal(oracleSourceFor('tokens'), 'styles');
  assert.equal(oracleSourceFor('template'), 'storybook-demo');
  assert.equal(oracleSourceFor('extreme'), 'storybook');
  assert.equal(oracleSourceFor('icon-only'), 'storybook');
});

test('every ladder rung has a known tier and an oracle source', () => {
  for (const r of LADDER) {
    assert.ok(['trivial', 'moderate', 'complex', 'extreme'].includes(r.tier), `${r.rung} tier`);
    assert.ok(r.oracle, `${r.rung} oracle`);
  }
});
