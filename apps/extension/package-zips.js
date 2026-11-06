import fs from 'node:fs';
import path from 'node:path';
import archiver from 'archiver';

const ROOT_DIST = path.resolve('../../dist');

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
