#!/usr/bin/env node
/**
 * visual-qa/pixel-diff — dependency-free PNG decode / encode / compare.
 *
 * Why hand-rolled: the sweep already produces PNGs via Playwright, and the repo deliberately
 * carries no runtime deps for the skill. A PNG is just zlib-deflated, per-scanline-filtered
 * scanlines, and node:zlib is in the standard library — so pixelmatch + pngjs would be two new
 * dependencies to do ~150 lines of stdlib work. Supports what Chromium emits (8-bit, non-
 * interlaced, colour types 0/2/3/4/6). Anything else throws LOUDLY rather than returning a pass.
 */
import zlib from "node:zlib";

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

/** Decode a PNG buffer to { width, height, data } where data is RGBA (4 bytes/px). */
export function decodePNG(buf) {
  if (buf.length < 8 || buf.readUInt32BE(0) !== 0x89504e47 || buf.readUInt32BE(4) !== 0x0d0a1a0a)
    throw new Error("not a PNG file");

  let pos = 8;
  let ihdr = null;
  let plte = null;
  let trns = null;
  const idat = [];
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR")
      ihdr = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        depth: data[8],
        color: data[9],
        interlace: data[12],
      };
    else if (type === "IDAT") idat.push(data);
    else if (type === "PLTE") plte = Buffer.from(data);
    else if (type === "tRNS") trns = Buffer.from(data);
    else if (type === "IEND") break;
    pos += 12 + len;
  }
  if (!ihdr) throw new Error("PNG has no IHDR chunk");
  if (ihdr.depth !== 8) throw new Error(`unsupported PNG bit depth ${ihdr.depth} (need 8)`);
  if (ihdr.interlace !== 0) throw new Error("unsupported interlaced PNG");
  const ch = CHANNELS[ihdr.color];
  if (!ch) throw new Error(`unsupported PNG colour type ${ihdr.color}`);
  if (!idat.length) throw new Error("PNG has no IDAT data");

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const { width, height } = ihdr;
  const stride = width * ch;
  const bpp = ch; // depth 8 ⇒ bytes-per-pixel === channels
  if (raw.length < height * (stride + 1))
    throw new Error(`PNG scanline data truncated (${raw.length} < ${height * (stride + 1)})`);

  // un-filter in place into a flat pixel buffer
  const px = Buffer.alloc(height * stride);
  let rp = 0;
  for (let y = 0; y < height; y++) {
    const ft = raw[rp++];
    const row = y * stride;
    const prev = row - stride;
    for (let x = 0; x < stride; x++) {
      const cur = raw[rp + x];
      const a = x >= bpp ? px[row + x - bpp] : 0;
      const b = y > 0 ? px[prev + x] : 0;
      const c = x >= bpp && y > 0 ? px[prev + x - bpp] : 0;
      let v;
      switch (ft) {
        case 0: v = cur; break;
        case 1: v = cur + a; break;
        case 2: v = cur + b; break;
        case 3: v = cur + ((a + b) >> 1); break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          v = cur + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default: throw new Error(`unknown PNG filter type ${ft} on row ${y}`);
      }
      px[row + x] = v & 0xff;
    }
    rp += stride;
  }

  // normalise to RGBA
  const data = Buffer.alloc(width * height * 4);
  for (let i = 0, n = width * height; i < n; i++) {
    const s = i * ch, d = i * 4;
    if (ihdr.color === 6) { data[d] = px[s]; data[d + 1] = px[s + 1]; data[d + 2] = px[s + 2]; data[d + 3] = px[s + 3]; }
    else if (ihdr.color === 2) { data[d] = px[s]; data[d + 1] = px[s + 1]; data[d + 2] = px[s + 2]; data[d + 3] = 255; }
    else if (ihdr.color === 0) { data[d] = data[d + 1] = data[d + 2] = px[s]; data[d + 3] = 255; }
    else if (ihdr.color === 4) { data[d] = data[d + 1] = data[d + 2] = px[s]; data[d + 3] = px[s + 1]; }
    else { // palette
      const idx = px[s] * 3;
      if (!plte || idx + 2 >= plte.length) throw new Error("palette PNG missing/short PLTE");
      data[d] = plte[idx]; data[d + 1] = plte[idx + 1]; data[d + 2] = plte[idx + 2];
      data[d + 3] = trns && px[s] < trns.length ? trns[px[s]] : 255;
    }
  }
  return { width, height, data };
}

function chunk(type, data) {
  const out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/** Encode RGBA pixel data to a PNG buffer (8-bit RGBA, filter 0). */
export function encodePNG(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 6 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/**
 * Box-average downscale of a decoded image to `targetWidth` (no-op if already narrower).
 * Baselines are a regression *signal*, not a pixel-perfect reference: shrinking a full-page shot
 * keeps layout/colour/structure changes plainly visible, cuts the committed bytes by ~10x, and
 * averages away subpixel antialiasing noise that would otherwise produce false regressions.
 */
export function downscale({ width, height, data }, targetWidth) {
  if (width <= targetWidth) return { width, height, data };
  const w2 = targetWidth;
  const h2 = Math.max(1, Math.round((height * targetWidth) / width));
  const out = Buffer.alloc(w2 * h2 * 4);
  for (let y = 0; y < h2; y++) {
    const sy0 = Math.floor((y * height) / h2);
    const sy1 = Math.max(sy0 + 1, Math.floor(((y + 1) * height) / h2));
    for (let x = 0; x < w2; x++) {
      const sx0 = Math.floor((x * width) / w2);
      const sx1 = Math.max(sx0 + 1, Math.floor(((x + 1) * width) / w2));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let sy = sy0; sy < sy1; sy++) {
        let p = (sy * width + sx0) * 4;
        for (let sx = sx0; sx < sx1; sx++, p += 4) {
          r += data[p]; g += data[p + 1]; b += data[p + 2]; a += data[p + 3]; n++;
        }
      }
      const d = (y * w2 + x) * 4;
      out[d] = r / n; out[d + 1] = g / n; out[d + 2] = b / n; out[d + 3] = a / n;
    }
  }
  return { width: w2, height: h2, data: out };
}

/** Decode → downscale → re-encode, so what gets committed is the comparable form. */
export function normalizePNG(buf, targetWidth) {
  const img = downscale(decodePNG(buf), targetWidth);
  return encodePNG(img.width, img.height, img.data);
}

/**
 * Compare two PNG buffers.
 * Returns { width, height, diffPixels, totalPixels, ratio, diff } where `ratio` is 0..1 and
 * `diff` is an RGBA PNG buffer (current shot faded to grey, changed pixels painted magenta).
 * Throws on dimension mismatch — the caller must report that as a change, never as a pass.
 */
export function comparePNG(baselineBuf, currentBuf, { tolerance = 12 } = {}) {
  const a = decodePNG(baselineBuf);
  const b = decodePNG(currentBuf);
  if (a.width !== b.width || a.height !== b.height) {
    const err = new Error(`dimensions changed: baseline ${a.width}x${a.height} vs current ${b.width}x${b.height}`);
    err.dimensionMismatch = true;
    throw err;
  }
  const total = a.width * a.height;
  const out = Buffer.alloc(total * 4);
  let diffPixels = 0;
  for (let i = 0; i < total; i++) {
    const p = i * 4;
    const changed =
      Math.abs(a.data[p] - b.data[p]) > tolerance ||
      Math.abs(a.data[p + 1] - b.data[p + 1]) > tolerance ||
      Math.abs(a.data[p + 2] - b.data[p + 2]) > tolerance ||
      Math.abs(a.data[p + 3] - b.data[p + 3]) > tolerance;
    if (changed) {
      diffPixels++;
      out[p] = 255; out[p + 1] = 0; out[p + 2] = 255; out[p + 3] = 255;
    } else {
      // faded greyscale of the CURRENT shot, so the magenta reads against real context
      const g = 200 + Math.round((0.299 * b.data[p] + 0.587 * b.data[p + 1] + 0.114 * b.data[p + 2]) * 0.2);
      const v = Math.min(255, g);
      out[p] = v; out[p + 1] = v; out[p + 2] = v; out[p + 3] = 255;
    }
  }
  return {
    width: a.width,
    height: a.height,
    diffPixels,
    totalPixels: total,
    ratio: total ? diffPixels / total : 0,
    diff: encodePNG(a.width, a.height, out),
  };
}
