#!/usr/bin/env node
// node scripts/brand/shot.mjs <url> <out.png> [width=1280] [height=900] [fullPage=1] [chrome]
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const [url, out, w = '1280', h = '900', full = '1', chromeArg] = process.argv.slice(2);
const CHROME = chromeArg || ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome'].find((p) => fs.existsSync(p));
const port = 9600 + Math.floor(Math.random() * 90);
const profile = path.join(process.cwd(), '.e2e-tmp', 'shot-' + Date.now());
const chrome = spawn(CHROME, [`--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, '--headless=new', '--no-first-run', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 40; i++) { try { await fetch(`http://127.0.0.1:${port}/json/version`); break; } catch { await sleep(300); } }
const tab = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Emulation.setDeviceMetricsOverride', { width: +w, height: +h, deviceScaleFactor: 1, mobile: +w < 700 });
await send('Page.navigate', { url });
await sleep(2500);
if (process.env.EVAL) { await send('Runtime.evaluate', { expression: process.env.EVAL, awaitPromise: true }); await sleep(800); }
const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: full === '1' });
fs.writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
ws.close();
if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(chrome.pid), '/T', '/F'], { stdio: 'ignore' }); else chrome.kill();
try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
console.log('wrote', out);
