import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

/**
 * Zero-dependency crisp app icon generator (PNG 256x256 + multi-size Windows ICO)
 * so desktop builds always have a clean native lock+check emblem without native C++ addons.
 */
const buildDir = path.resolve(process.cwd(), 'build');
fs.mkdirSync(buildDir, { recursive: true });

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) {
      c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const compressed = zlib.deflateSync(raw, { level: 9 });
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return Math.hypot(px - projX, py - projY);
}

function signedRoundedRect(x, y, cx, cy, hw, hh, r) {
  const qx = Math.abs(x - cx) - (hw - r);
  const qy = Math.abs(y - cy) - (hh - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

function blendPixel(buf, idx, r, g, b, a) {
  const alpha = Math.max(0, Math.min(1, a));
  if (alpha <= 0) return;
  const dstA = buf[idx + 3] / 255;
  const outA = alpha + dstA * (1 - alpha);
  if (outA <= 0) return;
  buf[idx] = Math.round((r * alpha + buf[idx] * dstA * (1 - alpha)) / outA);
  buf[idx + 1] = Math.round((g * alpha + buf[idx + 1] * dstA * (1 - alpha)) / outA);
  buf[idx + 2] = Math.round((b * alpha + buf[idx + 2] * dstA * (1 - alpha)) / outA);
  buf[idx + 3] = Math.round(outA * 255);
}

function renderIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const scale = size / 64;

  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      const x = (px + 0.5) / scale;
      const y = (py + 0.5) / scale;
      const idx = (py * size + px) * 4;

      // Outer dark rounded square
      const bgDist = signedRoundedRect(x, y, 32, 32, 30, 30, 14);
      if (bgDist < 1) {
        const aa = Math.max(0, Math.min(1, 0.5 - bgDist));
        blendPixel(rgba, idx, 20, 20, 24, aa);
        // Subtle border
        if (Math.abs(bgDist + 1) < 1.2) {
          const borderAlpha = Math.max(0, Math.min(1, 1.2 - Math.abs(bgDist + 1))) * aa;
          blendPixel(rgba, idx, 56, 56, 72, borderAlpha);
        }
      }

      // Lock shackle arch
      const shackleRadius = 10;
      const archDist =
        y <= 24
          ? Math.abs(Math.hypot(x - 32, y - 24) - shackleRadius)
          : Math.min(
              distToSegment(x, y, 22, 24, 22, 30),
              distToSegment(x, y, 42, 24, 42, 30)
            );
      if (archDist < 2.6) {
        const a = Math.max(0, Math.min(1, 2.3 - archDist));
        blendPixel(rgba, idx, 167, 139, 250, a);
      }

      // Lock body
      const bodyDist = signedRoundedRect(x, y, 32, 39.5, 16, 11.5, 5.5);
      if (bodyDist < 1) {
        const aa = Math.max(0, Math.min(1, 0.5 - bodyDist));
        blendPixel(rgba, idx, 34, 34, 44, aa);
      }
      if (Math.abs(bodyDist) < 2.0) {
        const strokeA = Math.max(0, Math.min(1, 1.7 - Math.abs(bodyDist)));
        blendPixel(rgba, idx, 167, 139, 250, strokeA);
      }

      // Crisp checkmark inside lock
      const d1 = distToSegment(x, y, 25.5, 39.5, 30, 44);
      const d2 = distToSegment(x, y, 30, 44, 39, 35);
      const checkDist = Math.min(d1, d2);
      if (checkDist < 2.2) {
        const ca = Math.max(0, Math.min(1, 1.9 - checkDist));
        blendPixel(rgba, idx, 242, 243, 247, ca);
      }
    }
  }

  return encodePng(size, size, rgba);
}

function buildIco(pngBuffers, sizes) {
  const count = pngBuffers.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // icon type
  header.writeUInt16LE(count, 4);

  const entries = [];
  let offset = 6 + count * 16;

  for (let i = 0; i < count; i += 1) {
    const entry = Buffer.alloc(16);
    const sz = sizes[i];
    entry[0] = sz >= 256 ? 0 : sz;
    entry[1] = sz >= 256 ? 0 : sz;
    entry[2] = 0;
    entry[3] = 0;
    entry.writeUInt16LE(1, 4); // planes
    entry.writeUInt16LE(32, 6); // bpp
    entry.writeUInt32LE(pngBuffers[i].length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += pngBuffers[i].length;
  }

  return Buffer.concat([header, ...entries, ...pngBuffers]);
}

const icoSizes = [16, 32, 48, 64, 128, 256];
const pngs = icoSizes.map((s) => renderIcon(s));
const ico = buildIco(pngs, icoSizes);

fs.writeFileSync(path.join(buildDir, 'icon.png'), pngs[pngs.length - 1]);
fs.writeFileSync(path.join(buildDir, 'icon.ico'), ico);

console.log('[OK] Generated build/icon.png (256x256) and build/icon.ico (multi-size)');
