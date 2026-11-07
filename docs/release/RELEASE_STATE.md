# SnapType Release State (checkpoint)

**Verdict: NOT release-ready.** Large parts of the product are now verified, but open P1 items and external blockers remain (below). Evidence: `TEST_MATRIX.md`. Tracker: `ISSUES.md`.

Base commit of this work: `c9db21f`. Work is committed directly to `main`; see `git log` for the latest SHA and the GitHub Actions page for the matching run.

## Verified so far
- CI is meaningful: typecheck, tests, web/API/extension builds, packaging, fresh Docker install, **real legacy MySQL upgrade** (CI #19 green), and a **real-Chrome extension E2E** step (added after #19; confirm green on the next run).
- Real Chrome 157 run of the actual extension: 36/36 checks (login via extension, sync, include/calc/table/conditional, expansion in textarea/input/contenteditable, password field skipped, server edit propagates, dynamic form/cancel/submit, date command, 409 conflict, workspace isolation, invitation, revocation clears cache, logout clears storage).
- Security/data fixes with regression tests: cross-workspace folder refs, invitation role escalation, admin limits, atomic invitation acceptance (code), OTP SMTP-failure lockout, auth rate limits, proxy IP handling, sync rollback/full-replace/stale responses, import/export fidelity.
- Visual redesign (owner request, JoyPixels-inspired): approved logo (`Frame 72.svg`, background rounded) is now the real mark everywhere (favicon, header, footer, auth modal, extension icons rendered by `scripts/brand/render-icons.mjs`); FontAwesome (SVG, tree-shaken) on homepage/header/footer/auth; Inter Variable self-hosted; pill buttons, filled rounded inputs, floating header; extension popup restyled and a real popup screenshot is saved to `docs/release/screenshots/`. Dashboard internals still use lucide icons (restyled via global tokens only).
- Homepage rebuilt: Lighthouse mobile 100/100/100/100 (perf/a11y/best-practices/SEO), desktop 90/100/100/100 after the contrast fix; no overflow at 320-1440 px; real-engine demo.
- Dashboard usable on phones (single-pane navigation, modals fit). Native alert/confirm replaced by in-app dialogs (delete-snippet flow checked in the browser).
- `scripts/ci/api-smoke.mjs` (35 checks: auth, isolation, folders, conflicts, tombstone sync, concurrent invitation acceptance, ownership transfer, tables, export->import) passes locally on the in-memory repository and is wired to run against MySQL in CI (confirm green).
- Ownership transfer implemented (API, both repositories, UI) so owners can leave shared workspaces; invitation emails HTML-escaped; native export is re-importable.
- Firefox production package passes Mozilla's `web-ext lint` (0 errors/0 warnings).
- Docs cleaned: unverified reports removed; README/TESTING/PERFORMANCE rewritten honestly.

## Open items (priority order)
1. **Firefox runtime is NOT TESTED** (no Firefox here). Manifest/ID/permissions are checked by tests only. Needs `web-ext run` or a Firefox CI job. (RB-007)
2. Real-MySQL: the smoke test must be confirmed green on CI (atomic invitation claim, tombstones, ownership transfer run there for the first time); interrupted-DDL retry still untested. (RB-004, RB-027)
3. Audit still pending: account deletion with shared workspaces, Data Table concurrency/scale, revision restore, session rotation, log hygiene, role-change endpoint. (RB-020)
4. Extension bridge origin allow-list hard-codes `snaptype.app`; derive from configured URL. (RB-019)
5. Dashboard keyboard/a11y pass and manual UI checks of folders, data tables, import/export, settings, team screens. (RB-018 done)
6. Homepage: canonical URL, sitemap, social image, approved logo (see blockers).
7. Not measured: extension idle CPU/memory, keystroke latency in pages, startup time (see `PERFORMANCE.md`).
8. Browser editor matrix (rich-text editors, React controlled inputs, iframes, shadow DOM) not tested; do not claim compatibility.

## Owner-only blockers
- Production domain/URLs (needed for canonical, sitemap, OG image, `SNAPTYPE_API_URL`/`SNAPTYPE_APP_URL` release builds, store listings).
- SMTP credentials and `SMTP_FROM` domain.
- Chrome Web Store / Mozilla Add-ons accounts and submission (not done by the agent); Mozilla data-collection declaration and store screenshots/description.
- Approved SnapType logo (none in repo; the current mark is an original stand-in in `apps/web/src/components/Logo.tsx`).

## How to resume
```bash
npm ci && npm run build:packages && npm run typecheck && npm test
node scripts/e2e/chrome-extension-e2e.mjs            # needs Chrome; throw-away API, never touches real data
bash scripts/ci/legacy-upgrade-test.sh               # needs Docker; DESTRUCTIVE to the compose stack volume
```
Note: branded Chrome ignores `--load-extension`; the E2E script loads the extension through CDP `Extensions.loadUnpacked`. Kill stale `tsx`/Chrome processes before re-running if a run was interrupted.
