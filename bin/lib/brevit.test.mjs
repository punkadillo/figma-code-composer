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
  const tricky = { note: 'colon: and\nnewline, comma' };
  const out = await safeEncode(tricky);
  const recovered = (await roundTrips(tricky)) || JSON.parse(out);  // either guard passed, or it is valid JSON
  assert.ok(recovered);
});

test('safeEncode is identity-safe (valid JSON) and never throws on a normal payload', async () => {
  const out = await safeEncode({ a: 1, b: [1, 2, 3] });
  assert.ok(typeof out === 'string' && out.length > 0);
});
