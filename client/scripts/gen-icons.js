// Generates the launcher icons (56 and 112 px) with zero dependencies: a
// minimal PNG encoder plus a procedural drawing. The icon is therefore
// reproducible from source and never a binary blob in git.
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname } from 'node:path';

// --- PNG encoding ----------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(size, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const raw = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    const rowStart = y * (1 + size * 4);
    raw[rowStart] = 0; // filter: none
    rgba.copy(raw, rowStart + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- the picture -----------------------------------------------------------
// A speech bubble with three dots on a dark rounded square. Coordinates are
// fractions of the icon size, so both sizes come from the same drawing.
// Edges are smoothed by rendering each pixel from a 4x4 grid of samples.

const BG = [0x14, 0x1e, 0x2e];
const BUBBLE = [0xf4, 0xf6, 0xf8];
const DOT = [0x22, 0x88, 0xcc];
const SUPERSAMPLE = 4;

// Signed distance to a rounded box: negative inside.
function roundedBox(x, y, cx, cy, hw, hh, r) {
  const qx = Math.abs(x - cx) - (hw - r);
  const qy = Math.abs(y - cy) - (hh - r);
  const ox = Math.max(qx, 0);
  const oy = Math.max(qy, 0);
  return Math.sqrt(ox * ox + oy * oy) + Math.min(Math.max(qx, qy), 0) - r;
}

function inCircle(x, y, cx, cy, r) {
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

function inTriangle(x, y, a, b, c) {
  const s1 = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
  const s2 = (c[0] - b[0]) * (y - b[1]) - (c[1] - b[1]) * (x - b[0]);
  const s3 = (a[0] - c[0]) * (y - c[1]) - (a[1] - c[1]) * (x - c[0]);
  return (s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0);
}

// Colour at a point in [0,1]x[0,1]; null means transparent.
function colorAt(x, y) {
  if (roundedBox(x, y, 0.5, 0.5, 0.5, 0.5, 0.18) > 0) return null;
  const bubble = roundedBox(x, y, 0.5, 0.45, 0.34, 0.22, 0.10) <= 0
    || inTriangle(x, y, [0.30, 0.64], [0.46, 0.64], [0.27, 0.82]);
  if (!bubble) return BG;
  for (const cx of [0.36, 0.50, 0.64]) {
    if (inCircle(x, y, cx, 0.45, 0.05)) return DOT;
  }
  return BUBBLE;
}

function render(size) {
  const out = Buffer.alloc(size * size * 4);
  const n = SUPERSAMPLE * SUPERSAMPLE;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      // Average premultiplied colour over the sub-samples, then un-premultiply,
      // so half-covered edge pixels blend towards transparent, not black.
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SUPERSAMPLE; sy++) {
        for (let sx = 0; sx < SUPERSAMPLE; sx++) {
          const c = colorAt((px + (sx + 0.5) / SUPERSAMPLE) / size, (py + (sy + 0.5) / SUPERSAMPLE) / size);
          if (c) { r += c[0]; g += c[1]; b += c[2]; a += 1; }
        }
      }
      const o = (py * size + px) * 4;
      if (a > 0) {
        out[o] = Math.round(r / a);
        out[o + 1] = Math.round(g / a);
        out[o + 2] = Math.round(b / a);
        out[o + 3] = Math.round(255 * a / n);
      }
    }
  }
  return out;
}

for (const size of [56, 112]) {
  const path = `static/icons/icon-${size}.png`;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, encodePng(size, render(size)));
  console.log('wrote', path);
}
