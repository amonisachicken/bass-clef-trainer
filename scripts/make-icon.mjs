// 生成 Tauri 三平台应用图标（纯 Node 标准库，无第三方依赖）。
//
// 用法: node scripts/make-icon.mjs
// 输出到 src-tauri/icons/：
//   32x32.png / 128x128.png / 128x128@2x.png / icon.png(512) / icon.ico / icon.icns
//
// 图形：深蓝渐变背景 + 白色五线谱 + 一个符头与两个 F 谱号点。

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src-tauri', 'icons');
mkdirSync(OUT, { recursive: true });

const SS = 4; // 超采样倍数（抗锯齿）

/** 绘制 size×size 的 RGBA 像素数组。 */
function draw(size) {
  const S = size * SS;
  const buf = new Float32Array(S * S * 4);
  const cx = S / 2;
  const cy = S / 2;

  // 竖向渐变背景
  for (let y = 0; y < S; y++) {
    const t = y / S;
    const r = 16 + 16 * t;
    const g = 22 + 18 * t;
    const b = 40 + 24 * t;
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      buf[i] = r;
      buf[i + 1] = g;
      buf[i + 2] = b;
      buf[i + 3] = 255;
    }
  }

  // 五线
  const lineH = Math.max(1, S * 0.012);
  const lineGap = S * 0.05;
  for (let k = -2; k <= 2; k++) {
    fillRect(buf, S, 0, cy + k * lineGap - lineH / 2, S, lineH, 224, 231, 251, 190);
  }
  // 符头（白色椭圆）
  ellipse(buf, S, cx, cy, S * 0.19, S * 0.12, 236, 241, 255, 255);
  // F 谱号两个点
  const fy = cy + lineGap * 0.4;
  circle(buf, S, cx - S * 0.22, fy - S * 0.055, S * 0.022, 236, 241, 255, 255);
  circle(buf, S, cx - S * 0.22, fy + S * 0.055, S * 0.022, 236, 241, 255, 255);

  // 超采样降采样
  const px = new Float32Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const i = ((y * SS + sy) * S + (x * SS + sx)) * 4;
          r += buf[i];
          g += buf[i + 1];
          b += buf[i + 2];
          a += buf[i + 3];
        }
      }
      const n = SS * SS;
      const i = (y * size + x) * 4;
      px[i] = r / n;
      px[i + 1] = g / n;
      px[i + 2] = b / n;
      px[i + 3] = a / n;
    }
  }
  return px;
}

function fillRect(buf, S, x0, y0, w, h, r, g, b, a) {
  const xa = Math.max(0, Math.floor(x0));
  const ya = Math.max(0, Math.floor(y0));
  const x1 = Math.min(S, Math.ceil(x0 + w));
  const y1 = Math.min(S, Math.ceil(y0 + h));
  for (let y = ya; y < y1; y++) {
    for (let x = xa; x < x1; x++) {
      const i = (y * S + x) * 4;
      buf[i] = r;
      buf[i + 1] = g;
      buf[i + 2] = b;
      buf[i + 3] = a;
    }
  }
}

function ellipse(buf, S, cx, cy, rx, ry, r, g, b, a) {
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1) {
        const i = (y * S + x) * 4;
        buf[i] = r;
        buf[i + 1] = g;
        buf[i + 2] = b;
        buf[i + 3] = a;
      }
    }
  }
}

function circle(buf, S, cx, cy, r, cr, cg, cb, ca) {
  const r2 = r * r;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r2) {
        const i = (y * S + x) * 4;
        buf[i] = cr;
        buf[i + 1] = cg;
        buf[i + 2] = cb;
        buf[i + 3] = ca;
      }
    }
  }
}

// ---------- PNG 编码 ----------

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(size, px) {
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(size * stride);
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const o = y * stride + 1 + x * 4;
      raw[o] = Math.round(px[i]);
      raw[o + 1] = Math.round(px[i + 1]);
      raw[o + 2] = Math.round(px[i + 2]);
      raw[o + 3] = Math.round(px[i + 3]);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- ICO（Windows，内嵌 256 PNG） ----------

function encodeIco(png256) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // count
  const entry = Buffer.alloc(16);
  entry[0] = 0; // 256 → 0
  entry[1] = 0;
  entry[2] = 0;
  entry[3] = 0;
  entry.writeUInt16LE(1, 4); // planes
  entry.writeUInt16LE(32, 6); // bpp
  entry.writeUInt32LE(png256.length, 8);
  entry.writeUInt32LE(22, 12); // offset
  return Buffer.concat([header, entry, png256]);
}

// ---------- ICNS（macOS，PNG 块） ----------

function encodeIcns(pngs) {
  const chunks = [];
  for (const { type, png } of pngs) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(8 + png.length);
    chunks.push(Buffer.concat([Buffer.from(type, 'ascii'), len, png]));
  }
  const total = Buffer.alloc(4);
  total.writeUInt32BE(8 + chunks.reduce((s, c) => s + c.length, 0));
  return Buffer.concat([Buffer.from('icns', 'ascii'), total, ...chunks]);
}

// ---------- 输出 ----------

const pngs = {};
for (const s of [32, 128, 256, 512, 1024]) {
  pngs[s] = encodePng(s, draw(s));
}

writeFileSync(join(OUT, '32x32.png'), pngs[32]);
writeFileSync(join(OUT, '128x128.png'), pngs[128]);
writeFileSync(join(OUT, '128x128@2x.png'), pngs[256]);
writeFileSync(join(OUT, 'icon.png'), pngs[512]);
writeFileSync(join(OUT, 'icon.ico'), encodeIco(pngs[256]));
writeFileSync(
  join(OUT, 'icon.icns'),
  encodeIcns([
    { type: 'ic07', png: pngs[128] },
    { type: 'ic08', png: pngs[256] },
    { type: 'ic09', png: pngs[512] },
    { type: 'ic10', png: pngs[1024] },
  ]),
);

console.log('图标已生成 →', OUT);
