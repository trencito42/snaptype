#!/usr/bin/env node
// Measures the real extension in real Chrome with 100 / 1000 / 5000 snippets (throw-away in-memory API).
//   node scripts/e2e/chrome-extension-perf.mjs [path/to/chrome]
// Reports: sync payload size, service-worker and page JS heap, end-to-end expansion latency
// (CDP key event -> replaced text; includes CDP round-trip overhead, so it is an UPPER bound), idle CPU.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '../..');
const CHROME = process.argv[2] || ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome'].find((p) => fs.existsSync(p));
const API_PORT = 3300, PAGE_PORT = 8199, DBG = 9400 + Math.floor(Math.random() * 90);
const API = `http://127.0.0.1:${API_PORT}/api/v1`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// fixed-width, letters-only shortcuts (no prefix collisions): zz + 4 letters
const code4 = (n) => { let x = n, o = ''; for (let k = 0; k < 4; k++) { o = String.fromCharCode(97 + (x % 26)) + o; x = Math.floor(x / 26); } return 'zz' + o; };
const procs = [];
const kill = (p) => { try { if (process.platform === 'win32' && p.pid) spawnSync('taskkill', ['/pid', String(p.pid), '/T', '/F'], { stdio: 'ignore' }); else p.kill(); } catch {} };
const cleanup = () => { procs.forEach(kill); try { fs.rmSync(path.join(ROOT, '.e2e-tmp'), { recursive: true, force: true }); } catch {} };
process.on('exit', cleanup);

try { await fetch(`http://127.0.0.1:${API_PORT}/health`); console.error('API port busy'); process.exit(2); } catch {}
const extOut = path.join(ROOT, '.e2e-tmp', 'perf-' + Date.now());
spawnSync('node', ['apps/extension/build.js', '--target=chrome', `--out-dir=${extOut}`, `--api-url=http://127.0.0.1:${API_PORT}/api/v1`, '--app-url=http://localhost:5173'], { cwd: ROOT, stdio: 'ignore' });
const extDir = path.join(extOut, 'chrome');

let log = '';
const api = spawn('npx', ['tsx', 'apps/api/src/server.ts'], { cwd: ROOT, shell: true, env: { ...process.env, PORT: String(API_PORT), HOST: '127.0.0.1', NODE_ENV: '', DATABASE_URL: '' } });
procs.push(api); api.stdout.on('data', (d) => (log += d)); api.stderr.on('data', (d) => (log += d));
for (let i = 0; i < 60; i++) { try { if ((await fetch(`http://127.0.0.1:${API_PORT}/health`)).ok) break; } catch {} await sleep(500); }

const call = async (tok, method, url, body) => { const r = await fetch(API + url, { method, headers: { ...(tok ? { authorization: `Bearer ${tok}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { s: r.status, j: await r.json().catch(() => null), len: Number(r.headers.get('content-length') || 0) }; };
const email = `perf-${Date.now()}@example.test`;
let login, ws;

const page = http.createServer((_, res) => { res.setHeader('content-type', 'text/html'); res.end('<!doctype html><meta charset=utf-8><textarea id=ta></textarea>'); }).listen(PAGE_PORT, '127.0.0.1');

const chrome = spawn(CHROME, [`--user-data-dir=${path.join(ROOT, '.e2e-tmp', 'prof-' + Date.now())}`, `--remote-debugging-port=${DBG}`, '--remote-debugging-pipe', '--enable-unsafe-extension-debugging', '--headless=new', ...(process.env.CI ? ['--no-sandbox'] : []), '--no-first-run', 'about:blank'], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
procs.push(chrome);
let pb = ''; const pw = new Map(); let pid = 0;
chrome.stdio[4].on('data', (d) => { pb += d; let i; while ((i = pb.indexOf('\0')) >= 0) { const m = JSON.parse(pb.slice(0, i)); pb = pb.slice(i + 1); if (m.id && pw.has(m.id)) { pw.get(m.id)(m); pw.delete(m.id); } } });
const pipe = (method, params) => new Promise((res) => { const id = ++pid; pw.set(id, res); chrome.stdio[3].write(JSON.stringify({ id, method, params }) + '\0'); });
const jget = async (p) => (await fetch(`http://127.0.0.1:${DBG}${p}`)).json();
for (let i = 0; i < 40; i++) { try { await jget('/json/version'); break; } catch { await sleep(500); } }
await pipe('Extensions.loadUnpacked', { path: extDir });

class Cdp { constructor(u) { this.id = 0; this.p = new Map(); this.ws = new WebSocket(u); this.r = new Promise((x) => (this.ws.onopen = x)); this.ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && this.p.has(m.id)) { this.p.get(m.id)(m); this.p.delete(m.id); } }; }
  async send(method, params = {}) { await this.r; const id = ++this.id; return new Promise((res) => { this.p.set(id, res); this.ws.send(JSON.stringify({ id, method, params })); }); }
  async eval(e) { const r = await this.send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); return r.result?.result?.value; }
  async metric(name) { const r = await this.send('Performance.getMetrics'); return r.result?.metrics?.find((m) => m.name === name)?.value; } }

let sw;
for (let i = 0; i < 40 && !sw; i++) for (const t of (await jget('/json/list')).filter((x) => x.type === 'service_worker')) { const c = new Cdp(t.webSocketDebuggerUrl); if (/SnapType/.test(await c.eval('chrome.runtime.getManifest().name').catch(() => ''))) sw = { t, c }; }
await sw.c.send('Performance.enable');
const extId = new URL(sw.t.url).host;
await sw.c.eval(`chrome.tabs.create({ url: chrome.runtime.getURL('popup.html') }).then(() => 1)`);
let pt; for (let i = 0; i < 40 && !pt; i++) { pt = (await jget('/json/list')).find((t) => t.type === 'page' && t.url.endsWith('/popup.html')); await sleep(250); }
const popup = new Cdp(pt.webSocketDebuggerUrl);
for (let i = 0; i < 40; i++) { if (await popup.eval(`typeof chrome.runtime?.sendMessage`) === 'function') break; await sleep(250); }
const msg = (m) => popup.eval(`new Promise(r => chrome.runtime.sendMessage(${JSON.stringify(m)}, r))`);
const before = log.length;
await msg({ action: 'AUTH_REQUEST_OTP', email });
let code; for (let i = 0; i < 20 && !code; i++) { code = /CODE: \[ (\d{6}) \]/.exec(log.slice(before))?.[1]; await sleep(250); }
const ver = await msg({ action: 'AUTH_VERIFY_OTP', email, code });
if (!ver?.success) throw new Error('extension login failed: ' + JSON.stringify(ver));
const token = await popup.eval(`new Promise(r => chrome.storage.local.get('snaptype_token', v => r(v.snaptype_token)))`);
login = { token };
ws = (await call(token, 'GET', '/me')).j.workspaces[0].workspace.id;

const tab = await (await fetch(`http://127.0.0.1:${DBG}/json/new?http://127.0.0.1:${PAGE_PORT}/`, { method: 'PUT' })).json();
const pg = new Cdp(tab.webSocketDebuggerUrl); await pg.send('Performance.enable'); await sleep(1500);

const rows = [];
let total = 5; // starter snippets
for (const target of [100, 1000, 5000]) {
  const batch = [];
  for (let i = total; i < target; i++) batch.push({ name: `Snippet ${i}`, shortcut: code4(i), plainContent: `Body of snippet number ${i}. `.repeat(8) + 'ăîșțâ' });
  for (let off = 0; off < batch.length; off += 500) await call(login.token, 'POST', '/import', { workspaceId: ws, snippets: batch.slice(off, off + 500), format: 'snaptype_json', conflictStrategy: 'duplicate' });
  total = target;
  const raw = await (await fetch(`${API}/sync?workspaceId=${ws}&lastRevision=0`, { headers: { authorization: `Bearer ${login.token}` } })).text();
  await msg({ action: 'SELECT_WORKSPACE', workspaceId: ws }); // forces a full resync with the new library
  await sleep(3500);
  const n = (await msg({ action: 'GET_STATUS' })).snippetsCount;
  const swHeap = (await sw.c.send('Runtime.getHeapUsage')).result?.usedSize ?? null;
  const pgHeap = await pg.metric('JSHeapUsedSize');
  await pg.send('Page.reload'); await sleep(3500); await pg.send('Page.bringToFront'); // fresh content script with the full library (matches a user opening a new tab)
  // latency: type the shortcut of a late snippet, time until replaced
  const lat = [];
  for (let k = 0; k < 8; k++) {
    const sc = code4(target - 1 - k);
    await pg.eval(`(() => { const t = document.getElementById('ta'); t.value = ''; t.focus(); })()`);
    for (const ch of sc.slice(0, -1)) { await pg.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, text: ch }); await pg.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch }); }
    const t0 = performance.now();
    const last = sc.slice(-1);
    await pg.send('Input.dispatchKeyEvent', { type: 'keyDown', key: last, text: last }); await pg.send('Input.dispatchKeyEvent', { type: 'keyUp', key: last });
    for (let w = 0; w < 200; w++) { if ((await pg.eval(`document.getElementById('ta').value`)).startsWith('Body of')) break; await sleep(2); }
    lat.push(performance.now() - t0);
  }
  if (process.env.DEBUG_PERF) console.log('DEBUG', target, 'status', JSON.stringify(await msg({ action: 'GET_STATUS' })), 'ta=', JSON.stringify(await pg.eval(`document.getElementById('ta').value`)), 'url=', await pg.eval('location.href'));
  if (process.env.DEBUG_PERF) console.log('DEBUG', target, JSON.stringify(await pg.eval(`({ v: document.getElementById('ta').value.slice(0, 20), active: document.activeElement && document.activeElement.id, focus: document.hasFocus(), vis: document.visibilityState })`)), 'lat0=', lat[0]);
  lat.sort((a, b) => a - b);
  const ok = (await pg.eval(`document.getElementById('ta').value`)).startsWith('Body of');
  rows.push({ snippets: n, syncPayloadKB: +(raw.length / 1024).toFixed(0), swHeapMB: swHeap === null ? null : +(swHeap / 1048576).toFixed(1), pageHeapMB: +(pgHeap / 1048576).toFixed(1), keyToExpandMs_median: +lat[Math.floor(lat.length / 2)].toFixed(0), keyToExpandMs_max: +lat[lat.length - 1].toFixed(0), expansionCorrect: ok });
}
// idle CPU: TaskDuration delta of the service worker and the page over 10 s with nothing happening
const t = async (c) => { try { return (await c.send('Performance.getMetrics')).result?.metrics?.find((m) => m.name === 'TaskDuration')?.value ?? null; } catch { return null; } };
const s0 = await t(sw.c), p0 = await t(pg); await sleep(10000); const s1 = await t(sw.c), p1 = await t(pg);
console.log(JSON.stringify({ chrome: spawnSync(CHROME, ['--version'], { encoding: 'utf8' }).stdout.trim(), rows, idle10s: { serviceWorkerBusyMs: s0 === null || s1 === null ? 'service worker was terminated by Chrome while idle (no measurement possible)' : +((s1 - s0) * 1000).toFixed(1), pageBusyMs: +((p1 - p0) * 1000).toFixed(1) } }, null, 2));
cleanup(); process.exit(0);
