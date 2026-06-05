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

test('Form has source but no oracle story; Button has both', () => {
  assert.equal(RUNG_MAP.template.hasOracleStory, false);
  assert.equal(RUNG_MAP.atom.hasOracleStory, true);
});
