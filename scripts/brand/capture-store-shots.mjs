#!/usr/bin/env node
// Captures REAL screenshots of SnapType (extension on a fictional demo page, popup, assistant, dashboard)
// into <outDir> (default .e2e-tmp/raw). Throw-away API + profile; demo data is English and fictional.
//   node scripts/brand/capture-store-shots.mjs [outDir] [path/to/chrome]
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '../..');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, '.e2e-tmp', 'raw'));
const CHROME = process.argv[3] || ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome'].find((p) => fs.existsSync(p));
const API_PORT = 3180, WEB_PORT = 5192, PAGE_PORT = 8197, DBG = 9800 + Math.floor(Math.random() * 90);
const API = `http://127.0.0.1:${API_PORT}/api/v1`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });
const procs = [];
const kill = (p) => { try { if (process.platform === 'win32' && p.pid) spawnSync('taskkill', ['/pid', String(p.pid), '/T', '/F'], { stdio: 'ignore' }); else p.kill(); } catch {} };
const profile = path.join(os.tmpdir(), 'snaptype-shots-' + Date.now());
let pageSrv;
const cleanup = () => { procs.forEach(kill); try { pageSrv?.close(); } catch {} try { fs.rmSync(profile, { recursive: true, force: true }); } catch {} };
process.on('exit', cleanup);
for (const port of [API_PORT, WEB_PORT, PAGE_PORT]) { try { await fetch(`http://127.0.0.1:${port}/`); console.error('port busy ' + port); process.exit(2); } catch {} }

// build extension against the throw-away API / dashboard
const extOut = path.join(ROOT, '.e2e-tmp', 'shots-ext-' + Date.now());
spawnSync('node', ['apps/extension/build.js', '--target=chrome', `--out-dir=${extOut}`, `--api-url=http://127.0.0.1:${API_PORT}/api/v1`, `--app-url=http://127.0.0.1:${WEB_PORT}`], { cwd: ROOT, stdio: 'ignore' });
const extDir = path.join(extOut, 'chrome');

let log = '';
const api = spawn('npx', ['tsx', 'apps/api/src/server.ts'], { cwd: ROOT, shell: true, env: { ...process.env, PORT: String(API_PORT), HOST: '127.0.0.1', NODE_ENV: '', DATABASE_URL: '' } });
procs.push(api); api.stdout.on('data', (d) => (log += d)); api.stderr.on('data', (d) => (log += d));
const web = spawn('npx', ['vite', 'apps/web', '--port', String(WEB_PORT), '--host', '127.0.0.1', '--strictPort'], { cwd: ROOT, shell: true, env: { ...process.env, VITE_API_PROXY: `http://127.0.0.1:${API_PORT}` } });
procs.push(web); web.stdout.on('data', (d) => (log += d)); web.stderr.on('data', (d) => (log += d));
for (let i = 0; i < 90; i++) { try { if ((await fetch(`http://127.0.0.1:${API_PORT}/health`)).ok && (await fetch(`http://127.0.0.1:${WEB_PORT}/`)).ok) break; } catch {} await sleep(1000); }

const demoHtml = fs.readFileSync(path.join(ROOT, 'scripts/brand/demo-page.html'), 'utf8');
pageSrv = http.createServer((_, res) => { res.setHeader('content-type', 'text/html; charset=utf-8'); res.end(demoHtml); }).listen(PAGE_PORT, '127.0.0.1');

const chrome = spawn(CHROME, [`--user-data-dir=${profile}`, `--remote-debugging-port=${DBG}`, '--remote-debugging-pipe', '--enable-unsafe-extension-debugging', '--headless=new', ...(process.env.CI ? ['--no-sandbox'] : []), '--no-first-run', '--hide-scrollbars', 'about:blank'], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
procs.push(chrome);
let pb = ''; const pw = new Map(); let pid = 0;
chrome.stdio[4].on('data', (d) => { pb += d; let i; while ((i = pb.indexOf('\0')) >= 0) { const m = JSON.parse(pb.slice(0, i)); pb = pb.slice(i + 1); if (m.id && pw.has(m.id)) { pw.get(m.id)(m); pw.delete(m.id); } } });
const pipe = (method, params) => new Promise((res) => { const id = ++pid; pw.set(id, res); chrome.stdio[3].write(JSON.stringify({ id, method, params }) + '\0'); });
const jget = async (p) => (await fetch(`http://127.0.0.1:${DBG}${p}`)).json();
for (let i = 0; i < 40; i++) { try { await jget('/json/version'); break; } catch { await sleep(400); } }
await pipe('Extensions.loadUnpacked', { path: extDir });

class Cdp {
  constructor(u) { this.id = 0; this.p = new Map(); this.ws = new WebSocket(u); this.r = new Promise((x) => (this.ws.onopen = x)); this.ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && this.p.has(m.id)) { this.p.get(m.id)(m); this.p.delete(m.id); } }; }
  async send(method, params = {}) { await this.r; const id = ++this.id; return new Promise((res) => { this.p.set(id, res); this.ws.send(JSON.stringify({ id, method, params })); }); }
  async eval(e) { const r = await this.send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 250)); return r.result?.result?.value; }
  async view(w, h, scale = 2) { await this.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: scale, mobile: false }); }
  async shot(name) { await sleep(400); const r = await this.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(r.result.data, 'base64')); console.log('captured', name); }
  async key(type, key, code, vk, modifiers = 0, text) { await this.send('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode: vk, modifiers, ...(text ? { text } : {}) }); }
  async type(text) { for (const ch of text) { await this.key('keyDown', ch, '', 0, 0, ch); await this.key('keyUp', ch, '', 0); await sleep(25); } }
}

let sw;
for (let i = 0; i < 40 && !sw; i++) for (const t of (await jget('/json/list')).filter((x) => x.type === 'service_worker')) { const c = new Cdp(t.webSocketDebuggerUrl); if (/SnapType/.test(await c.eval('chrome.runtime.getManifest().name').catch(() => ''))) sw = { t, c }; }
await sw.c.eval(`chrome.tabs.create({ url: chrome.runtime.getURL('popup.html') }).then(() => 1)`);
let pt; for (let i = 0; i < 40 && !pt; i++) { pt = (await jget('/json/list')).find((t) => t.type === 'page' && t.url.endsWith('/popup.html')); await sleep(250); }
const popup = new Cdp(pt.webSocketDebuggerUrl);
for (let i = 0; i < 40; i++) { if (await popup.eval(`typeof chrome.runtime?.sendMessage`) === 'function') break; await sleep(250); }
const msg = (m) => popup.eval(`new Promise(r => chrome.runtime.sendMessage(${JSON.stringify(m)}, r))`);

const call = async (tok, method, url, body) => { const r = await fetch(API + url, { method, headers: { ...(tok ? { authorization: `Bearer ${tok}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }); let j = null; try { j = await r.json(); } catch {} return { s: r.status, j }; };
const email = `demo-${Date.now()}@example.test`;
const before = log.length;
await msg({ action: 'AUTH_REQUEST_OTP', email });
let code; for (let i = 0; i < 20 && !code; i++) { code = /CODE: \[ (\d{6}) \]/.exec(log.slice(before))?.[1]; await sleep(250); }
await msg({ action: 'AUTH_VERIFY_OTP', email, code });
const token = await popup.eval(`new Promise(r => chrome.storage.local.get('snaptype_token', v => r(v.snaptype_token)))`);
const ws = (await call(token, 'GET', '/me')).j.workspaces[0].workspace.id;

// English, fictional demo library
for (const s of (await call(token, 'GET', `/snippets?workspaceId=${ws}`)).j.snippets) await call(token, 'DELETE', `/snippets/${s.id}`);
const folder = async (name) => (await call(token, 'POST', '/folders', { workspaceId: ws, name })).j.folder.id;
const fShip = await folder('Shipping'), fBill = await folder('Billing'), fGen = await folder('General');
const mk = (b) => call(token, 'POST', '/snippets', { workspaceId: ws, tags: [], isEnabled: true, ...b });
await mk({ name: 'Order delay apology', shortcut: '/late', folderId: fShip, isFavorite: true, tags: ['shipping'], plainContent: 'Hi {{input:customer|label=Customer name|default=there}},\n\nI am sorry your order is late. I checked with our warehouse and it will ship within {{dropdown:days|label=Ships within|options=1 business day,2 business days,3 business days}}.\n\nIf anything changes, I will let you know right away.\n\n{{cursor}}' });
await mk({ name: 'Thanks and close', shortcut: '/thx', folderId: fGen, isFavorite: true, plainContent: 'Thanks for getting in touch. If there is anything else I can help with, just reply to this message.' });
await mk({ name: 'Refund issued', shortcut: '/refund', folderId: fBill, isFavorite: true, tags: ['billing'], plainContent: 'Your refund of {{input:amount|label=Amount}} was issued on {{date}} and should arrive within 3 to 5 business days.' });
await mk({ name: 'Request order details', shortcut: '/info', folderId: fShip, plainContent: 'To look into this, could you please send me your order number and the email address used at checkout?' });
await mk({ name: 'Escalation notice', shortcut: '/escalate', folderId: fGen, plainContent: 'I have passed your case to our specialist team. You will hear from them within one business day.' });
await mk({ name: 'Business hours', shortcut: '/hours', folderId: fGen, plainContent: 'Our team is available Monday to Friday, 9:00 to 18:00.' });
await mk({ name: 'Invoice copy', shortcut: '/invoice', folderId: fBill, plainContent: 'I have attached a copy of your invoice. Please let me know if you need it in a different format.' });
await msg({ action: 'SYNC_NOW' });
await sleep(1500);

// ── demo page tab ──
const tab = await (await fetch(`http://127.0.0.1:${DBG}/json/new?http://127.0.0.1:${PAGE_PORT}/`, { method: 'PUT' })).json();
const page = new Cdp(tab.webSocketDebuggerUrl);
await page.view(1100, 680, 2);
await sleep(2000);
await page.send('Page.bringToFront');
await page.eval(`document.querySelector('#reply').focus()`);
await page.type('/late');
await sleep(600);
await page.eval(`document.querySelector('.snaptype-dd-btn[role=combobox]').click()`);
await sleep(300);
await page.shot('form');
await page.eval(`[...document.querySelectorAll('.snaptype-dd-list li')].find(li => li.textContent.includes('2 business days')).click()`);
await page.eval(`(() => { const i = document.querySelector('.snaptype-modal input'); i.focus(); i.value = 'Maria'; i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
await sleep(200);
await page.eval(`document.querySelector('.snaptype-btn-primary').click()`);
await sleep(700);
await page.shot('expansion');

await page.eval(`(() => { const t = document.querySelector('#reply'); t.value = ''; t.focus(); })()`);
await page.key('keyDown', ' ', 'Space', 32, 2 | 8); await page.key('keyUp', ' ', 'Space', 32, 2 | 8);
await sleep(700);
await page.send('Input.insertText', { text: 're' });
await sleep(500);
await page.shot('assistant');
await page.key('keyDown', 'Escape', 'Escape', 27); await page.key('keyUp', 'Escape', 'Escape', 27);

// ── popup ──
await popup.view(320, 520, 3);
await popup.send('Page.reload'); await sleep(2200);
await popup.shot('popup');

// ── dashboard ──
const dtab = await (await fetch(`http://127.0.0.1:${DBG}/json/new?http://127.0.0.1:${WEB_PORT}/`, { method: 'PUT' })).json();
const dash = new Cdp(dtab.webSocketDebuggerUrl);
await dash.view(1440, 900, 1.5);
await sleep(2500);
await dash.eval(`localStorage.setItem('snaptype_auth_token', ${JSON.stringify(token)}); location.reload(); 1`);
await sleep(3500);
await dash.eval(`(() => { const el = [...document.querySelectorAll('div,span')].filter(e => e.children.length === 0 && e.textContent.trim() === 'Order delay apology')[0]; el && el.click(); })()`);
await sleep(900);
await dash.shot('dashboard');
await dash.eval(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Preferences').click()`);
await sleep(800);
await dash.eval(`document.querySelector('.ui-hotkey')?.scrollIntoView()`);
await dash.shot('settings');

console.log('done ->', OUT);
cleanup();
process.exit(0);
