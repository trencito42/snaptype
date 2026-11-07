#!/usr/bin/env node
// Composes store-listing images (1280x800) from the REAL captures made by capture-store-shots.mjs.
//   node scripts/brand/compose-store-shots.mjs [rawDir] [outDir ...]
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '../..');
const RAW = path.resolve(process.argv[2] || path.join(ROOT, '.e2e-tmp', 'raw'));
const OUTS = (process.argv.length > 3 ? process.argv.slice(3) : [path.join(ROOT, 'docs/release/store/chrome'), path.join(ROOT, 'docs/release/store/firefox')]).map((p) => path.resolve(p));
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome'].find((p) => fs.existsSync(p));
const SLIDES_DIR = path.join(ROOT, '.e2e-tmp', 'slides');
fs.mkdirSync(SLIDES_DIR, { recursive: true });

const url = (p) => 'file:///' + p.replace(/\\/g, '/').replace(/^\//, '');
const font = (w) => url(path.join(ROOT, `node_modules/@fontsource/clarity-city/files/clarity-city-latin-${w}-normal.woff2`));
const inter = url(path.join(ROOT, 'node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2'));
const logo = url(path.join(ROOT, 'apps/web/src/assets/logo.svg'));
const raw = (n) => url(path.join(RAW, n + '.png'));

const CSS = `
@font-face { font-family: 'Clarity City'; font-weight: 800; src: url('${font(800)}') format('woff2'); }
@font-face { font-family: 'Clarity City'; font-weight: 700; src: url('${font(700)}') format('woff2'); }
@font-face { font-family: 'Inter'; font-weight: 100 900; src: url('${inter}') format('woff2'); }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: 1280px; height: 800px; overflow: hidden; font-family: 'Inter', system-ui, sans-serif; color: #131412; }
.slide { position: relative; width: 1280px; height: 800px; overflow: hidden; }
.brand { position: absolute; left: 56px; top: 44px; display: flex; align-items: center; gap: 12px; font-family: 'Clarity City'; font-weight: 800; font-size: 28px; letter-spacing: -0.04em; }
.brand img { width: 40px; height: 40px; border-radius: 9px; }
.brand b { color: #1f7a10; }
h1 { font-family: 'Clarity City'; font-weight: 800; letter-spacing: -0.04em; line-height: 1.0; }
p.sub { font-size: 22px; line-height: 1.45; color: #3b3f46; }
.shot { position: absolute; border-radius: 26px; overflow: hidden; background: #fff; box-shadow: 0 30px 80px rgba(19,20,18,.22), 0 0 0 1px rgba(19,20,18,.08); }
.shot img { display: block; width: 100%; }
.chip { position: absolute; font-family: ui-monospace, Consolas, monospace; font-weight: 700; font-size: 20px; padding: 10px 18px; border-radius: 999px; background: #fff; box-shadow: 0 12px 30px rgba(19,20,18,.16); }
.chip.lime { background: #85f66a; color: #10200d; }
`;

const slides = [
  { id: '01-expand', bg: '#e8fde2', html: `
    <div class="brand"><img src="${logo}"><span>snap<b>type</b></span></div>
    <h1 style="position:absolute;left:56px;top:140px;width:1200px;font-size:60px;white-space:nowrap">Type a short code. Send the whole reply.</h1>
    <p class="sub" style="position:absolute;left:56px;top:228px;width:900px">Shortcuts like <b>/late</b> expand into complete, consistent messages in any web text field.</p>
    <div class="shot" style="left:140px;top:320px;width:1000px;height:520px;border-radius:30px 30px 0 0"><img src="${raw('expansion')}" style="margin-top:-110px"></div>
    <div class="chip lime" style="left:70px;top:700px">/late</div>` },
  { id: '02-form', bg: '#f4f5f7', html: `
    <div class="brand"><img src="${logo}"><span>snap<b>type</b></span></div>
    <h1 style="position:absolute;left:56px;top:130px;width:1100px;font-size:76px">Fill in the blanks in seconds.</h1>
    <p class="sub" style="position:absolute;left:56px;top:228px;width:900px">Fields, dropdowns, toggles and dates turn one snippet into many replies.</p>
    <div class="shot" style="left:140px;top:320px;width:1000px;height:520px;border-radius:30px 30px 0 0"><img src="${raw('form')}" style="margin-top:-250px"></div>` },
  { id: '03-assistant', bg: '#131412', html: `
    <div class="brand" style="color:#fff"><img src="${logo}"><span>snap<b style="color:#85f66a">type</b></span></div>
    <h1 style="position:absolute;left:56px;top:130px;width:1100px;font-size:76px;color:#fff">Find any snippet instantly.</h1>
    <p class="sub" style="position:absolute;left:56px;top:228px;width:900px;color:#c9ccd2">Press your hotkey, type a few letters, press Enter.</p>
    <div class="shot" style="left:140px;top:320px;width:1000px;height:520px;border-radius:30px 30px 0 0"><img src="${raw('assistant')}" style="margin-top:-90px"></div>` },
  { id: '04-popup', bg: '#e8fde2', html: `
    <div class="brand"><img src="${logo}"><span>snap<b>type</b></span></div>
    <h1 style="position:absolute;left:56px;top:150px;width:640px;font-size:80px">Your whole library, one click away.</h1>
    <p class="sub" style="position:absolute;left:56px;top:400px;width:520px">Search, insert or copy any snippet from the toolbar popup. Switch workspaces in one click.</p>
    <div class="shot" style="left:790px;top:80px;width:372px;height:640px;border-radius:34px"><img src="${raw('popup')}" style="height:100%;object-fit:cover;object-position:top"></div>` },
  { id: '05-dashboard', bg: '#f4f5f7', html: `
    <div class="brand"><img src="${logo}"><span>snap<b>type</b></span></div>
    <h1 style="position:absolute;left:56px;top:130px;width:1100px;font-size:76px">Write it once. Keep it organised.</h1>
    <p class="sub" style="position:absolute;left:56px;top:228px;width:900px">Folders, tags, revision history and live preview in the dashboard.</p>
    <div class="shot" style="left:140px;top:320px;width:1000px;height:520px;border-radius:30px 30px 0 0"><img src="${raw('dashboard')}"></div>` },
  { id: '06-settings', bg: '#e8fde2', html: `
    <div class="brand"><img src="${logo}"><span>snap<b>type</b></span></div>
    <h1 style="position:absolute;left:56px;top:130px;width:1100px;font-size:76px">Make it work your way.</h1>
    <p class="sub" style="position:absolute;left:56px;top:228px;width:900px">Record your own hotkey, choose when shortcuts expand, and skip sensitive sites.</p>
    <div class="shot" style="left:140px;top:320px;width:1000px;height:520px;border-radius:30px 30px 0 0"><img src="${raw('settings')}" style="margin-top:-60px"></div>` }
];

const port = 9900 + Math.floor(Math.random() * 90);
const profile = path.join(ROOT, '.e2e-tmp', 'compose-' + Date.now());
const chrome = spawn(CHROME, [`--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, '--headless=new', '--allow-file-access-from-files', '--no-first-run', ...(process.env.CI ? ['--no-sandbox'] : []), 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 40; i++) { try { await fetch(`http://127.0.0.1:${port}/json/version`); break; } catch { await sleep(300); } }
const tab = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });

for (const o of OUTS) fs.mkdirSync(o, { recursive: true });
for (const s of slides) {
  const file = path.join(SLIDES_DIR, s.id + '.html');
  fs.writeFileSync(file, `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body><div class="slide" style="background:${s.bg}">${s.html}</div></body></html>`);
  await send('Page.navigate', { url: url(file) });
  await sleep(1200);
  await send('Runtime.evaluate', { expression: 'document.fonts.ready.then(() => true)', awaitPromise: true });
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  for (const o of OUTS) fs.writeFileSync(path.join(o, s.id + '.png'), Buffer.from(shot.result.data, 'base64'));
  console.log('slide', s.id);
}
ws.close();
if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(chrome.pid), '/T', '/F'], { stdio: 'ignore' }); else chrome.kill();
try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
