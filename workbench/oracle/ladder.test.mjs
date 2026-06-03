import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LADDER, oracleSourceFor } from './ladder.mjs';

test('LADDER has the 7 rungs with tiers and oracle sources', () => {
  assert.equal(LADDER.length, 7);
  assert.deepEqual(LADDER.map(r => r.rung), ['icon-only','atom','molecule','organism','template','page','all-icons']);
  assert.equal(oracleSourceFor('atom'), 'storybook');
  assert.equal(oracleSourceFor('page'), 'figma');
  assert.equal(oracleSourceFor('template'), 'figma');
  assert.equal(oracleSourceFor('icon-only'), 'storybook');
});
