#!/usr/bin/env node
// Renders apps/web/src/assets/logo.svg to transparent PNG icons with headless Chrome (CDP, no dependencies).
//   node scripts/brand/render-icons.mjs [path/to/chrome]
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '../..');
const CHROME = process.argv[2] || ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome'].find((p) => fs.existsSync(p));
const svg = fs.readFileSync(path.join(ROOT, 'apps/web/src/assets/logo.svg'), 'utf8');
const targets = [
  ['apps/extension/src/icons/icon16.png', 16], ['apps/extension/src/icons/icon48.png', 48], ['apps/extension/src/icons/icon128.png', 128],
  ['apps/web/public/apple-touch-icon.png', 180], ['apps/web/public/icon-192.png', 192], ['apps/web/public/icon-512.png', 512]
];
const port = 9500 + Math.floor(Math.random() * 90);
const profile = path.join(ROOT, '.e2e-tmp', 'brand-' + Date.now());
const chrome = spawn(CHROME, [`--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, '--headless=new', '--no-first-run', ...(process.env.CI ? ['--no-sandbox'] : []), 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 40; i++) { try { await fetch(`http://127.0.0.1:${port}/json/version`); break; } catch { await sleep(300); } }
const tab = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const dataUrl = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
for (const [file, size] of targets) {
  await send('Emulation.setDeviceMetricsOverride', { width: size, height: size, deviceScaleFactor: 1, mobile: false });
  await send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
  await send('Page.navigate', { url: 'data:text/html;base64,' + Buffer.from(`<!doctype html><style>html,body{margin:0;background:transparent}img{display:block;width:${size}px;height:${size}px}</style><img src="${dataUrl}">`).toString('base64') });
  await sleep(500);
  const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
  fs.writeFileSync(path.join(ROOT, file), Buffer.from(shot.result.data, 'base64'));
  console.log('wrote', file, size);
}
ws.close();
if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(chrome.pid), '/T', '/F'], { stdio: 'ignore' }); else chrome.kill();
try { fs.rmSync(path.join(ROOT, '.e2e-tmp'), { recursive: true, force: true }); } catch {}
