import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flatten, unflatten, encode, decodeText, roundTrips, safeEncode } from './brevit.mjs';

test('flatten then unflatten round-trips a nested object with arrays (modulo scalar->string)', () => {
  const obj = { name: 'Card', tags: ['a', 'b'], meta: { n: 3, ok: true, none: null } };
  const back = unflatten(flatten(obj));
  assert.deepEqual(back, { name: 'Card', tags: ['a', 'b'], meta: { n: '3', ok: 'true', none: null } });
});

test('flatten preserves figma variable paths byte-exact (binding rule 3)', () => {
  const obj = { components: [{ styledProperties: [{ figmaVariable: 'color/surface/brand-primary', unbound: false }] }] };
  const flat = flatten(obj);
  assert.ok(Object.values(flat).includes('color/surface/brand-primary'));
  const back = unflatten(flat);
  assert.equal(back.components[0].styledProperties[0].figmaVariable, 'color/surface/brand-primary');
});

test('empty array and empty object survive', () => {
  assert.deepEqual(unflatten(flatten({ a: [], b: {} })), { a: [], b: {} });
});

test('encode produces compact non-JSON text and roundTrips() is true for a manifest-shaped payload', async () => {
  const slice = { name: 'Card', layer: 'molecule',
    styledProperties: [{ figmaVariable: 'radius/lg', unbound: false, rawValue: null }] };
  const out = await encode(slice);
  assert.equal(typeof out, 'string');
  assert.ok(!out.trim().startsWith('{'), 'should not be raw JSON');
  assert.equal(await roundTrips(slice), true);
});

test('decodeText recovers the figma path from an encoded payload', async () => {
  const slice = { v: 'color/surface/brand-primary', unbound: true };
  const restored = decodeText(await encode(slice));
  assert.equal(restored.v, 'color/surface/brand-primary');
  assert.equal(restored.unbound, 'true');
});

test('safeEncode falls back to valid raw JSON when the round-trip guard fails', async () => {
  // newline in value inflates the wire form AND breaks the round-trip guard →
  // safeEncode MUST return exactly JSON.stringify(tricky), not wire form.
  const tricky = { note: 'colon: and\nnewline, comma' };
  const out = await safeEncode(tricky);
  assert.equal(out, JSON.stringify(tricky));
});

test('safeEncode is identity-safe (valid JSON) and never throws on a normal payload', async () => {
  const out = await safeEncode({ a: 1, b: [1, 2, 3] });
  assert.ok(typeof out === 'string' && out.length > 0);
});

test('safeEncode returns JSON (not wire) when the wire form is not smaller (deep/sparse payload)', async () => {
  const deep = { components: [{ name: 'Card', styledProperties: [{ figmaVariable: 'color/surface/brand-primary', unbound: false }] }] };
  const out = await safeEncode(deep);
  assert.equal(out, JSON.stringify(deep)); // brevit inflates this shape → must fall back to JSON
});

test('safeEncode returns the wire form for a flat-wide scalar dict where it IS smaller', async () => {
  const flat = {}; for (let i = 0; i < 40; i++) flat['color/scale/' + i] = '#abc' + i;
  const out = await safeEncode(flat);
  assert.ok(!out.trim().startsWith('{'), 'flat-wide dict should use the smaller wire form');
  assert.ok(out.length < JSON.stringify(flat).length);
});

// ── Pure-function degradation tests (no brevit dependency) ───────────────────

test('flatten/unflatten/decodeText work without invoking brevit (pure, no dependency)', () => {
  const obj = { a: { b: 'color/x/y' }, n: 3 };
  assert.deepEqual(unflatten(flatten(obj)), { a: { b: 'color/x/y' }, n: '3' });
  assert.equal(decodeText('a.b:color/x/y\nn:3').a.b, 'color/x/y');
});

test('decodeText preserves an @-prefixed key (no longer dropped)', () => {
  assert.equal(decodeText('@id:abc\nname:Card')['@id'], 'abc');
});
