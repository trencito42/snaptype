import fs from 'node:fs';
import path from 'node:path';

// Minimal valid 1x1 green PNG data URI, scalable
const base64Png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const buffer = Buffer.from(base64Png, 'base64');

const iconDir = path.resolve('src/icons');
fs.mkdirSync(iconDir, { recursive: true });

fs.writeFileSync(path.join(iconDir, 'icon16.png'), buffer);
fs.writeFileSync(path.join(iconDir, 'icon48.png'), buffer);
fs.writeFileSync(path.join(iconDir, 'icon128.png'), buffer);

console.log('Extension icons created.');
