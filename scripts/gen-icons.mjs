// Generates simple PNG icons (rounded square with a "herd" of three bars) without dependencies.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function draw(size) {
  const r = size * 0.22;
  const bg = [37, 99, 235];
  const bars = [[96, 165, 250], [52, 211, 153], [251, 191, 36]];
  return (x, y) => {
    const cx = Math.min(Math.max(x + 0.5, r), size - r);
    const cy = Math.min(Math.max(y + 0.5, r), size - r);
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
    if (d > r) return [0, 0, 0, 0];
    const aa = Math.min(1, r - d);
    const pad = size * 0.2;
    const barH = (size - pad * 2) / 5;
    for (let i = 0; i < 3; i++) {
      const top = pad + i * barH * 2;
      const left = pad + (i === 1 ? size * 0.12 : 0);
      if (y >= top && y < top + barH && x >= left && x < size - pad) {
        return [...bars[i], Math.round(255 * aa)];
      }
    }
    return [...bg, Math.round(255 * aa)];
  };
}

mkdirSync('public/icons', { recursive: true });
for (const s of [16, 32, 48, 128]) {
  writeFileSync(`public/icons/icon-${s}.png`, png(s, draw(s)));
  console.log(`wrote public/icons/icon-${s}.png`);
}
// Chrome Web Store listing icon: 128 px canvas with 96 px artwork and 16 px transparent padding.
mkdirSync('release', { recursive: true });
const inner = draw(96);
writeFileSync('release/store-icon-128.png', png(128, (x, y) => (x < 16 || y < 16 || x >= 112 || y >= 112) ? [0, 0, 0, 0] : inner(x - 16, y - 16)));
console.log('wrote release/store-icon-128.png');
