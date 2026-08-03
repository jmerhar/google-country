#!/usr/bin/env node
/**
 * Generate placeholder app icons (src/icons/icon{16,48,128}.png) with no image dependencies.
 *
 * Draws a simple globe motif — a rounded blue tile with a white disc and blue meridian/equator
 * lines — by writing raw RGBA pixels and encoding a minimal PNG (single IDAT, zlib deflate). These
 * are intentionally basic placeholders; swap in real artwork any time and rerun `make icons`.
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "icons");
const SIZES = [16, 48, 128];

const BLUE = [26, 115, 232, 255];
const WHITE = [255, 255, 255, 255];
const CLEAR = [0, 0, 0, 0];

/** CRC-32 (PNG polynomial), table built once. */
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeAndData = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([len, typeAndData, crc]);
}

function encodePng(size, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  // 10-12: compression/filter/interlace = 0
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter type: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function draw(size) {
  const px = Buffer.alloc(size * size * 4);
  const c = (size - 1) / 2;
  const corner = size * 0.22;
  const globe = size * 0.32;
  const lineW = Math.max(1, size * 0.05);
  const set = (x, y, [r, g, b, a]) => {
    const i = (y * size + x) * 4;
    px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = a;
  };
  // Rounded-rect corner test: outside the corner arc → transparent.
  const outsideTile = (x, y) => {
    const dx = Math.max(corner - x, x - (size - 1 - corner), 0);
    const dy = Math.max(corner - y, y - (size - 1 - corner), 0);
    return Math.hypot(dx, dy) > corner;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (outsideTile(x, y)) { set(x, y, CLEAR); continue; }
      const inGlobe = Math.hypot(x - c, y - c) <= globe;
      if (!inGlobe) { set(x, y, BLUE); continue; }
      const onLine = Math.abs(x - c) <= lineW / 2 || Math.abs(y - c) <= lineW / 2;
      set(x, y, onLine ? BLUE : WHITE);
    }
  }
  return px;
}

mkdirSync(OUT_DIR, { recursive: true });
for (const size of SIZES) {
  writeFileSync(join(OUT_DIR, `icon${size}.png`), encodePng(size, draw(size)));
}
console.log(`Wrote icons ${SIZES.map((s) => `icon${s}.png`).join(", ")} to ${OUT_DIR}`);
