import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreStyle, STYLE_PROPS } from './score-style.mjs';

test('STYLE_PROPS covers color/spacing/typography/radius', () => {
  for (const p of ['color','background-color','padding','margin','font-size','font-weight','border-radius'])
    assert.ok(STYLE_PROPS.includes(p), `missing ${p}`);
});

test('identical styles match 100%', () => {
  const s = { color: 'rgb(0,0,0)', 'font-size': '16px', 'border-radius': '8px' };
  const r = scoreStyle(s, { ...s });
  assert.equal(r.matchRate, 100);
});

test('color match ignores whitespace differences', () => {
  const r = scoreStyle({ color: 'rgb(0, 0, 0)' }, { color: 'rgb(0,0,0)' });
  assert.equal(r.properties.color, true);
});

test('matchRate is the percentage of compared properties that match', () => {
  const gen = { color: 'rgb(0,0,0)', 'font-size': '16px' };
  const ref = { color: 'rgb(0,0,0)', 'font-size': '14px' };
  const r = scoreStyle(gen, ref);
  assert.equal(r.matchRate, 50);
  assert.equal(r.properties.color, true);
  assert.equal(r.properties['font-size'], false);
});

test('a property absent on both sides is skipped, not counted as mismatch', () => {
  const r = scoreStyle({ color: 'rgb(1,1,1)' }, { color: 'rgb(1,1,1)' });
  assert.equal(r.matchRate, 100);
  assert.equal('padding' in r.properties, false);
});
