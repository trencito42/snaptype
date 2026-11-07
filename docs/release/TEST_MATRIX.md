# SnapType Test Matrix

Authoring environment: Windows 11, Node 24 (CI: Node 22), Chrome 157.0.8103.38 and Edge 157 installed, **no Docker, no MySQL, no Firefox**. Items needing those are verified only through GitHub Actions or are NOT TESTED.

Legend: PASS = observed result. NOT TESTED = no evidence, reason given. CI = verified by a GitHub Actions run (run numbers refer to the `SnapType CI & Release Verification` workflow).

## Build and automated tests

| Area | Result | Evidence |
|------|--------|----------|
| Typecheck of 6 TS projects | PASS | local, every commit |
| Vitest (26 files, 179 tests: unit + in-memory API integration) | PASS | local |
| Same on CI, build web/API/extensions, package zips | PASS | CI #16, #17, #19 |
| Mock-connection migration unit tests | PASS (weak) | do not prove real MySQL behaviour |

## Database / deployment (real MySQL, in CI only)

| Area | Result | Evidence |
|------|--------|----------|
| Fresh `docker compose` install + `/health` | PASS | CI #19 |
| Legacy-schema upgrade on a persistent volume (fixture `tests/fixtures/legacy/legacy_schema.sql`): data kept, invitation token hashed, plaintext column dropped, restart persistence, fatal exit without migrations | PASS (see note) | CI #19. #15 and #18 failed in the same stage before diagnostics existed; root cause hypothesis = readiness probe satisfied by MySQL's temporary init server. Probe moved to TCP in the commit after #19; confirm in the next run |
| Atomic invitation acceptance on MySQL | NOT TESTED | code path (`mysql-repository.ts`) never executed against MySQL |
| Interrupted-DDL retry on MySQL | NOT TESTED | RB-004 |
| MySQL vs in-memory repository parity | NOT TESTED | no MySQL-backed API integration suite |

## Real Chrome extension (`scripts/e2e/chrome-extension-e2e.mjs`, Chrome 157, headless, throw-away in-memory API)

All 39 checks PASS locally (2026-11-07):
service worker starts; OTP request and login through the extension's own messages; first sync = 5 starter snippets; expansion in textarea, single-line input and contenteditable; password field not expanded; server-side edit reaches the extension after SYNC_NOW without logout; dynamic form opens (no raw tags), Esc cancels and leaves the typed shortcut, submit inserts personalised text with the shortcut removed (this run found and fixed a caret bug); `{{date}}/{{time}}` render concrete values; stale-version write returns 409; `{{include}}`, `{{calc}}`, Data Table lookup and `{{#if}}` render correctly from synced data; workspace switch loads only the selected workspace (no leakage), team snippet expands while personal does not; wrong-account invitation acceptance refused, right account accepts; owner revokes membership and the extension drops the cached snippets and stops expanding; offline sync failure keeps cached snippets, expansion works offline, reconnect picks up changes; logout clears token and cached snippets.

Not covered by that script: clipboard/selection commands, periodic (alarm) sync, assistant hotkey, context menu, popup UI, rich-text/React editors, iframes, shadow DOM, Edge as the host browser. All NOT TESTED in a browser.

## Firefox

| Area | Result | Reason |
|------|--------|--------|
| Manifest validity, ID `extension@snaptype.app` preserved, minimal permissions, no loopback in production | PASS | `tests/unit/extension-build.test.ts` runs the real build |
| Any runtime behaviour (background scripts, storage, expansion, forms, sync) | NOT TESTED | Firefox not installed here; `web-ext`/geckodriver not available |

## Web application (in-app Chromium, dev API)

| Area | Result | Evidence |
|------|--------|----------|
| Email-OTP sign-up/login in the UI, dashboard loads with 5 starter snippets | PASS | manual browser run |
| Homepage: no horizontal overflow at 320/360/375/430/768/1280 | PASS | browser measurement |
| Homepage demo: `/late` form + insert, `/thx` | PASS | scripted DOM run |
| Dashboard at 375px: no overflow, list -> editor -> back -> nav, four modals fit | PASS | browser measurement |
| Homepage 390/1024/1440, Lighthouse, screen reader, contrast audit, iOS Safari | NOT TESTED | tooling/device not available |
| Creating/editing/saving/deleting a snippet, folders, data tables, import/export, settings, team UI by hand | NOT TESTED in the UI | API behaviour covered by integration tests |

## API behaviour (vitest, in-memory repository)

PASS: folder cross-workspace references, OTP failure not locking out, sync full-replace/rollback/403 isolation, import/export round trip (nested folders, metadata, diacritics), invalid import items reported, membership permission matrix (invite roles, admin limits, self-leave, stale access, wrong-email and replay acceptance), command-browser examples all accepted by the parser.

NOT TESTED / NOT AUDITED: account deletion with shared workspaces, Data Table concurrency and large data sets, revision restore, session rotation, folder tree at scale, logging of sensitive data.

## CI evidence

Run https://github.com/trencito42/snaptype/actions/runs/42420301897 (commit `0900288`) passed every step: typecheck, tests, API smoke on real MySQL (atomic invitation claim, tombstones, ownership transfer, export/import), builds, packaging, real-Chrome extension E2E, fresh Docker install, legacy-schema upgrade. Commits after it (dashboard header fix `bf8e77a`) have not been confirmed by CI yet.

## Update (final pass)

- Firefox: shared scenario passes in real Firefox in CI (Selenium + geckodriver); offline and context-menu-message checks are skipped for Firefox (printed as SKIP).
- Dashboard: `scripts/e2e/dashboard-e2e.mjs` 40/40 in real Chrome against a throw-away backend (also in CI).
- Chrome extension E2E: 41/41.
- Lighthouse (local, after redesign): mobile 98/100/100/100, desktop 80/100/100/100.
- Unit/integration: 198 tests.
- Latest CI run confirmed green: run 42424137389 (commit `79c7b54`). Commits after it are listed in the final report with their own run.
