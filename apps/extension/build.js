import esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EXT_SRC = path.resolve(__dirname, 'src');
const outDirArg = process.argv.slice(2).find((a) => a.startsWith('--out-dir='));
const ROOT_DIST = outDirArg ? path.resolve(outDirArg.split('=')[1]) : path.resolve(__dirname, '../../dist');
const EXT_VERSION = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf-8')).version;

const args = process.argv.slice(2);
const isProduction = args.includes('--production') || process.env.NODE_ENV === 'production';
const targetArg = args.find((a) => a.startsWith('--target='));
const targets = targetArg ? [targetArg.split('=')[1]] : ['chrome', 'firefox'];

const apiUrlArg = args.find((a) => a.startsWith('--api-url='));
const appUrlArg = args.find((a) => a.startsWith('--app-url='));

let API_URL = (apiUrlArg ? apiUrlArg.split('=')[1] : null) || process.env.SNAPTYPE_API_URL;
let APP_URL = (appUrlArg ? appUrlArg.split('=')[1] : null) || process.env.SNAPTYPE_APP_URL;

if (isProduction) {
  // No invented defaults: a production package must point at infrastructure the owner configured.
  if (!API_URL || !APP_URL) {
    throw new Error('Production build requires SNAPTYPE_API_URL (e.g. https://host/api/v1) and SNAPTYPE_APP_URL (e.g. https://host).');
  }
  for (const [label, value] of [['API', API_URL], ['App', APP_URL]]) {
    let u;
    try { u = new URL(value); } catch { throw new Error(`Production ${label} URL is not a valid URL: ${value}`); }
    if (u.protocol !== 'https:') throw new Error(`Production ${label} URL must use https: ${value}`);
    if (['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)) {
      throw new Error(`Production extension release cannot use loopback or localhost address: ${value}`);
    }
  }
} else {
  if (!API_URL) API_URL = 'http://localhost:3000/api/v1';
  if (!APP_URL) APP_URL = 'http://localhost:5173';
}

async function buildTarget(target) {
  const outDir = path.join(ROOT_DIST, target);
  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(path.join(outDir, 'icons'), { recursive: true });

  console.log(`\n🔨 Building SnapType Extension for [${target.toUpperCase()}]...`);
  console.log(`📡 Configured API Origin: ${API_URL}`);
  console.log(`🖥️  Configured App Origin: ${APP_URL}`);

  const defines = {
    '__SNAPTYPE_API_URL__': JSON.stringify(API_URL),
    '__SNAPTYPE_APP_URL__': JSON.stringify(APP_URL)
  };

  // 1. Build background script
  await esbuild.build({
    entryPoints: [path.join(EXT_SRC, 'background/background.ts')],
    outfile: path.join(outDir, 'background.js'),
    bundle: true,
    minify: true,
    define: defines,
    format: target === 'chrome' ? 'esm' : 'iife',
    platform: 'browser',
    target: ['es2022']
  });

  // 2. Build content script (IIFE)
  await esbuild.build({
    entryPoints: [path.join(EXT_SRC, 'content/content.ts')],
    outfile: path.join(outDir, 'content.js'),
    bundle: true,
    minify: true,
    define: defines,
    format: 'iife',
    platform: 'browser',
    target: ['es2022']
  });

  // 3. Build popup script
  await esbuild.build({
    entryPoints: [path.join(EXT_SRC, 'popup/popup.ts')],
    outfile: path.join(outDir, 'popup.js'),
    bundle: true,
    minify: true,
    define: defines,
    format: 'esm',
    platform: 'browser',
    target: ['es2022']
  });

  // 4. Generate dynamic manifest with appropriate host permissions
  const manifestFile = path.join(EXT_SRC, target === 'chrome' ? 'manifest.chrome.json' : 'manifest.firefox.json');
  const manifestRaw = fs.readFileSync(manifestFile, 'utf-8');
  const manifest = JSON.parse(manifestRaw);

  manifest.version = EXT_VERSION; // single source of truth: apps/extension/package.json
  manifest.host_permissions = manifest.host_permissions || [];
  if (isProduction) {
    manifest.host_permissions = manifest.host_permissions.filter(
      (h) => !h.includes('localhost') && !h.includes('127.0.0.1')
    );
  }

  // Extract base origin from API_URL (e.g. https://api.snaptype.com/*)
  try {
    const urlObj = new URL(API_URL);
    const hostPattern = `${urlObj.origin}/*`;
    if (!manifest.host_permissions.includes(hostPattern)) {
      manifest.host_permissions.push(hostPattern);
    }
  } catch (err) {
    throw new Error(`Cannot derive host permission from API URL ${API_URL}: ${err.message}`);
  }

  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  // 5. Copy CSS & HTML
  fs.copyFileSync(path.join(EXT_SRC, 'content/content.css'), path.join(outDir, 'content.css'));
  fs.copyFileSync(path.join(EXT_SRC, 'popup/popup.html'), path.join(outDir, 'popup.html'));
  fs.copyFileSync(path.join(EXT_SRC, 'popup/popup.css'), path.join(outDir, 'popup.css'));

  const fontsDir = path.join(outDir, 'fonts');
  fs.mkdirSync(fontsDir, { recursive: true });
  const monoRoot = path.resolve(__dirname, '../..');
  const interFont = path.join(monoRoot, 'node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2');
  const clarityFont = path.join(monoRoot, 'node_modules/@fontsource/clarity-city/files/clarity-city-latin-800-normal.woff2');
  const logoSvg = path.join(monoRoot, 'apps/web/src/assets/logo.svg');
  if (!fs.existsSync(interFont) || !fs.existsSync(clarityFont)) {
    throw new Error('Popup fonts missing. From repo root run: npm install (needs @fontsource-variable/inter and @fontsource/clarity-city).');
  }
  fs.copyFileSync(interFont, path.join(fontsDir, 'inter.woff2'));
  fs.copyFileSync(clarityFont, path.join(fontsDir, 'clarity-display.woff2'));
  const assetsDir = path.join(outDir, 'assets');
  fs.mkdirSync(assetsDir, { recursive: true });
  if (!fs.existsSync(logoSvg)) {
    throw new Error(`Missing approved logo at ${logoSvg}`);
  }
  fs.copyFileSync(logoSvg, path.join(assetsDir, 'logo.svg'));

  // 6. Copy Icons
  const iconSrcDir = path.join(EXT_SRC, 'icons');
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
