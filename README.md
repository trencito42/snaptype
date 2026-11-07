# SnapType

Text expansion for the browser: type a short code in any web text field and SnapType replaces it with a saved snippet. Snippets live in your account, are organised in folders, can be shared in workspaces, and can contain dynamic fields.

> Release status and verification evidence: [`docs/release/RELEASE_STATE.md`](docs/release/RELEASE_STATE.md). Known issues: [`docs/release/ISSUES.md`](docs/release/ISSUES.md).

## What is in this repository

| Path | Purpose |
|------|---------|
| `apps/api` | Fastify + TypeScript API, MySQL (Drizzle) with versioned SQL migrations, email-OTP auth, sync |
| `apps/web` | React + Vite homepage and dashboard |
| `apps/extension` | Manifest V3 extension for Chrome/Chromium and Firefox (esbuild) |
| `packages/shared` | Types and Zod schemas |
| `packages/snippet-engine` | Shortcut matcher, dynamic command renderer, formulas, dates |
| `packages/browser-compat` | Cross-browser helpers |
| `infrastructure/migrations` | Ordered MySQL migrations applied by the API at startup |
| `docs/release` | Release state, issue tracker, test matrix, performance notes |

## Features (what the code implements)

- Email one-time-code sign-in; sessions stored hashed server-side.
- Snippets with folders, tags, favourites, per-site restrictions, revisions, optimistic-concurrency saves with conflict handling.
- Workspaces with owner / admin / editor / viewer roles and email invitations.
- Data Tables usable from snippets; JSON/CSV import and export.
- Dynamic commands: dates, cursor, clipboard, selection, fill-in forms (text, paragraph, dropdown, toggle, date), conditions, repeats, formulas, snippet inclusion, table lookups, site context, notes. The in-app Command Browser examples are checked against the parser by `tests/unit/command-browser-parity.test.ts`.
- Chrome and Firefox extensions that sync the selected workspace and expand shortcuts in inputs, textareas and contenteditable fields.

What is **not** claimed: universal editor compatibility, measured idle CPU/memory in real browsers, or store availability. See the test matrix for what has actually been verified.

## Development

```bash
npm ci
npm run build:packages
npm run typecheck
npm test
npm run dev:api     # API on :3000 (in-memory repository when DATABASE_URL is unset; development only)
npm run dev:web     # web on :5173, proxies /api to :3000
npm run build:extension   # unpacked builds in dist/chrome and dist/firefox (development API URL)
```

In development the OTP code is printed to the API console. Production never logs codes and refuses to start without MySQL, applied migrations and valid secrets.

## Production

See [`DEPLOYMENT.md`](DEPLOYMENT.md). Copy `.env.docker.example` to `.env`, generate secrets (`openssl rand -hex 32`), then `docker compose up -d --build`. MySQL is not exposed outside the compose network; the API is bound to `127.0.0.1:3000`; the web container serves the dashboard and proxies `/api`. Terminate HTTPS at your reverse proxy.

Release extension packages require explicit URLs (no defaults):

```bash
SNAPTYPE_API_URL=https://your-host/api/v1 SNAPTYPE_APP_URL=https://your-host \
  npm run build:extension:prod && npm run package:extensions:prod
```

## Testing

`npm test` runs the Vitest suite (unit and in-memory API integration). CI additionally builds everything, runs a fresh Docker install and a real legacy-database upgrade on MySQL (`scripts/ci/legacy-upgrade-test.sh`). Browser-level extension testing is tracked in `docs/release/TEST_MATRIX.md`.
