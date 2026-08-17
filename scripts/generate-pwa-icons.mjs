import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

// Minimal standalone PNG encoder using pure Node.js (zlib + Buffer)
function createPng(width, height, getPixelRGBA) {
  // 1. Signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // 2. IHDR Chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8); // 8 bits per channel
  ihdrData.writeUInt8(6, 9); // RGBA color type
  ihdrData.writeUInt8(0, 10); // Compression method
  ihdrData.writeUInt8(0, 11); // Filter method
  ihdrData.writeUInt8(0, 12); // Interlace method
  const ihdrChunk = createChunk('IHDR', ihdrData);

  // 3. IDAT Chunk (Raw scanlines with 0 filter byte prefix)
  const scanlineLength = width * 4 + 1;
  const rawData = Buffer.alloc(height * scanlineLength);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * scanlineLength;
    rawData.writeUInt8(0, rowOffset); // Filter type 0 (None)
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = getPixelRGBA(x, y, width, height);
      const pixelOffset = rowOffset + 1 + x * 4;
      rawData.writeUInt8(r, pixelOffset);
      rawData.writeUInt8(g, pixelOffset + 1);
      rawData.writeUInt8(b, pixelOffset + 2);
      rawData.writeUInt8(a, pixelOffset + 3);
    }
  }

  const compressedData = zlib.deflateSync(rawData);
  const idatChunk = createChunk('IDAT', compressedData);

  // 4. IEND Chunk
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

// CRC32 implementation for PNG chunks
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c;
}

function calcCrc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function createChunk(type, data) {
  const len = data.length;
  const header = Buffer.alloc(8);
  header.writeUInt32BE(len, 0);
  header.write(type, 4, 4, 'ascii');

  const chunkPayload = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = calcCrc32(chunkPayload);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc, 0);

  return Buffer.concat([header.subarray(0, 4), chunkPayload, crcBuf]);
}

// Procedural HashiBot Icon Generator
function renderPixel(x, y, w, h, isMaskable = false) {
  const nx = x / w;
  const ny = y / h;
  const cx = 0.5;
  const cy = 0.5;
  const distCenter = Math.sqrt((nx - cx) ** 2 + (ny - cy) ** 2);

  // Corner radius for standard icon
  if (!isMaskable) {
    const rx = 0.22;
    const dx = Math.max(0, Math.abs(nx - 0.5) - (0.5 - rx));
    const dy = Math.max(0, Math.abs(ny - 0.5) - (0.5 - rx));
    const distCorner = Math.sqrt(dx * dx + dy * dy);
    if (distCorner > rx) {
      return [0, 0, 0, 0]; // Transparent outside rounded corner
    }
  }

  // Dark slate-to-zinc gradient background
  let bgR = Math.round(9 + 12 * (1 - ny));
  let bgG = Math.round(9 + 18 * (1 - ny));
  let bgB = Math.round(15 + 35 * (1 - ny));

  // Radial glow in the center
  const glow = Math.max(0, 1 - distCenter / 0.45);
  bgR = Math.min(255, Math.round(bgR + glow * 25));
  bgG = Math.min(255, Math.round(bgG + glow * 60));
  bgB = Math.min(255, Math.round(bgB + glow * 150));

  // Scale coordinates inside safe area
  const scale = isMaskable ? 0.8 : 0.9;
  const sx = (nx - 0.5) / scale + 0.5;
  const sy = (ny - 0.5) / scale + 0.5;

  // Hexagon shield outline check
  const hx = Math.abs(sx - 0.5);
  const hy = sy - 0.5;
  const inShield = hx <= 0.26 && hy >= -0.28 && hy <= 0.28 && (hx * 1.5 + Math.abs(hy) <= 0.42);
  const onShieldBorder = inShield && (hx >= 0.23 || (hx * 1.5 + Math.abs(hy) >= 0.38));

  if (onShieldBorder) {
    return [59, 130, 246, 255]; // Royal blue border
  }

  if (inShield) {
    bgR = Math.round(bgR * 0.7 + 24 * 0.3);
    bgG = Math.round(bgG * 0.7 + 24 * 0.3);
    bgB = Math.round(bgB * 0.7 + 38 * 0.3);
  }

  // Stylized Lightning / Monogram Zap inside
  // Top segment: (0.54, 0.28) -> (0.36, 0.53) -> (0.48, 0.53) -> (0.44, 0.72) -> (0.64, 0.47) -> (0.52, 0.47) -> (0.54, 0.28)
  const isZap = pointInPolygon([sx, sy], [
    [0.54, 0.28],
    [0.36, 0.53],
    [0.48, 0.53],
    [0.44, 0.72],
    [0.64, 0.47],
    [0.52, 0.47]
  ]);

  if (isZap) {
    const zapGlow = (sy - 0.28) / (0.72 - 0.28);
    const zR = Math.round(96 - zapGlow * 40);
    const zG = Math.round(165 - zapGlow * 40);
    const zB = Math.round(250 - zapGlow * 10);
    return [zR, zG, zB, 255];
  }

  // Accent border line around icon (for non-maskable)
  if (!isMaskable) {
    const edgeDist = Math.min(nx, 1 - nx, ny, 1 - ny);
    if (edgeDist < 0.012 && edgeDist >= 0.004) {
      bgR = Math.min(255, bgR + 40);
      bgG = Math.min(255, bgG + 70);
      bgB = Math.min(255, bgB + 130);
    }
  }

  return [bgR, bgG, bgB, 255];
}

function pointInPolygon(point, vs) {
  const x = point[0], y = point[1];
  let inside = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const xi = vs[i][0], yi = vs[i][1];
    const xj = vs[j][0], yj = vs[j][1];
    const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

// Generate all target icon sizes
const targetDir = path.resolve(process.cwd(), 'public', 'icons');
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

console.log('Generating PWA Icons in:', targetDir);

// 1. icon-192.png
fs.writeFileSync(
  path.join(targetDir, 'icon-192.png'),
  createPng(192, 192, (x, y, w, h) => renderPixel(x, y, w, h, false))
);

// 2. icon-512.png
fs.writeFileSync(
  path.join(targetDir, 'icon-512.png'),
  createPng(512, 512, (x, y, w, h) => renderPixel(x, y, w, h, false))
);

// 3. icon-maskable-192.png
fs.writeFileSync(
  path.join(targetDir, 'icon-maskable-192.png'),
  createPng(192, 192, (x, y, w, h) => renderPixel(x, y, w, h, true))
);

// 4. icon-maskable-512.png
fs.writeFileSync(
  path.join(targetDir, 'icon-maskable-512.png'),
  createPng(512, 512, (x, y, w, h) => renderPixel(x, y, w, h, true))
);

// 5. apple-touch-icon.png (180x180)
fs.writeFileSync(
  path.join(targetDir, 'apple-touch-icon.png'),
  createPng(180, 180, (x, y, w, h) => renderPixel(x, y, w, h, false))
);

console.log('Successfully generated all PWA PNG icons!');
