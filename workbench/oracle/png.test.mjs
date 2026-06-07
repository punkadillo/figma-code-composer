import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
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

/**
 * Build a minimal colorType-2 (RGB, no alpha) PNG in memory and verify decode.
 * Pixel layout: 2x1 image, px0 = (10, 20, 30), px1 = (40, 50, 60).
 * decodePng skips CRC verification (reads chunks by length), so 4 zero CRC
 * bytes per chunk are sufficient.
 */
test('decodePng decodes colorType-2 (RGB) PNG — expands to RGBA with alpha=255', () => {
  // 8-byte PNG signature
  const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  function makeChunk(type, data) {
    const typeB = Buffer.from(type, 'ascii');
    const len = Buffer.allocUnsafe(4);
    len.writeUInt32BE(data.length, 0);
    const crc = Buffer.alloc(4); // zero CRC — decodePng does not verify
    return Buffer.concat([len, typeB, data, crc]);
  }

  // IHDR: width=2, height=1, bitDepth=8, colorType=2, compression=0, filter=0, interlace=0
  const ihdrData = Buffer.allocUnsafe(13);
  ihdrData.writeUInt32BE(2, 0);  // width
  ihdrData.writeUInt32BE(1, 4);  // height
  ihdrData[8] = 8;               // bitDepth
  ihdrData[9] = 2;               // colorType RGB
  ihdrData[10] = 0; ihdrData[11] = 0; ihdrData[12] = 0;

  // IDAT: one row — filterByte=0 (None) + px0(R,G,B) + px1(R,G,B)
  const rowData = Buffer.from([0, 10, 20, 30, 40, 50, 60]);
  const compressed = deflateSync(rowData);

  const png = Buffer.concat([
    SIG,
    makeChunk('IHDR', ihdrData),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);

  const img = decodePng(png);
  assert.equal(img.width, 2);
  assert.equal(img.height, 1);
  assert.equal(img.data.length, 2 * 1 * 4, 'data length should be 8 (2px × 4 channels)');

  // pixel 0: R=10 G=20 B=30 A=255
  assert.deepEqual(
    [img.data[0], img.data[1], img.data[2], img.data[3]],
    [10, 20, 30, 255],
    'pixel 0 RGB channels and alpha=255',
  );
  // pixel 1: R=40 G=50 B=60 A=255
  assert.deepEqual(
    [img.data[4], img.data[5], img.data[6], img.data[7]],
    [40, 50, 60, 255],
    'pixel 1 RGB channels and alpha=255',
  );
});
