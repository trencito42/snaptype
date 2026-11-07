import fs from 'node:fs';
import path from 'node:path';
import archiver from 'archiver';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIST = path.resolve(__dirname, '../../dist');

const args = process.argv.slice(2);
const isProduction = args.includes('--production') || process.env.NODE_ENV === 'production';

function verifyTargetNotLocalhost(targetDir) {
  const manifestPath = path.join(targetDir, 'manifest.json');
  if (fs.existsSync(manifestPath)) {
    const raw = fs.readFileSync(manifestPath, 'utf-8');
    const parsed = JSON.parse(raw);
    for (const perm of parsed.host_permissions || []) {
      if (perm.includes('localhost') || perm.includes('127.0.0.1')) {
        throw new Error(`Production release package in ${path.basename(targetDir)} contains illegal loopback permission: ${perm}`);
      }
    }
  }
}

function zipDirectory(sourceDir, outPath) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      console.log(`📦 Generated ${path.basename(outPath)}: ${(archive.pointer() / 1024).toFixed(1)} KB`);
      resolve();
    });

    archive.on('error', (err) => reject(err));
    archive.pipe(output);
    archive.directory(sourceDir, false);
    archive.finalize();
  });
}

async function packageAll() {
  console.log('\n📦 Packaging extension release archives...');

  const chromeDir = path.join(ROOT_DIST, 'chrome');
  const firefoxDir = path.join(ROOT_DIST, 'firefox');

  if (isProduction) {
    if (fs.existsSync(chromeDir)) verifyTargetNotLocalhost(chromeDir);
    if (fs.existsSync(firefoxDir)) verifyTargetNotLocalhost(firefoxDir);
  }

  if (fs.existsSync(chromeDir)) {
    await zipDirectory(chromeDir, path.join(ROOT_DIST, 'chrome-extension.zip'));
  }

  if (fs.existsSync(firefoxDir)) {
    await zipDirectory(firefoxDir, path.join(ROOT_DIST, 'firefox-extension.zip'));
  }

  console.log('🎉 Packaging complete.');
}

packageAll().catch((err) => {
  console.error('Packaging error:', err);
  process.exit(1);
});
