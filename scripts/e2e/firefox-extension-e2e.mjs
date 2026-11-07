#!/usr/bin/env node
// Real-Firefox end-to-end check of the Firefox build against a throw-away in-memory API.
// Runs the SAME scenario as the Chrome test (scripts/e2e/scenario.mjs) through Selenium + geckodriver.
//   node scripts/e2e/firefox-extension-e2e.mjs           (needs Firefox + geckodriver on PATH, e.g. GitHub ubuntu runners)
// Temporary add-on install; throw-away profile; never touches real data.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { runScenario } from './scenario.mjs';

const require = createRequire(import.meta.url);
const { Builder, By, Key } = require('selenium-webdriver');
const firefox = require('selenium-webdriver/firefox');
const archiver = require('archiver');

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '../..');
const API_PORT = 3150, PAGE_PORT = 8098;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const skip = (name, reason) => console.log(`SKIP  ${name}  -> ${reason}`);
const record = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`); };
const annotate = (title, text) => console.log('::error title=' + title + '::' + String(text).split('%').join('%25').split(String.fromCharCode(13)).join('').split(String.fromCharCode(10)).join('%0A').slice(0, 3500));
const procs = [];
const killTree = (p) => { try { if (process.platform === 'win32' && p.pid) spawnSync('taskkill', ['/pid', String(p.pid), '/T', '/F'], { stdio: 'ignore' }); else p.kill(); } catch {} };
let driver; let pageSrv;
const cleanup = async () => { try { await driver?.quit(); } catch {} procs.forEach(killTree); try { pageSrv?.close(); } catch {} try { fs.rmSync(path.join(ROOT, '.e2e-tmp'), { recursive: true, force: true }); } catch {} };

try { await fetch(`http://127.0.0.1:${API_PORT}/health`); console.error('API port busy'); process.exit(2); } catch {}

// Build + zip the Firefox package against the throw-away API
const outDir = path.join(ROOT, '.e2e-tmp', 'ff-' + Date.now());
const b = spawnSync('node', ['apps/extension/build.js', '--target=firefox', `--out-dir=${outDir}`, `--api-url=http://127.0.0.1:${API_PORT}/api/v1`, '--app-url=http://localhost:5173'], { cwd: ROOT, stdio: 'ignore' });
if (b.status !== 0) { console.log('FAIL  extension build'); process.exit(1); }
const zipPath = path.join(outDir, 'firefox.zip');
await new Promise((res, rej) => { const out = fs.createWriteStream(zipPath); const ar = archiver('zip'); out.on('close', res); ar.on('error', rej); ar.pipe(out); ar.directory(path.join(outDir, 'firefox'), false); ar.finalize(); });

// Throw-away API
let apiLog = '';
const api = spawn('npx', ['tsx', 'apps/api/src/server.ts'], { cwd: ROOT, shell: true, env: { ...process.env, PORT: String(API_PORT), HOST: '127.0.0.1', NODE_ENV: '', DATABASE_URL: '' } });
procs.push(api); api.stdout.on('data', (d) => (apiLog += d)); api.stderr.on('data', (d) => (apiLog += d));
let up = false;
for (let i = 0; i < 90 && !up; i++) { try { up = (await fetch(`http://127.0.0.1:${API_PORT}/health`)).ok; } catch {} if (!up) await sleep(1000); }
record('throw-away API is up', up, up ? '' : apiLog.slice(-400));
if (!up) { annotate('firefox-e2e: API did not start', apiLog.slice(-2500)); await cleanup(); process.exit(1); }
const otpFor = async (email) => {
  const before = apiLog.length;
  const r = await fetch(`http://127.0.0.1:${API_PORT}/api/v1/auth/request-otp`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) });
  if (!r.ok) throw new Error('request-otp ' + r.status);
  for (let i = 0; i < 20; i++) { const m = /CODE: \[ (\d{6}) \]/.exec(apiLog.slice(before)); if (m) return m[1]; await sleep(250); }
  throw new Error('OTP not found');
};

const PAGE = `<!doctype html><meta charset=utf-8><title>e2e</title>
<input id=inp type=text><br><textarea id=ta></textarea><br>
<div id=ce contenteditable=true style="min-height:40px;border:1px solid #999"></div>
<input id=pw type=password>`;
pageSrv = http.createServer((_, res) => { res.setHeader('content-type', 'text/html'); res.end(PAGE); }).listen(PAGE_PORT, '127.0.0.1');

try {
  const opts = new firefox.Options();
  opts.addArguments('-headless');
  opts.setPreference('xpinstall.signatures.required', false);
  opts.setPreference('extensions.autoDisableScopes', 0);
  driver = await new Builder().forBrowser('firefox').setFirefoxOptions(opts).build();
  const caps = await driver.getCapabilities();
  console.log('Firefox', caps.get('browserVersion'), 'geckodriver ok');

  await driver.installAddon(zipPath, true);
  await sleep(1500);

  // Internal UUID of the add-on (needed for moz-extension:// URLs)
  await driver.setContext(firefox.Context.CHROME);
  const uuids = JSON.parse(await driver.executeScript("return Services.prefs.getStringPref('extensions.webextensions.uuids')"));
  await driver.setContext(firefox.Context.CONTENT);
  const uuid = uuids['extension@snaptype.app'];
  record('Firefox installs the add-on with the preserved ID extension@snaptype.app', Boolean(uuid), uuid || JSON.stringify(Object.keys(uuids)));
  if (!uuid) throw new Error('add-on not installed');

  const popupHandle = await driver.getWindowHandle();
  await driver.get(`moz-extension://${uuid}/popup.html`);
  await driver.switchTo().newWindow('tab');
  const pageHandle = await driver.getWindowHandle();
  await driver.get(`http://127.0.0.1:${PAGE_PORT}/`);
  await sleep(1500);

  const inTab = async (h, fn) => { await driver.switchTo().window(h); return fn(); };
  const evalIn = (h, expr) => inTab(h, () => driver.executeAsyncScript(
    "const done = arguments[arguments.length - 1]; try { Promise.resolve((0, eval)(arguments[0])).then((v) => done(v === undefined ? null : v), (e) => done({ __error: String(e) })); } catch (e) { done({ __error: String(e) }); }", expr));
  const popupEval = async (expr) => { const v = await evalIn(popupHandle, expr); if (v && v.__error) throw new Error(v.__error); return v; };
  const msg = (m) => popupEval(`browser.runtime.sendMessage(${JSON.stringify(m)})`);
  const page = { eval: async (expr) => { const v = await evalIn(pageHandle, expr); if (v && v.__error) throw new Error(v.__error); return v; } };
  const typeInto = async (sel, text) => {
    await driver.switchTo().window(pageHandle);
    const el = await driver.findElement(By.css(sel));
    await el.click();
    for (const ch of text) { await el.sendKeys(ch); await sleep(15); }
    await sleep(400);
  };
  const pressKey = async () => { await driver.switchTo().window(pageHandle); await driver.actions().sendKeys(Key.ESCAPE).perform(); };

  const email = `ff-${Date.now()}@example.test`;
  const reqRes = await msg({ action: 'AUTH_REQUEST_OTP', email });
  record('Firefox extension requests an OTP from the backend', reqRes && reqRes.success !== false, JSON.stringify(reqRes));
  const code = [...apiLog.matchAll(/CODE: \[ (\d{6}) \]/g)].pop()?.[1] || await otpFor(email);
  const ver = await msg({ action: 'AUTH_VERIFY_OTP', email, code });
  record('Firefox extension logs in with the emailed code', ver?.success === true, JSON.stringify(ver).slice(0, 120));
  const status = await msg({ action: 'GET_STATUS' });
  record('Firefox first sync downloads the 5 starter snippets', status?.snippetsCount === 5, JSON.stringify(status));

  // The content script must actually be injected on a normal page (MV3 host permission in Firefox)
  await driver.switchTo().window(pageHandle);
  await driver.navigate().refresh();
  await sleep(1500);

  await runScenario({
    record, skip, sleep, msg, page, typeInto, pressKey, otpFor, email, API_PORT,
    getToken: async () => (await popupEval(`browser.storage.local.get('snaptype_token')`)).snaptype_token,
    getStoredKeys: async () => Object.keys(await popupEval(`browser.storage.local.get(null)`)),
    setOffline: null
  });
} catch (e) {
  record('firefox e2e run completed without exceptions', false, String(e && e.stack || e).slice(0, 600));
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) annotate('firefox-e2e failures', failed.map((f) => `${f.name} -> ${f.detail}`).join(String.fromCharCode(10)) + String.fromCharCode(10) + '--- API log tail ---' + String.fromCharCode(10) + apiLog.slice(-800));
await cleanup();
process.exit(failed.length ? 1 : 0);
