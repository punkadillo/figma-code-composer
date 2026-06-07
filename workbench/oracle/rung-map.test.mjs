// oracle/rung-map.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RUNG_MAP, scoredRungs } from './rung-map.mjs';

test('every scored rung has source paths and component name', () => {
  for (const r of scoredRungs()) {
    assert.ok(r.targetTsx && r.targetTsx.endsWith('.tsx'), `${r.rung} targetTsx`);
    assert.ok(r.oracleTsx && r.oracleTsx.endsWith('.tsx'), `${r.rung} oracleTsx`);
    assert.ok(r.component, `${r.rung} component`);
    assert.equal(typeof r.hasOracleStory, 'boolean');
  }
});

test('rungs are named by complexity tier (not atomic design)', () => {
  for (const key of Object.keys(RUNG_MAP)) {
    assert.ok(/^(trivial|moderate|complex|extreme)-/.test(key), `${key} is complexity-prefixed`);
  }
});

test('the dashboard composition has source but no oracle story; button has both', () => {
  assert.equal(RUNG_MAP['complex-dashboard'].hasOracleStory, false);
  assert.equal(RUNG_MAP['trivial-button'].hasOracleStory, true);
});
