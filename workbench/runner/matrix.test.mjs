import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultMatrix, makeRunRow } from './matrix.mjs';

test('defaultMatrix covers all four scenario axes from the spec', () => {
  const m = defaultMatrix();
  assert.ok(m.some(s => s.icon === true) && m.some(s => s.icon === false), 'icon fan-in pair');
  assert.deepEqual([...new Set(m.map(s => s.tier))].sort(), ['complex','extreme','moderate','trivial']);
  assert.ok(m.some(s => s.cache === 'cold') && m.some(s => s.cache === 'warm'), 'cold/warm');
  assert.ok(m.some(s => s.mode === 'build') && m.some(s => s.mode === 'update'), 'build/update');
});

test('makeRunRow stamps the provided window and scenario', () => {
  const row = makeRunRow({
    runId: 'r1', command: '/figma-build u', scenario: { icon: true, tier: 'moderate', cache: 'cold', mode: 'build' },
    startedAt: '2026-06-02T10:00:00Z', endedAt: '2026-06-02T10:00:10Z',
  });
  assert.equal(row.runId, 'r1');
  assert.equal(row.scenario.tier, 'moderate');
  assert.equal(row.startedAt, '2026-06-02T10:00:00Z');
});
