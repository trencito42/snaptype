// Browser-agnostic end-to-end scenario shared by the Chrome and Firefox runners.
// The runner supplies an adapter; every check below talks to the REAL extension through it.
export async function runScenario(ctx) {
  const { record, skip, sleep, msg, page, typeInto, pressKey, getToken, getStoredKeys, setOffline, sendToPage, otpFor, email, API_PORT } = ctx;
  // Expansion in real fields
  const val = (sel, prop = 'value') => page.eval(`document.querySelector(${JSON.stringify(sel)}).${prop}`);

  await typeInto('#ta', 'msver');
  const ta = await val('#ta');
  record('textarea: "msver" expands to the snippet text', typeof ta === 'string' && ta.includes('verificarea contului') && !ta.includes('msver'), JSON.stringify(ta)?.slice(0, 90));
  await typeInto('#inp', 'retragere');
  const inp = await val('#inp');
  record('text input: "retragere" expands (single line)', typeof inp === 'string' && inp.startsWith('Solicitarea') && inp.length > 40 && !inp.includes(String.fromCharCode(10)), JSON.stringify(inp)?.slice(0, 90));
  await typeInto('#ce', 'cerbonus');
  const ce = await val('#ce', 'innerText');
  record('contenteditable: "cerbonus" expands', typeof ce === 'string' && ce.includes('bonus') && !ce.startsWith('cerbonus'), JSON.stringify(ce)?.slice(0, 90));
  await typeInto('#pw', 'msver');
  record('password field is never expanded', (await val('#pw')) === 'msver');

  // Server edit reaches the extension without logout
  const token = await getToken();
  const H = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  const list = await (await fetch(`http://127.0.0.1:${API_PORT}/api/v1/snippets`, { headers: H })).json();
  const target = list.snippets.find((s) => s.shortcut === 'msver');
  const patch = await fetch(`http://127.0.0.1:${API_PORT}/api/v1/snippets/${target.id}`, { method: 'PATCH', headers: H, body: JSON.stringify({ plainContent: 'EDITED-ON-SERVER', expectedVersion: target.version }) });
  record('dashboard-side edit saved on the server', patch.ok, String(patch.status));
  const sync = await msg({ action: 'SYNC_NOW' });
  record('manual sync succeeds', sync?.success === true);
  await page.eval(`document.querySelector('#ta').value=''`);
  await typeInto('#ta', 'msver');
  record('edited snippet text is used after sync (no logout needed)', (await val('#ta')) === 'EDITED-ON-SERVER', JSON.stringify(await val('#ta')));

  // Context-menu path: the background sends EXPAND_SNIPPET to the page frame the user right-clicked in
  if (!sendToPage) { skip('context menu insert (EXPAND_SNIPPET message)', 'not supported by this browser adapter'); } else {
    const data = await msg({ action: 'GET_DATA' });
    const sn = data.snippets.find((x) => x.shortcut === 'msver');
    await page.eval(`(() => { const t = document.querySelector('#ta'); t.value = ''; t.focus(); })()`);
    await sendToPage({ action: 'EXPAND_SNIPPET', snippet: sn });
    await sleep(500);
    record('context menu: inserting a snippet from the menu puts its text into the focused field', (await val('#ta')) === 'EDITED-ON-SERVER', JSON.stringify(await val('#ta')));
    const formSn = data.snippets.find((x) => x.shortcut === '/salut');
    await page.eval(`(() => { const t = document.querySelector('#ta'); t.value = ''; t.focus(); })()`);
    await sendToPage({ action: 'EXPAND_SNIPPET', snippet: formSn });
    await sleep(500);
    record('context menu: a snippet with fields opens the fill-in form first', (await page.eval(`!!document.querySelector('.snaptype-modal')`)) === true);
    await pressKey('Escape');
    await sleep(300);
  }

  // Dynamic form snippet: form appears, values are applied, Esc cancels safely
  await page.eval(`document.querySelector('#ta').value=''`);
  await typeInto('#ta', '/salut');
  const formOpen = await page.eval(`!!document.querySelector('.snaptype-modal')`);
  record('dynamic-form snippet "/salut" opens the fill-in form (no raw {{tags}} inserted)', formOpen === true && !/\{\{/.test(await val('#ta')), 'form=' + formOpen);
  await pressKey('Escape');
  await sleep(300);
  record('Esc cancels the form and leaves the typed shortcut untouched', (await page.eval(`!document.querySelector('.snaptype-modal')`)) && (await val('#ta')) === '/salut', JSON.stringify(await val('#ta')));
  await page.eval(`document.querySelector('#ta').value=''`);
  await typeInto('#ta', '/salut');
  await page.eval(`(() => { const i = document.querySelector('.snaptype-modal input'); i.focus(); i.value = 'Ana'; i.dispatchEvent(new Event('input', {bubbles:true})); document.querySelector('.snaptype-btn-primary').click(); })()`);
  await sleep(500);
  const filled = await val('#ta');
  record('submitting the form inserts the personalised text', typeof filled === 'string' && filled.startsWith('Bună ziua, Ana,'), JSON.stringify(filled)?.slice(0, 80));

  // Date/time command resolves to real values
  await page.eval(`document.querySelector('#ta').value=''`);
  await typeInto('#ta', '/closing');
  const closing = await val('#ta');
  record('{{date}}/{{time}} snippet renders concrete values', typeof closing === 'string' && !/\{\{/.test(closing) && /\d{4}-\d{2}-\d{2}/.test(closing), JSON.stringify(closing)?.slice(-70));

  // Real optimistic-concurrency conflict from two sessions
  const fresh = await (await fetch(`http://127.0.0.1:${API_PORT}/api/v1/snippets/${target.id}`, { headers: H })).json();
  const ok1 = await fetch(`http://127.0.0.1:${API_PORT}/api/v1/snippets/${target.id}`, { method: 'PATCH', headers: H, body: JSON.stringify({ description: 'tab A', expectedVersion: fresh.snippet.version }) });
  const stale = await fetch(`http://127.0.0.1:${API_PORT}/api/v1/snippets/${target.id}`, { method: 'PATCH', headers: H, body: JSON.stringify({ description: 'tab B', expectedVersion: fresh.snippet.version }) });
  record('second writer with a stale version gets HTTP 409', ok1.status === 200 && stale.status === 409, `${ok1.status}/${stale.status}`);

  // Custom form controls (dropdown, switch, calendar) driven like a user would
  const mkc = await fetch(`${API_PORT ? 'http://127.0.0.1:' + API_PORT + '/api/v1' : ''}/snippets`, { method: 'POST', headers: H, body: JSON.stringify({ name: 'Controls', shortcut: 'ctrlx', plainContent: 'Plan={{form:plan|options="Basic,Pro,Team"}} VIP={{form:vip|type=toggle}} Date={{form:when|type=date}}' }) });
  await msg({ action: 'SYNC_NOW' });
  await page.eval(`document.querySelector('#ta').value=''`);
  await typeInto('#ta', 'ctrlx');
  const ui = (js) => page.eval(js);
  const noNative = await ui(`!document.querySelector('.snaptype-modal select:not(.snaptype-native-hidden), .snaptype-modal input[type=checkbox]:not(.snaptype-native-hidden), .snaptype-modal input[type=date]')`);
  record('form uses custom controls only (no visible native select/checkbox/date)', mkc.status === 201 && noNative === true, 'status=' + mkc.status + ' noNative=' + noNative);
  await ui(`document.querySelector('.snaptype-dd-btn[role=combobox]').click()`);
  const listShown = await ui(`!!document.querySelector('.snaptype-dd-list')`);
  await ui(`[...document.querySelectorAll('.snaptype-dd-list li')].find(li => li.textContent.includes('Pro')).click()`);
  await ui(`document.querySelector('.snaptype-sw').click()`);
  await ui(`[...document.querySelectorAll('.snaptype-dd-btn')].find(b => !b.getAttribute('role')).click()`);
  const calShown = await ui(`!!document.querySelector('.snaptype-cal')`);
  await ui(`[...document.querySelectorAll('.snaptype-cal-day')].find(b => b.textContent === '15').click()`);
  record('custom dropdown list and calendar open', listShown === true && calShown === true, `list=${listShown} cal=${calShown}`);
  await ui(`document.querySelector('.snaptype-btn-primary').click()`);
  await sleep(500);
  const ctrl = await val('#ta');
  record('values chosen through the custom controls are inserted', typeof ctrl === 'string' && /^Plan=Pro VIP=true Date=\d{4}-\d{2}-15/.test(ctrl), JSON.stringify(ctrl));

  // Composition: include, formula, Data Table lookup (all resolved inside the extension)
  const API0 = `http://127.0.0.1:${API_PORT}/api/v1`;
  const mk = async (body) => (await fetch(`${API0}/snippets`, { method: 'POST', headers: H, body: JSON.stringify(body) })).status;
  const tbl = await (await fetch(`${API0}/tables`, { method: 'POST', headers: H, body: JSON.stringify({ name: 'customers', columns: [{ id: 'c1', name: 'Email', key: 'email', type: 'text' }, { id: 'c2', name: 'Name', key: 'name', type: 'text' }] }) })).json();
  const tid = tbl.table?.id || tbl.id;
  const rowRes = await fetch(`${API0}/tables/${tid}/rows`, { method: 'POST', headers: H, body: JSON.stringify({ email: 'ana@example.test', name: 'Ana Pop' }) });
  record('data table + row created through the API', Boolean(tid) && rowRes.status === 201, `tid=${tid} rowStatus=${rowRes.status} ${JSON.stringify(tbl).slice(0, 120)}`);
  const created = await Promise.all([
    mk({ name: 'inc', shortcut: 'incl', plainContent: 'Salut! {{include:retragere}}' }),
    mk({ name: 'calc', shortcut: 'calcx', plainContent: 'Total: {{calc: 19.99 * 3}} RON' }),
    mk({ name: 'lookup', shortcut: 'lookupx', plainContent: 'Hello {{table:customers|lookup=email|value=ana@example.test|column=name}}!' }),
    mk({ name: 'cond', shortcut: 'condx', plainContent: '{{#if vip}}VIP{{else}}Standard{{/if}} customer' })
  ]);
  record('composition snippets created', created.every((c) => c === 201), created.join(','));
  await msg({ action: 'SYNC_NOW' });
  const typeFresh = async (sel, text) => { await page.eval(`document.querySelector(${JSON.stringify(sel)}).value=''`); await typeInto(sel, text); return val(sel); };
  const incl = await typeFresh('#ta', 'incl');
  record('{{include:...}} pulls in another snippet', typeof incl === 'string' && incl.startsWith('Salut! Solicitarea dumneavoastr'), JSON.stringify(incl)?.slice(0, 70));
  const calc = await typeFresh('#ta', 'calcx');
  record('{{calc:...}} evaluates arithmetic', calc === 'Total: 59.97 RON', JSON.stringify(calc));
  const look = await typeFresh('#ta', 'lookupx');
  record('Data Table lookup resolves from synced table', look === 'Hello Ana Pop!', JSON.stringify(look));
  const cond = await typeFresh('#ta', 'condx');
  record('conditional renders a branch without leftover tags', typeof cond === 'string' && /customer$/.test(cond) && !/\{\{|\{\//.test(cond), JSON.stringify(cond));

  // Offline / reconnection: the service worker's network fails, cached snippets must keep working
  if (!setOffline) { skip('offline / reconnection', 'not supported by this browser adapter'); } else {
  await setOffline(true);
  const offSync = await msg({ action: 'SYNC_NOW' });
  const offData = await msg({ action: 'GET_DATA' });
  record('offline: sync reports failure but the cached snippets are NOT wiped', offSync?.success === false && offData.snippets.length >= 5, `success=${offSync?.success} cached=${offData.snippets.length}`);
  const offExp = await typeFresh('#ta', 'incl');
  record('offline: expansion keeps working from cache', typeof offExp === 'string' && offExp.startsWith('Salut!'), JSON.stringify(offExp)?.slice(0, 40));
  await mk({ name: 'while-offline', shortcut: 'wasoff', plainContent: 'ARRIVED-AFTER-RECONNECT' }).catch(() => 0);
  await setOffline(false);
  const onSync = await msg({ action: 'SYNC_NOW' });
  record('reconnect: next sync succeeds and picks up changes made while offline', onSync?.success === true && (await msg({ action: 'GET_DATA' })).snippets.some((x) => x.shortcut === 'wasoff'));
  }

  // Workspace isolation, invitation and revocation (extension account = invitee)
  const API = `http://127.0.0.1:${API_PORT}/api/v1`;
  const call = async (tok, method, url, body) => { const r = await fetch(API + url, { method, headers: { authorization: `Bearer ${tok}`, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }); let j = null; try { j = await r.json(); } catch {} return { status: r.status, json: j }; };
  const ownerEmail = `owner-${Date.now()}@example.test`;
  const ownerCode = await otpFor(ownerEmail);
  const ownerLogin = await (await fetch(`${API}/auth/verify-otp`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: ownerEmail, code: ownerCode }) })).json();
  const ownerTok = ownerLogin.token;
  const wsRes = await call(ownerTok, 'POST', '/workspaces', { name: 'Shared Team' });
  const teamWs = wsRes.json.workspace.id;
  await call(ownerTok, 'POST', '/snippets', { workspaceId: teamWs, name: 'Team only', shortcut: 'teamonly', plainContent: 'TEAM-SECRET' });
  const inv = await call(ownerTok, 'POST', `/workspaces/${teamWs}/members`, { email, role: 'viewer' });
  const inviteToken = new URL(inv.json.inviteLink).searchParams.get('token');
  const wrongAccept = await call(ownerTok, 'POST', '/invitations/accept', { token: inviteToken });
  record('invitation cannot be accepted by a different account', wrongAccept.status === 400, String(wrongAccept.status));
  const accept = await call(token, 'POST', '/invitations/accept', { token: inviteToken });
  record('invitee accepts the invitation', accept.status === 200, String(accept.status));

  const before = await msg({ action: 'GET_DATA' });
  const personalIds = new Set(before.snippets.map((x) => x.workspaceId));
  const sel = await msg({ action: 'SELECT_WORKSPACE', workspaceId: teamWs });
  const afterSel = await msg({ action: 'GET_DATA' });
  record('switching workspace loads only that workspace (no leakage from personal)', sel?.success === true && afterSel.snippets.length === 1 && afterSel.snippets[0].shortcut === 'teamonly' && afterSel.snippets.every((x) => x.workspaceId === teamWs) && !personalIds.has(teamWs), JSON.stringify({ n: afterSel.snippets.length, ws: afterSel.currentWorkspaceId === teamWs }));
  await page.eval(`document.querySelector('#ta').value=''`);
  await typeInto('#ta', 'teamonly');
  record('shared-workspace snippet expands', (await val('#ta')) === 'TEAM-SECRET', JSON.stringify(await val('#ta')));
  await page.eval(`document.querySelector('#ta').value=''`);
  await typeInto('#ta', 'msver');
  record('personal-workspace snippet does NOT expand while the team workspace is selected', (await val('#ta')) === 'msver', JSON.stringify(await val('#ta')));

  const myId = (await call(token, 'GET', '/me')).json?.user?.id;
  const members = await call(ownerTok, 'GET', `/workspaces/${teamWs}/members`);
  const meMember = (members.json.members || []).find((m) => (m.user?.email || m.email) === email);
  const del = await call(ownerTok, 'DELETE', `/workspaces/${teamWs}/members/${meMember?.userId || myId}`);
  record("owner revokes the invitee's membership", del.status === 200, `${del.status} ${JSON.stringify(del.json)} target=${meMember?.userId || myId}`);
  await msg({ action: 'SYNC_NOW' });
  const revoked = await msg({ action: 'GET_DATA' });
  record("after revocation the extension drops the workspace's cached snippets", revoked.snippets.length === 0, 'snippets=' + revoked.snippets.length);
  await page.eval(`document.querySelector('#ta').value=''`);
  await typeInto('#ta', 'teamonly');
  record('revoked content no longer expands', (await val('#ta')) === 'teamonly', JSON.stringify(await val('#ta')));

  // Logout clears protected data
  await msg({ action: 'LOGOUT' });
  const after = await msg({ action: 'GET_STATUS' });
  record('logout clears token and cached snippets', after?.isAuthenticated === false && after?.snippetsCount === 0, JSON.stringify(after));
  const stored = await getStoredKeys();
  record('no auth token left in extension storage after logout', !stored.includes('snaptype_token'), JSON.stringify(stored));
  const reLogin = await page.eval(`1`);
  void reLogin;
}
