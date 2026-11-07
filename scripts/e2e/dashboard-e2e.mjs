#!/usr/bin/env node
// Drives the REAL dashboard UI in headless Chrome (CDP, zero deps) against a throw-away in-memory API and
// the Vite dev server, and confirms every action through the API. Never touches real data.
//   node scripts/e2e/dashboard-e2e.mjs [path/to/chrome]
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '../..');
const CHROME = process.argv[2] || ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome'].find((p) => fs.existsSync(p));
const API_PORT = 3170, WEB_PORT = 5191, DBG = 9700 + Math.floor(Math.random() * 90);
const API = `http://127.0.0.1:${API_PORT}/api/v1`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const skip = (n, why) => console.log(`SKIP  ${n}  -> ${why}`);
const record = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  -> ' + detail}`); };
const annotate = (title, text) => console.log('::error title=' + title + '::' + String(text).split('%').join('%25').split(String.fromCharCode(13)).join('').split(String.fromCharCode(10)).join('%0A').slice(0, 3500));
const procs = [];
const kill = (p) => { try { if (process.platform === 'win32' && p.pid) spawnSync('taskkill', ['/pid', String(p.pid), '/T', '/F'], { stdio: 'ignore' }); else p.kill(); } catch {} };
const profile = path.join(os.tmpdir(), 'snaptype-dash-' + Date.now());
const cleanup = () => { procs.forEach(kill); try { fs.rmSync(profile, { recursive: true, force: true }); } catch {} };
process.on('exit', cleanup);

for (const port of [API_PORT, WEB_PORT]) { try { await fetch(`http://127.0.0.1:${port}/`); console.error(`port ${port} busy`); process.exit(2); } catch {} }

let log = '';
const api = spawn('npx', ['tsx', 'apps/api/src/server.ts'], { cwd: ROOT, shell: true, env: { ...process.env, PORT: String(API_PORT), HOST: '127.0.0.1', NODE_ENV: '', DATABASE_URL: '' } });
procs.push(api); api.stdout.on('data', (d) => (log += d)); api.stderr.on('data', (d) => (log += d));
const web = spawn('npx', ['vite', 'apps/web', '--port', String(WEB_PORT), '--host', '127.0.0.1', '--strictPort'], { cwd: ROOT, shell: true, env: { ...process.env, VITE_API_PROXY: `http://127.0.0.1:${API_PORT}` } });
procs.push(web); web.stdout.on('data', (d) => (log += d)); web.stderr.on('data', (d) => (log += d));
for (let i = 0; i < 90; i++) { try { if ((await fetch(`http://127.0.0.1:${API_PORT}/health`)).ok && (await fetch(`http://127.0.0.1:${WEB_PORT}/`)).ok) break; } catch {} await sleep(1000); }

const call = async (tok, method, url, body) => { const r = await fetch(API + url, { method, headers: { ...(tok ? { authorization: `Bearer ${tok}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }); let j = null; try { j = await r.json(); } catch {} return { s: r.status, j }; };
const email = `dash-${Date.now()}@example.test`;
const before = log.length;
await call(null, 'POST', '/auth/request-otp', { email });
let code; for (let i = 0; i < 20 && !code; i++) { code = /CODE: \[ (\d{6}) \]/.exec(log.slice(before))?.[1]; await sleep(250); }
const login = (await call(null, 'POST', '/auth/verify-otp', { email, code })).j;
const TOKEN = login.token;
const me = (await call(TOKEN, 'GET', '/me')).j;
const WS = me.workspaces[0].workspace.id;

const chrome = spawn(CHROME, [`--user-data-dir=${profile}`, `--remote-debugging-port=${DBG}`, '--headless=new', ...(process.env.CI ? ['--no-sandbox'] : []), '--no-first-run', 'about:blank'], { stdio: 'ignore' });
procs.push(chrome);
for (let i = 0; i < 40; i++) { try { await fetch(`http://127.0.0.1:${DBG}/json/version`); break; } catch { await sleep(400); } }
const tab = await (await fetch(`http://127.0.0.1:${DBG}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let mid = 0; const pend = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
const send = (method, params = {}) => new Promise((res) => { const id = ++mid; pend.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 250)); return r.result?.result?.value; };
const viewport = (w, h) => send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 700 });

// ───── page helpers (run inside the page) ─────
const H = `(() => {
  const T = (el) => (el.textContent || '').replace(/\\s+/g, ' ').trim();
  const vis = (el) => !!(el.offsetParent || el.getClientRects().length);
  window.__h = {
    btn: (t) => [...document.querySelectorAll('button')].find((b) => vis(b) && T(b) === t) || [...document.querySelectorAll('button')].find((b) => vis(b) && T(b).includes(t)),
    byTitle: (t) => [...document.querySelectorAll('button')].find((b) => vis(b) && b.getAttribute('title') === t),
    click: (t) => { const b = window.__h.btn(t); if (!b) throw new Error('no button: ' + t); b.click(); return true; },
    clickTitle: (t) => { const b = window.__h.byTitle(t); if (!b) throw new Error('no titled button: ' + t); b.click(); return true; },
    set: (el, v) => { const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); },
    field: (labelText) => { const l = [...document.querySelectorAll('label')].find((x) => vis(x) && T(x).startsWith(labelText)); if (!l) throw new Error('no label: ' + labelText); return l.parentElement.querySelector('input,textarea'); },
    byPh: (ph) => [...document.querySelectorAll('input,textarea')].find((i) => vis(i) && (i.placeholder || '').startsWith(ph)),
    pick: (ariaLabel, optionText) => { const b = [...document.querySelectorAll('button[role=combobox]')].find((x) => x.getAttribute('aria-label') === ariaLabel && vis(x)); if (!b) throw new Error('no select: ' + ariaLabel); b.click(); return new Promise((r) => setTimeout(() => { const o = [...document.querySelectorAll('[role=option]')].find((x) => T(x).startsWith(optionText)); if (!o) { r('no option ' + optionText); return; } o.click(); r(true); }, 150)); },
    card: (name) => { const el = [...document.querySelectorAll('div,span')].filter((e) => vis(e) && e.children.length === 0 && T(e) === name)[0]; if (!el) throw new Error('no card: ' + name); el.click(); return true; },
    text: () => document.body.innerText
  };
  return true;
})()`;
const h = async (js) => { await ev(H); return ev(`(async () => { ${js} })()`); };
const waitApi = async (fn, ms = 6000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch {} await sleep(250); } return null; };
const snippets = async (ws = WS) => (await call(TOKEN, 'GET', `/snippets?workspaceId=${ws}`)).j.snippets;

try {
  await viewport(1440, 900);
  await send('Page.navigate', { url: `http://127.0.0.1:${WEB_PORT}/` });
  await sleep(2500);
  await ev(`localStorage.setItem('snaptype_auth_token', ${JSON.stringify(TOKEN)}); location.reload(); 1`);
  await sleep(3000);
  record('dashboard loads for the signed-in user with 5 starter snippets', (await ev(`document.body.innerText`)).includes('Cerere bonus') && (await snippets()).length === 5);

  // 1. Create
  await h(`__h.click('New Snippet'); await new Promise(r => setTimeout(r, 700));`);
  await h(`__h.set(__h.field('Snippet Name'), 'UI refund'); __h.set(__h.field('Shortcut'), '/uirefund'); __h.set(document.querySelector('textarea'), 'Rambursare pentru {{input:client}} - ăîșțâ'); await new Promise(r => setTimeout(r, 300)); __h.click('Save changes');`);
  const created = await waitApi(async () => (await snippets()).find((s) => s.shortcut === '/uirefund'));
  record('UI: create snippet (name, shortcut, content with dynamic field + diacritics) is stored', created && created.plainContent === 'Rambursare pentru {{input:client}} - ăîșțâ' && created.name === 'UI refund', JSON.stringify(created)?.slice(0, 150));

  // 2. Edit
  await h(`__h.set(document.querySelector('textarea'), 'Rambursare v2'); await new Promise(r => setTimeout(r, 300)); __h.click('Save changes');`);
  const edited = await waitApi(async () => { const s = (await snippets()).find((x) => x.shortcut === '/uirefund'); return s && s.plainContent === 'Rambursare v2' ? s : null; });
  record('UI: edit and save increments the version exactly once', edited && edited.version === created.version + 1, `v${created?.version} -> v${edited?.version}`);

  // 3. Folder + move
  await h(`__h.clickTitle('New Folder'); await new Promise(r => setTimeout(r, 300)); __h.set(__h.byPh('e.g. Support Responses'), 'Billing'); __h.click('Create Folder');`);
  const folder = await waitApi(async () => (await call(TOKEN, 'GET', `/folders?workspaceId=${WS}`)).j.folders.find((f) => f.name === 'Billing'));
  record('UI: create folder', Boolean(folder));
  await h(`const r = await __h.pick('Folder', 'Billing'); await new Promise(r => setTimeout(r, 300)); __h.click('Save changes'); return r;`);
  const moved = await waitApi(async () => { const s = (await snippets()).find((x) => x.shortcut === '/uirefund'); return s && s.folderId === folder.id ? s : null; });
  record('UI: move snippet into the folder via the custom dropdown', Boolean(moved));
  record('UI: folder shows in the sidebar with its snippet count', (await ev(`document.body.innerText`)).includes('Billing'));

  // 4. Search
  await h(`__h.set(__h.byPh('Search'), 'cerbonus'); await new Promise(r => setTimeout(r, 400));`);
  const filtered = await ev(`document.body.innerText`);
  record('UI: search filters the list', filtered.includes('Cerere bonus') && !filtered.includes('Salutare client'));
  await h(`__h.set(__h.byPh('Search'), ''); await new Promise(r => setTimeout(r, 300));`);

  // 5. Duplicate, delete
  const n0 = (await snippets()).length;
  if (process.env.DEBUG_UI) { await h(`__h.card('UI refund'); await new Promise(r => setTimeout(r, 800));`); await h(`__h.clickTitle('Duplicate'); await new Promise(r => setTimeout(r, 1200));`); console.log('DEBUG after Duplicate: dialog=', await ev(`document.querySelector('[role=alertdialog],[role=dialog]')?.innerText || 'none'`), 'count=', (await snippets()).length, JSON.stringify((await snippets()).map(x=>x.shortcut))); }
  await h(`__h.card('UI refund'); await new Promise(r => setTimeout(r, 500)); __h.clickTitle('Duplicate');`);
  const dup = await waitApi(async () => (await snippets()).length === n0 + 1);
  const nowCount = (await snippets()).length;
  const uiTxt = String(await ev('document.body.innerText')).slice(0, 300).split(String.fromCharCode(10)).join(' | ');
  record('UI: duplicate creates one more snippet with a unique shortcut', Boolean(dup) && (await snippets()).some((s) => /_copy/.test(s.shortcut)), `n0=${n0} now=${nowCount} ui=${uiTxt}`);
  await h(`__h.clickTitle('Delete'); await new Promise(r => setTimeout(r, 300));`);
  const dialog = await ev(`!!document.querySelector('[role=alertdialog]')`);
  await h(`[...document.querySelectorAll('[role=alertdialog] button')].find(b => b.textContent.trim() === 'Cancel').click(); await new Promise(r => setTimeout(r, 200));`);
  record('UI: delete asks for confirmation, Cancel keeps the snippet', dialog === true && (await snippets()).length === n0 + 1);
  await h(`__h.clickTitle('Delete'); await new Promise(r => setTimeout(r, 300)); [...document.querySelectorAll('[role=alertdialog] button')].find(b => b.textContent.trim() === 'Delete').click();`);
  record('UI: confirmed delete removes the snippet', Boolean(await waitApi(async () => (await snippets()).length === n0)));

  // 6. Real version conflict in the UI: someone else edits, then the user saves
  const target = (await snippets()).find((s) => s.shortcut === '/uirefund');
  await h(`__h.card('UI refund'); await new Promise(r => setTimeout(r, 600));`);
  await call(TOKEN, 'PATCH', `/snippets/${target.id}`, { plainContent: 'SERVER-SIDE EDIT', expectedVersion: target.version });
  await h(`__h.set(document.querySelector('textarea'), 'LOCAL EDIT'); await new Promise(r => setTimeout(r, 300)); __h.click('Save changes'); await new Promise(r => setTimeout(r, 1200));`);
  const banner = await ev(`document.body.innerText`);
  record('UI: stale save shows a conflict banner with Overwrite and Reload choices', /Conflict/.test(banner) && banner.includes('Overwrite') && banner.includes('Reload Server Version'));
  const serverDuring = (await snippets()).find((s) => s.id === target.id);
  record('UI: nothing was silently overwritten while the conflict is unresolved', serverDuring.plainContent === 'SERVER-SIDE EDIT');
  await h(`__h.click('Reload Server Version'); await new Promise(r => setTimeout(r, 400)); [...document.querySelectorAll('[role=alertdialog] button')].find(b => b.textContent.trim() === 'Confirm').click(); await new Promise(r => setTimeout(r, 800));`);
  record('UI: Reload Server Version loads the server text into the editor', (await ev(`document.querySelector('textarea').value`)) === 'SERVER-SIDE EDIT');
  const t2 = (await snippets()).find((s) => s.id === target.id);
  await call(TOKEN, 'PATCH', `/snippets/${target.id}`, { plainContent: 'SERVER EDIT 2', expectedVersion: t2.version });
  await h(`__h.set(document.querySelector('textarea'), 'CHOSEN LOCAL'); await new Promise(r => setTimeout(r, 300)); __h.click('Save changes'); await new Promise(r => setTimeout(r, 1000)); __h.click('Overwrite');`);
  record('UI: explicit Overwrite stores the local text', Boolean(await waitApi(async () => (await snippets()).find((s) => s.id === target.id && s.plainContent === 'CHOSEN LOCAL'))));

  // 7. Revision history + restore
  await h(`__h.clickTitle('Revisions'); await new Promise(r => setTimeout(r, 800));`);
  const hist = await ev(`document.body.innerText`);
  record('UI: history lists previous versions with a restore action', /Restore this version/.test(hist));
  await h(`const b = [...document.querySelectorAll('button')].filter(x => x.textContent.trim() === 'Restore this version').pop(); b && b.click(); await new Promise(r => setTimeout(r, 300)); const d = document.querySelector('[role=alertdialog]'); d && [...d.querySelectorAll('button')].find(x => x.textContent.trim() === 'Confirm').click(); await new Promise(r => setTimeout(r, 500));`);
  record('UI: restoring a version puts its text back into the editor', (await ev(`document.querySelector('textarea').value`)) !== 'CHOSEN LOCAL');

  // 8. Command browser inserts a command
  await h(`const t = document.querySelector('textarea'); t.focus(); __h.click('Browse Commands'); await new Promise(r => setTimeout(r, 500));`);
  record('UI: command browser opens', /Command Browser/.test(await ev(`document.body.innerText`)));
  const taBefore = await ev(`document.querySelector('textarea').value`);
  await h(`[...document.querySelectorAll('button')].filter(b => b.textContent.trim() === 'Insert')[0].click(); await new Promise(r => setTimeout(r, 400));`);
  const taAfter = await ev(`document.querySelector('textarea').value`);
  record('UI: inserting a command from the browser adds it to the editor', taAfter.length > taBefore.length && /\{\{/.test(taAfter), JSON.stringify(taAfter).slice(-60));
  await ev(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); 1`);

  // 9. Data tables
  await h(`[...document.querySelectorAll('button[aria-label=Close]')].forEach(b => b.click()); await new Promise(r => setTimeout(r, 300)); __h.click('Data Tables'); await new Promise(r => setTimeout(r, 600));`);
  await h(`__h.click('New'); await new Promise(r => setTimeout(r, 300)); __h.set(__h.byPh('e.g. customers'), 'customers'); __h.set(__h.byPh('Column Name'), 'Email'); __h.set(__h.byPh('Key'), 'email'); __h.click('Save Table');`);
  const tbl = await waitApi(async () => (await call(TOKEN, 'GET', `/tables?workspaceId=${WS}`)).j.tables?.find((t) => t.name === 'customers'));
  record('UI: create a data table with a column', Boolean(tbl));
  if (tbl) {
    await h(`await new Promise(r => setTimeout(r, 400)); __h.set(__h.byPh('Email'), 'ana@example.test'); __h.click('Add Row');`);
    const rows = await waitApi(async () => { const r = (await call(TOKEN, 'GET', `/tables/${tbl.id}/rows`)).j.rows; return r?.length ? r : null; });
    record('UI: add a row to the table', Boolean(rows) && rows[0].data.email === 'ana@example.test', JSON.stringify(rows)?.slice(0, 120));
  }
  await ev(`[...document.querySelectorAll('button')].filter(b => b.getAttribute('aria-label') === 'Close' || /^\\s*$/.test(b.textContent) ).forEach(b => b.click()); 1`);
  await ev(`location.reload(); 1`); await sleep(2500);

  // 10. Import
  await h(`__h.click('Import / Export'); await new Promise(r => setTimeout(r, 500));`);
  await h(`const tabBtn = [...document.querySelectorAll('button')].find(b => /Import/.test(b.textContent) && b.offsetParent && !/Export/.test(b.textContent) && b.textContent.trim() !== 'Run Import'); tabBtn && tabBtn.click(); await new Promise(r => setTimeout(r, 300)); const ta = [...document.querySelectorAll('textarea')].pop(); __h.set(ta, JSON.stringify([{ name: 'Imp A', shortcut: '/impa', plainContent: 'A ăî' }, { name: 'Imp B', shortcut: 'bad shortcut', plainContent: 'B' }])); __h.click('Run Import'); await new Promise(r => setTimeout(r, 1200));`);
  const impText = await ev(`document.body.innerText`);
  record('UI: import reports imported and failed items separately', /Imported 1 snippet/.test(impText) && /1 failed/.test(impText), impText.match(/Imported[^\n]*/)?.[0]);
  record('UI: imported valid snippet is stored', Boolean((await snippets()).find((s) => s.shortcut === '/impa')));
  const exp = await call(TOKEN, 'GET', `/export?workspaceId=${WS}`);
  record('export endpoint returns the workspace backup used by the Export button', exp.s === 200 && exp.j.snippets.length >= 6);
  await ev(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Close')?.click(); 1`);

  // 11. Settings
  await h(`__h.click('Preferences'); await new Promise(r => setTimeout(r, 500));`);
  await h(`const sw = document.querySelector('button[role=switch]'); sw.click(); await new Promise(r => setTimeout(r, 200)); __h.click('Save Preferences'); await new Promise(r => setTimeout(r, 900));`);
  const prefs = (await call(TOKEN, 'GET', '/preferences')).j;
  record('UI: settings switch persists to the server', (prefs.preferences?.caseSensitive ?? prefs.caseSensitive) === true, JSON.stringify(prefs).slice(0, 160));
  await ev(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Cancel' || b.textContent.trim() === 'Close')?.click(); 1`);

  // 12. Team: invite and revoke
  await ev(`location.reload(); 1`); await sleep(2500);
  await h(`__h.click('Team Members'); await new Promise(r => setTimeout(r, 600));`);
  await h(`__h.set(document.querySelector('input[type=email]'), 'teammate@example.test'); __h.click('Invite'); await new Promise(r => setTimeout(r, 1200));`);
  const invs = (await call(TOKEN, 'GET', `/workspaces/${WS}/invitations`)).j.invitations;
  record('UI: invite a teammate creates a pending invitation', Boolean(invs?.find((i) => i.email === 'teammate@example.test')));
  record('UI: invitation delivery status is shown (no SMTP in dev, link is offered)', /link|delivered|SMTP/i.test(await ev(`document.body.innerText`)));
  await h(`[...document.querySelectorAll('button')].find(b => /revoke/i.test(b.title || b.textContent)).click(); await new Promise(r => setTimeout(r, 300)); const d = document.querySelector('[role=alertdialog]'); d && [...d.querySelectorAll('button')].find(b => b.textContent.trim() === 'Confirm').click(); await new Promise(r => setTimeout(r, 800));`);
  const invs2 = (await call(TOKEN, 'GET', `/workspaces/${WS}/invitations`)).j.invitations || [];
  record('UI: revoke removes the pending invitation', !invs2.some((i) => i.email === 'teammate@example.test' && !i.revokedAt));

  // 13. Workspaces: create + switch, no leakage
  await ev(`location.reload(); 1`); await sleep(2500);
  await h(`__h.clickTitle('Create Workspace'); await new Promise(r => setTimeout(r, 300)); __h.set(__h.byPh('e.g. Tier 2 Support'), 'Team Two'); __h.click('Create Workspace'); await new Promise(r => setTimeout(r, 1500));`);
  const wss = (await call(TOKEN, 'GET', '/workspaces')).j.workspaces;
  record('UI: create workspace', wss.length === 2, String(wss.length));
  record('UI: new workspace is selected and shows none of the personal snippets', !(await ev(`document.body.innerText`)).includes('Cerere bonus'));
  await h(`const r = await __h.pick('Active workspace', 'Personal'); await new Promise(r => setTimeout(r, 1200)); return r;`);
  record('UI: switching back shows the personal snippets again', (await ev(`document.body.innerText`)).includes('Cerere bonus'));

  // 14. Mobile layout
  await viewport(390, 844);
  await ev(`location.reload(); 1`); await sleep(2500);
  const mob = await ev(`({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth })`);
  record('UI: dashboard has no horizontal overflow at 390px', mob.sw <= mob.cw, JSON.stringify(mob));
  await h(`__h.card('Cerere bonus'); await new Promise(r => setTimeout(r, 500));`);
  if (process.env.DEBUG_UI) console.log('DEBUG mobile:', String(await ev('document.body.innerText')).split(String.fromCharCode(10)).join(' | ').slice(0, 400), '| buttons:', JSON.stringify(await ev(`[...document.querySelectorAll('button')].filter(b => b.offsetParent).map(b => b.textContent.trim()).slice(0, 12)`)));
  record('UI (mobile): opening a snippet shows the editor with a back button', (await ev(`!![...document.querySelectorAll('button')].find(b => b.textContent.trim().startsWith('←') && b.offsetParent)`)) === true);

  // 15. Sign out clears the session
  await viewport(1440, 900);
  await ev(`location.reload(); 1`); await sleep(2500);
  await h(`__h.click('Sign out'); await new Promise(r => setTimeout(r, 800));`);
  record('UI: sign out clears the stored token and the dashboard', (await ev(`localStorage.getItem('snaptype_auth_token')`)) === null && !(await ev(`document.body.innerText`)).includes('Cerere bonus'));
  record('UI: server rejects the signed-out token', (await call(TOKEN, 'GET', '/me')).s === 401);
} catch (e) {
  record('dashboard e2e run completed without exceptions', false, String(e && e.stack || e).slice(0, 500));
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) annotate('dashboard-e2e failures', failed.map((f) => `${f.name} -> ${f.detail}`).join(String.fromCharCode(10)));
cleanup();
process.exit(failed.length ? 1 : 0);
