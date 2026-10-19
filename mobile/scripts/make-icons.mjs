// Draws the Labless app icon (a loupe over report lines, with a red pen mark) as PNG files.
// No dependencies: shapes are rendered with analytic anti-aliasing and encoded with zlib.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "assets", "images");

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const INK = hex("#121212");
const PEN = hex("#D2261C");
const RULE = hex("#CFCFC8");
const WHITE = hex("#FFFFFF");

function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Shapes in a 1024 design space: each returns signed distance (negative inside). */
function shapes(scale, offset) {
  const s = (v) => v * scale + offset;
  const k = scale;
  return [
    { color: WHITE, sd: (x, y) => Math.hypot(x - s(430), y - s(430)) - 222 * k }, // lens glass
    { color: RULE, sd: (x, y) => segDist(x, y, s(315), s(355), s(545), s(355)) - 15 * k },
    { color: RULE, sd: (x, y) => segDist(x, y, s(315), s(520), s(470), s(520)) - 15 * k },
    { color: PEN, sd: (x, y) => segDist(x, y, s(300), s(452), s(575), s(425)) - 22 * k },
    { color: INK, sd: (x, y) => Math.abs(Math.hypot(x - s(430), y - s(430)) - 250 * k) - 30 * k }, // ring
    { color: INK, sd: (x, y) => segDist(x, y, s(625), s(625), s(830), s(830)) - 48 * k }, // handle
  ];
}

function render(size, { bg = null, scale = 1, offset = 0, mono = false } = {}) {
  const f = size / 1024;
  const list = shapes(scale * f, offset * f);
  const px = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      if (bg) [r, g, b, a] = [...bg, 255];
      for (const sh of list) {
        const cov = Math.max(0, Math.min(1, 0.5 - sh.sd(x + 0.5, y + 0.5)));
        if (!cov) continue;
        const [cr, cg, cb] = mono ? [255, 255, 255] : sh.color;
        if (mono && sh.color === WHITE) continue;
        const na = cov + (a / 255) * (1 - cov);
        r = (cr * cov + r * (a / 255) * (1 - cov)) / (na || 1);
        g = (cg * cov + g * (a / 255) * (1 - cov)) / (na || 1);
        b = (cb * cov + b * (a / 255) * (1 - cov)) / (na || 1);
        a = na * 255;
      }
      const i = (y * size + x) * 4;
      px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = a;
    }
  }
  return px;
}

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function png(size, rgba) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const write = (name, size, opts) => {
  fs.writeFileSync(path.join(out, name), png(size, render(size, opts)));
  console.log("wrote", name);
};

// iOS / default icon: full-bleed white with the loupe centered slightly up-left.
write("icon.png", 1024, { bg: WHITE, scale: 0.86, offset: 70 });
// Android adaptive: foreground in the 66% safe zone, background plain white.
write("android-icon-foreground.png", 1024, { scale: 0.58, offset: 215 });
write("android-icon-monochrome.png", 1024, { scale: 0.58, offset: 215, mono: true });
fs.writeFileSync(path.join(out, "android-icon-background.png"), png(1024, (() => { const p = new Uint8Array(1024 * 1024 * 4); p.fill(255); return p; })()));
console.log("wrote android-icon-background.png");
// Splash and favicon.
write("splash-icon.png", 512, { scale: 0.9, offset: 40 });
write("favicon.png", 64, { bg: WHITE, scale: 0.86, offset: 70 });
