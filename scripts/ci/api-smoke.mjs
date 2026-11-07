#!/usr/bin/env node
// API smoke test against a real running server. In CI it targets a real MySQL (DATABASE_URL);
// locally, without DATABASE_URL, it uses the in-memory repository so the script itself can be debugged.
//   DATABASE_URL=mysql://user:pass@127.0.0.1:3306/db node scripts/ci/api-smoke.mjs
// Throw-away data only: every run registers fresh random accounts.
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '../..');
const PORT = 3200 + Math.floor(Math.random() * 50);
const API = `http://127.0.0.1:${PORT}/api/v1`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const failures = [];
const check = (name, ok, detail = '') => { results.push(ok); if (!ok) failures.push(`${name} -> ${detail}`); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  -> ' + detail}`); };
const annotate = (title, text) => console.log('::error title=' + title + '::' + String(text).split('%').join('%25').split(String.fromCharCode(13)).join('').split(String.fromCharCode(10)).join('%0A').slice(0, 3500));

let log = '';
const env = { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: '' };
if (!process.env.DATABASE_URL) env.DATABASE_URL = '';
const server = spawn('npx', ['tsx', 'apps/api/src/server.ts'], { cwd: ROOT, shell: true, env });
server.stdout.on('data', (d) => (log += d)); server.stderr.on('data', (d) => (log += d));
const stop = () => { if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' }); else server.kill(); };
process.on('exit', stop);

let health;
for (let i = 0; i < 90; i++) { try { const r = await fetch(`http://127.0.0.1:${PORT}/health`); if (r.ok) { health = await r.json(); break; } } catch {} await sleep(1000); }
if (!health) { console.log(log.slice(-1500)); console.log('FAIL  server did not start'); annotate('api-smoke: server did not start', log.slice(-2500)); process.exit(1); }
check(`server up, database mode = ${health.database?.mode ?? JSON.stringify(health.database)}`, true);
if (process.env.DATABASE_URL) check('server is using MySQL (not the in-memory fallback)', JSON.stringify(health.database).includes('mysql'), JSON.stringify(health.database));

const call = async (tok, method, url, body) => {
  const r = await fetch(API + url, { method, headers: { ...(tok ? { authorization: `Bearer ${tok}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await r.json(); } catch {}
  return { s: r.status, j: json };
};
const signup = async (email) => {
  const before = log.length;
  const rq = await call(null, 'POST', '/auth/request-otp', { email });
  if (rq.s !== 200) throw new Error('request-otp ' + rq.s);
  let code;
  for (let i = 0; i < 20 && !code; i++) { code = /CODE: \[ (\d{6}) \]/.exec(log.slice(before))?.[1]; if (!code) await sleep(250); }
  const v = await call(null, 'POST', '/auth/verify-otp', { email, code });
  if (v.s !== 200) throw new Error('verify-otp ' + v.s + JSON.stringify(v.j));
  return { token: v.j.token, user: v.j.user, isNew: v.j.isNewUser };
};

try {
  const id = Date.now();
  const A = await signup(`a-${id}@example.test`);
  const B = await signup(`b-${id}@example.test`);
  check('sign-up creates users', A.isNew && B.isNew);
  const replay = await call(null, 'POST', '/auth/verify-otp', { email: `a-${id}@example.test`, code: '000000' });
  check('wrong/replayed OTP is rejected', replay.s === 401, String(replay.s));
  check('protected route without token -> 401', (await call(null, 'GET', '/snippets')).s === 401);

  const meA = (await call(A.token, 'GET', '/me')).j;
  const wsA = meA.workspaces[0].workspace.id;
  const meB = (await call(B.token, 'GET', '/me')).j;
  const wsB = meB.workspaces[0].workspace.id;
  const seeded = (await call(A.token, 'GET', `/snippets?workspaceId=${wsA}`)).j.snippets;
  check('starter snippets seeded (5)', seeded.length === 5, String(seeded.length));
  check('user B cannot read user A workspace (cross-account isolation)', (await call(B.token, 'GET', `/snippets?workspaceId=${wsA}`)).s === 403);

  // Folders + snippets
  const f1 = (await call(A.token, 'POST', '/folders', { workspaceId: wsA, name: 'Support' })).j.folder;
  const f2 = (await call(A.token, 'POST', '/folders', { workspaceId: wsA, name: 'Billing', parentId: f1.id })).j.folder;
  check('nested folders created', Boolean(f1?.id && f2?.parentId === f1.id));
  const cyc = await call(A.token, 'PATCH', `/folders/${f1.id}`, { parentId: f2.id });
  check('folder cycle rejected', cyc.s === 400, String(cyc.s));
  const fB = (await call(B.token, 'POST', '/folders', { workspaceId: wsB, name: 'B private' })).j.folder;
  const xref = await call(A.token, 'POST', '/snippets', { workspaceId: wsA, name: 'x', shortcut: 'xref', plainContent: 'x', folderId: fB.id });
  check('snippet in another workspace\'s folder rejected', xref.s === 400, String(xref.s));

  const sn = (await call(A.token, 'POST', '/snippets', { workspaceId: wsA, name: 'Refund', shortcut: '/refund', plainContent: 'Ți-am returnat banii. ăîșțâ', folderId: f2.id, tags: ['a', 'b'], isFavorite: true })).j.snippet;
  check('snippet created with Romanian text, folder, tags', sn?.id && sn.plainContent === 'Ți-am returnat banii. ăîșțâ' && sn.folderId === f2.id);
  check('duplicate shortcut rejected', (await call(A.token, 'POST', '/snippets', { workspaceId: wsA, name: 'dup', shortcut: '/refund', plainContent: 'y' })).s === 400);
  const u1 = await call(A.token, 'PATCH', `/snippets/${sn.id}`, { plainContent: 'v2', expectedVersion: sn.version });
  const u2 = await call(A.token, 'PATCH', `/snippets/${sn.id}`, { plainContent: 'stale', expectedVersion: sn.version });
  check('optimistic concurrency: second stale write -> 409', u1.s === 200 && u2.s === 409, `${u1.s}/${u2.s}`);
  check('version incremented exactly once', u1.j.snippet.version === sn.version + 1, String(u1.j.snippet?.version));
  const revs = (await call(A.token, 'GET', `/snippets/${sn.id}/revisions`)).j.revisions;
  check('revision history recorded', revs.length >= 1, String(revs.length));
  check('viewer-level user B cannot edit A snippet', (await call(B.token, 'PATCH', `/snippets/${sn.id}`, { plainContent: 'hack' })).s >= 403);

  // Sync incl. tombstones
  const s0 = (await call(A.token, 'GET', `/sync?workspaceId=${wsA}&lastRevision=0`)).j;
  check('first sync is a full replace with all snippets', s0.fullSync === true && s0.snippets.length === 6, `${s0.fullSync}/${s0.snippets?.length}`);
  const doomed = seeded[0];
  await call(A.token, 'DELETE', `/snippets/${doomed.id}`);
  const s1 = (await call(A.token, 'GET', `/sync?workspaceId=${wsA}&lastRevision=${s0.currentRevision}`)).j;
  check('incremental sync reports the deleted snippet (tombstone) and no resurrection', s1.deletedSnippetIds.includes(doomed.id) && !s1.snippets.some((x) => x.id === doomed.id), JSON.stringify(s1.deletedSnippetIds));
  const s2 = (await call(A.token, 'GET', `/sync?workspaceId=${wsA}&lastRevision=${s1.currentRevision + 999}`)).j;
  check('client revision ahead of server => full replace', s2.fullSync === true && s2.snippets.length === 5);
  check('sync for a workspace the user is not in -> 403', (await call(B.token, 'GET', `/sync?workspaceId=${wsA}&lastRevision=0`)).s === 403);

  // Team workspace, invitation (concurrent acceptance), roles, ownership transfer
  const team = (await call(A.token, 'POST', '/workspaces', { name: 'Team' })).j.workspace;
  const inv = await call(A.token, 'POST', `/workspaces/${team.id}/members`, { email: `b-${id}@example.test`, role: 'editor' });
  check('invitation issued', inv.s === 201);
  const tok = new URL(inv.j.inviteLink).searchParams.get('token');
  const [acc1, acc2] = await Promise.all([call(B.token, 'POST', '/invitations/accept', { token: tok }), call(B.token, 'POST', '/invitations/accept', { token: tok })]);
  const codes = [acc1.s, acc2.s].sort();
  check('concurrent acceptance: exactly one succeeds', codes[0] === 200 && codes[1] === 400, codes.join(','));
  const mem = (await call(A.token, 'GET', `/workspaces/${team.id}/members`)).j.members;
  check('invitee is a member exactly once with the invited role', mem.filter((m) => (m.userId || m.user?.id) === B.user.id).length === 1 && mem.find((m) => (m.userId || m.user?.id) === B.user.id).role === 'editor');
  check('editor cannot invite', (await call(B.token, 'POST', `/workspaces/${team.id}/members`, { email: 'z@example.test', role: 'viewer' })).s === 403);
  check('owner role cannot be granted by invitation', (await call(A.token, 'POST', `/workspaces/${team.id}/members`, { email: 'o@example.test', role: 'owner' })).s === 400);
  check('owner cannot delete account while team has members', (await call(A.token, 'DELETE', '/me')).s === 400);
  const tr = await call(A.token, 'POST', `/workspaces/${team.id}/transfer-ownership`, { userId: B.user.id });
  check('ownership transfer', tr.s === 200, JSON.stringify(tr.j));
  const mem2 = (await call(B.token, 'GET', `/workspaces/${team.id}/members`)).j.members;
  check('roles swapped in the database', mem2.find((m) => (m.userId || m.user?.id) === B.user.id).role === 'owner' && mem2.find((m) => (m.userId || m.user?.id) === A.user.id).role === 'admin');

  // Data tables
  const t = (await call(B.token, 'POST', '/tables', { workspaceId: team.id, name: 'customers', columns: [{ id: 'c1', name: 'Email', key: 'email', type: 'text' }, { id: 'c2', name: 'Name', key: 'name', type: 'text' }] })).j.table;
  const row = await call(B.token, 'POST', `/tables/${t.id}/rows`, { email: 'x@example.test', name: 'X' });
  check('data table and row created', Boolean(t?.id) && row.s === 201);
  const ts = (await call(B.token, 'GET', `/sync?workspaceId=${team.id}&lastRevision=0`)).j;
  check('sync carries tables with rows', ts.tables?.[0]?.rows?.length === 1 && ts.tables[0].rows[0].data.email === 'x@example.test', JSON.stringify(ts.tables)?.slice(0, 200));
  check('table of another workspace is not readable by an outsider', (await call(A.token, 'GET', `/tables/${t.id}`)).s === 200 /* A is admin of team */);
  const C = await signup(`c-${id}@example.test`);
  check('outsider cannot read the table', (await call(C.token, 'GET', `/tables/${t.id}`)).s === 403);

  // Export -> import into a clean workspace
  const exp = (await call(A.token, 'GET', `/export?workspaceId=${wsA}`)).j;
  const dst = (await call(A.token, 'POST', '/workspaces', { name: 'Restore target' })).j.workspace;
  const imp = (await call(A.token, 'POST', '/import', { workspaceId: dst.id, snippets: exp.snippets, folders: exp.folders, format: 'snaptype_json', conflictStrategy: 'duplicate' })).j;
  check('import of a full export succeeds with no failures', imp.importedCount === exp.snippets.length && imp.failedCount === 0, JSON.stringify(imp).slice(0, 200));
  const back = (await call(A.token, 'GET', `/snippets?workspaceId=${dst.id}`)).j.snippets;
  const restored = back.find((x) => x.shortcut === '/refund');
  check('restored snippet keeps content, tags, favourite and folder hierarchy', restored?.plainContent === 'v2' && restored.isFavorite === true && restored.tags.join() === 'a,b' && Boolean(restored.folderId));

  // Logout revokes the token
  await call(C.token, 'POST', '/auth/logout');
  check('logged-out token is rejected', (await call(C.token, 'GET', '/me')).s === 401);
  // Account deletion of a user without shared workspaces
  check('account deletion succeeds and session dies', (await call(B.token, 'DELETE', '/me')).s === 400 /* B owns the team with A as member */);
} catch (e) {
  console.log('FAIL  smoke run threw: ' + e.message);
  console.log(log.slice(-1200));
  failures.push('threw: ' + e.message);
  results.push(false);
}
const failed = results.filter((r) => !r).length;
if (failed) annotate('api-smoke failures', failures.join(String.fromCharCode(10)) + String.fromCharCode(10) + '--- server log tail ---' + String.fromCharCode(10) + log.slice(-1500));
console.log(`\n${results.length - failed}/${results.length} checks passed`);
stop();
process.exit(failed ? 1 : 0);
