import esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const args = process.argv.slice(2);
const targetArg = args.find((a) => a.startsWith('--target='));
const targets = targetArg ? [targetArg.split('=')[1]] : ['chrome', 'firefox'];

const ROOT_DIST = path.resolve('../../dist');

async function buildTarget(target) {
  const outDir = path.join(ROOT_DIST, target);
  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(path.join(outDir, 'icons'), { recursive: true });

  console.log(`\n🔨 Building SnapType Extension for [${target.toUpperCase()}]...`);

  // 1. Build background script
  // Note: Chrome MV3 supports module or service_worker, Firefox MV3 scripts
  await esbuild.build({
    entryPoints: ['src/background/background.ts'],
    outfile: path.join(outDir, 'background.js'),
    bundle: true,
    minify: true,
    format: target === 'chrome' ? 'esm' : 'iife',
    platform: 'browser',
    target: ['es2022']
  });

  // 2. Build content script (IIFE)
  await esbuild.build({
    entryPoints: ['src/content/content.ts'],
    outfile: path.join(outDir, 'content.js'),
    bundle: true,
    minify: true,
    format: 'iife',
    platform: 'browser',
    target: ['es2022']
  });

  // 3. Build popup script
  await esbuild.build({
    entryPoints: ['src/popup/popup.ts'],
    outfile: path.join(outDir, 'popup.js'),
    bundle: true,
    minify: true,
    format: 'esm',
    platform: 'browser',
    target: ['es2022']
  });

  // 4. Copy manifest
  const manifestFile = target === 'chrome' ? 'src/manifest.chrome.json' : 'src/manifest.firefox.json';
  fs.copyFileSync(manifestFile, path.join(outDir, 'manifest.json'));

  // 5. Copy CSS & HTML
  fs.copyFileSync('src/content/content.css', path.join(outDir, 'content.css'));
  fs.copyFileSync('src/popup/popup.html', path.join(outDir, 'popup.html'));
  fs.copyFileSync('src/popup/popup.css', path.join(outDir, 'popup.css'));

  // 6. Copy Icons
  const iconSrcDir = path.resolve('src/icons');
  if (fs.existsSync(iconSrcDir)) {
    for (const icon of ['icon16.png', 'icon48.png', 'icon128.png']) {
      const srcIcon = path.join(iconSrcDir, icon);
      if (fs.existsSync(srcIcon)) {
        fs.copyFileSync(srcIcon, path.join(outDir, 'icons', icon));
      }
    }
  }

  // 7. Measure bundle performance
  const contentJs = fs.readFileSync(path.join(outDir, 'content.js'));
  const gzipped = zlib.gzipSync(contentJs);
  console.log(`✅ [${target}] content.js: ${(contentJs.length / 1024).toFixed(1)} KB (gzipped: ${(gzipped.length / 1024).toFixed(1)} KB)`);
  console.log(`📦 Manifest validated: ${path.join(outDir, 'manifest.json')}`);
}

async function run() {
  for (const t of targets) {
    await buildTarget(t);
  }
}

run().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});

