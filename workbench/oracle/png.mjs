// workbench/oracle/png.mjs
// Minimal PNG decoder for 8-bit truecolour-alpha (color type 6) — the format
// Playwright screenshots use. Returns {width,height,data} RGBA. node:zlib only.
import { inflateSync } from 'node:zlib';

const SIG = [137, 80, 78, 71, 13, 10, 26, 10];

export function decodePng(buf) {
  for (let i = 0; i < SIG.length; i++)
    if (buf[i] !== SIG[i]) throw new Error('not a PNG');
  let off = 8, width = 0, height = 0, bitDepth = 0, colorType = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9];
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') break;
    off += 12 + len; // len + type(4) + data + crc(4)
  }
  if (bitDepth !== 8 || colorType !== 6) throw new Error(`unsupported PNG (bitDepth=${bitDepth}, colorType=${colorType})`);
  const raw = inflateSync(Buffer.concat(idat));
  const bpp = 4;                       // RGBA
  const stride = width * bpp;
  const out = new Uint8ClampedArray(width * height * bpp);
  let prevRow = new Uint8ClampedArray(stride);
  let p = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[p++];
    const row = new Uint8ClampedArray(stride);
    for (let x = 0; x < stride; x++) {
      const rawByte = raw[p++];
      const a = x >= bpp ? row[x - bpp] : 0;       // left
      const b = prevRow[x];                         // up
      const c = x >= bpp ? prevRow[x - bpp] : 0;    // up-left
      let val;
      switch (filter) {
        case 0: val = rawByte; break;                       // None
        case 1: val = rawByte + a; break;                   // Sub
        case 2: val = rawByte + b; break;                   // Up
        case 3: val = rawByte + ((a + b) >> 1); break;      // Average
        case 4: {                                           // Paeth
          const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
          val = rawByte + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); break;
        }
        default: throw new Error(`bad filter ${filter}`);
      }
      row[x] = val & 0xff;
    }
    out.set(row, y * stride);
    prevRow = row;
  }
  return { width, height, data: Array.from(out) };
}
