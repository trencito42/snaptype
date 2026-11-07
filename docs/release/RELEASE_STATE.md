# SnapType Release State (checkpoint)

**Verdict: everything that can be done without the owner is done and verified; the product is NOT published and cannot be until the owner supplies the items under "Owner checklist".** Evidence: `TEST_MATRIX.md`; issue tracker: `ISSUES.md`; store material: `STORE_READINESS.md`, `store/`; performance: `PERFORMANCE.md`.

## Verified (and where)

| Area | Evidence |
|------|----------|
| Typecheck (6 projects), 198 unit/integration tests | local + CI |
| Real MySQL: fresh Docker install, legacy-schema upgrade, restart persistence, interrupted-upgrade recovery, fatal exit without migrations | CI (`scripts/ci/legacy-upgrade-test.sh`) |
| Whole API on real MySQL (35 checks) | CI (`scripts/ci/api-smoke.mjs`) |
| Chrome extension, real browser (41 checks: login, sync, expansion in textarea/input/contenteditable, password skipped, forms with custom controls, include/calc/table/conditional, offline/reconnect, workspace isolation, invitation, revocation, context-menu insert path, logout) | local + CI |
| Firefox extension, real browser (same scenario via Selenium/geckodriver) | CI |
| Dashboard UI driven in real Chrome (40 checks: create/edit/folder/move/search/duplicate/delete, real version conflict with Overwrite/Reload, history, command browser, data tables, import, settings, hotkey recorder, uniform control heights, `?new=` prefill, team invite/revoke, workspaces, mobile layout, sign-out) | local + CI |
| Security/data fixes with regression tests | RB-009..RB-016, RB-024, RB-025, RB-028, RB-031, RB-032, RB-034 |
| Homepage: responsive 320-1440 px, Lighthouse mobile 98/100/100/100, desktop 80/100/100/100 | measured locally |
| Mozilla `web-ext lint` on the production Firefox package | 0 errors, 0 warnings |

## Not verified / known limits (stated, not hidden)

- Native context-menu rendering cannot be automated in either browser; only the model and the message path it triggers are tested.
- Firefox: offline/reconnect and the context-menu message path are not exercised (adapter limits). Firefox store images reuse the Chrome captures (identical UI).
- `TRUST_PROXY` behaviour behind the bundled nginx is configured but not tested end to end (RB-017).
- Homepage desktop Lighthouse performance is 80 (webfont cost); screen-reader testing was not done.
- Extension idle CPU / browser-reported memory / startup time, Edge, Safari, rich-text editors, iframes, shadow DOM, and low-end-hardware behaviour are not measured; do not claim them.
- The perf harness could not verify expansion in every stage at 1,000/5,000 snippets (details in `PERFORMANCE.md`); the functional E2E passes.
- Changing an existing member's role is not implemented (not advertised).

## Owner checklist (only the owner can do these)

1. **Production domain and HTTPS reverse proxy.** Then set `SNAPTYPE_API_URL`/`SNAPTYPE_APP_URL`, build release packages (`npm run build:extension:prod && npm run package:extensions:prod`), and add canonical URL, `sitemap.xml` and a social preview image to the web app.
2. **SMTP credentials** (`SMTP_HOST/PORT/USER/PASS/SMTP_FROM`) with a sender domain you control, and real `.env` secrets (`openssl rand -hex 32`).
3. **Chrome Web Store and Mozilla Add-ons developer accounts**: submit `dist/chrome-extension.zip` and `dist/firefox-extension.zip`, upload `docs/release/store/{chrome,firefox}/*.png`, paste the listing text from `STORE_READINESS.md`.
4. **Firefox `data_collection_permissions` declaration** and the Chrome privacy-practices form: choose the categories (a legal declaration; draft facts are in `STORE_READINESS.md`). Have the Privacy and Terms pages reviewed by your legal advisor.
5. **A contact channel** for the footer and store listings (currently GitHub issues only).
6. Confirm you are happy with Clarity City (distributed via Fontsource under the SIL OFL) and the final logo usage.

## How to resume / re-verify

```bash
npm ci && npm run build:packages && npm run typecheck && npm test
node scripts/e2e/chrome-extension-e2e.mjs        # needs Chrome
node scripts/e2e/dashboard-e2e.mjs               # needs Chrome
node scripts/e2e/firefox-extension-e2e.mjs       # needs Firefox + geckodriver (CI has both)
node scripts/ci/api-smoke.mjs                    # DATABASE_URL=mysql://... for real MySQL
bash scripts/ci/legacy-upgrade-test.sh           # needs Docker; destroys the compose volume
```
Branded Chrome ignores `--load-extension`; the scripts use CDP `Extensions.loadUnpacked`. Kill stale `tsx`/Chrome processes before re-running an interrupted script.
