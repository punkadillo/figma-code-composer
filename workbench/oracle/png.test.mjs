import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { decodePng } from './png.mjs';

const here = dirname(fileURLToPath(import.meta.url));

test('decodePng returns RGBA for a 2x2 red PNG', () => {
  const buf = readFileSync(join(here, '..', 'fixtures', 'png', 'red2x2.png'));
  const img = decodePng(buf);
  assert.equal(img.width, 2);
  assert.equal(img.height, 2);
  assert.equal(img.data.length, 2 * 2 * 4);
  assert.deepEqual([img.data[0], img.data[1], img.data[2], img.data[3]], [255, 0, 0, 255]);
});
