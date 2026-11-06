import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

// Standard IEEE 802.3 CRC32 implementation
const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[i] = c;
}

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function createChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);

  const toCrc = Buffer.concat([typeBuf, data]);
  const crcVal = crc32(toCrc);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crcVal, 0);

  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function generateIconPNG(size) {
  // RGBA buffer: (1 filter byte + size * 4) * size
  const rawData = Buffer.alloc((1 + size * 4) * size);

  // Brand colors:
  // Lime green background: #85F66A (133, 246, 106)
  // Dark ink lightning bolt: #101110 (16, 17, 16)
  const bgR = 133, bgG = 246, bgB = 106;
  const fgR = 16, fgG = 17, fgB = 16;
  const cornerRadius = size * 0.22;

  let offset = 0;
  for (let y = 0; y < size; y++) {
    rawData[offset++] = 0; // Filter type 0 (None)

    for (let x = 0; x < size; x++) {
      // Check rounded rect corner distance
      const dx = Math.min(x, size - 1 - x);
      const dy = Math.min(y, size - 1 - y);
      let isInsideBg = true;

      if (dx < cornerRadius && dy < cornerRadius) {
        const dist = Math.hypot(cornerRadius - dx, cornerRadius - dy);
        if (dist > cornerRadius) {
          isInsideBg = false;
        }
      }

      if (!isInsideBg) {
        // Transparent pixel
        rawData[offset++] = 0;
        rawData[offset++] = 0;
        rawData[offset++] = 0;
        rawData[offset++] = 0;
        continue;
      }

      // Check if pixel is inside the lightning bolt shape
      // Normalized coordinates (0.0 to 1.0)
      const nx = x / size;
      const ny = y / size;

      let isBolt = false;

      // Lightning bolt polygon points roughly:
      // Top: (0.55, 0.18) -> (0.32, 0.52) -> (0.50, 0.52) -> (0.42, 0.82) -> (0.72, 0.44) -> (0.54, 0.44) -> back to top
      // Fast point-in-polygon algorithm:
      const boltPoly = [
        [0.56, 0.16],
        [0.32, 0.52],
        [0.50, 0.52],
        [0.42, 0.84],
        [0.72, 0.44],
        [0.54, 0.44]
      ];

      let inside = false;
      for (let i = 0, j = boltPoly.length - 1; i < boltPoly.length; j = i++) {
        const xi = boltPoly[i][0], yi = boltPoly[i][1];
        const xj = boltPoly[j][0], yj = boltPoly[j][1];

        const intersect = ((yi > ny) !== (yj > ny)) &&
          (nx < (xj - xi) * (ny - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
      }

      if (inside) {
        // Bolt pixel (Dark Ink)
        rawData[offset++] = fgR;
        rawData[offset++] = fgG;
        rawData[offset++] = fgB;
        rawData[offset++] = 255;
      } else {
        // Background pixel (Vibrant Lime Green)
        rawData[offset++] = bgR;
        rawData[offset++] = bgG;
        rawData[offset++] = bgB;
        rawData[offset++] = 255;
      }
    }
  }

  // PNG Signature
  const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

  // IHDR Chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); // width
  ihdr.writeUInt32BE(size, 4); // height
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; // compression method
  ihdr[11] = 0; // filter method
  ihdr[12] = 0; // interlace method
  const ihdrChunk = createChunk('IHDR', ihdr);

  // IDAT Chunk
  const compressed = zlib.deflateSync(rawData);
  const idatChunk = createChunk('IDAT', compressed);

  // IEND Chunk
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

const iconDir = path.resolve('src/icons');
fs.mkdirSync(iconDir, { recursive: true });

for (const size of [16, 48, 128]) {
  const pngBuf = generateIconPNG(size);
  const targetPath = path.join(iconDir, `icon${size}.png`);
  fs.writeFileSync(targetPath, pngBuf);
  console.log(`Generated crisp ${size}x${size} icon (${pngBuf.length} bytes) at ${targetPath}`);
}

console.log('High-resolution extension icons successfully generated.');
