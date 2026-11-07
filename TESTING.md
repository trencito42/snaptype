# Testing

## Automated (run in CI and locally)

```bash
npm run build:packages
npm run typecheck      # six TypeScript projects
npm test               # vitest: unit + in-memory API integration
```

Notable suites:

- `tests/integration/permissions-matrix.test.ts` — owner/admin/editor/viewer rules for invitations and member removal.
- `tests/integration/release-audit.test.ts` — cross-workspace folder references, OTP delivery failure, sync full-replace/rollback, import/export round-trip.
- `tests/unit/command-browser-parity.test.ts` — every command shown in the Command Browser is validated and rendered by the real parser.
- `tests/unit/extension-build.test.ts` — runs the real extension build script: version stamping, production URL requirements, no loopback permissions, minimal permissions, Firefox ID preserved.
- `tests/unit/migrate.test.ts` — migration runner logic against a **mock** connection (does not prove real MySQL behaviour).

## CI only (needs Docker/MySQL)

- Fresh `docker compose` install and `/health` probe.
- `scripts/ci/legacy-upgrade-test.sh`: loads `tests/fixtures/legacy/legacy_schema.sql` (a genuine pre-revision schema with data) into an empty MySQL volume, starts the API on top, and asserts data preservation, invitation token hashing, restart persistence and fatal exit without migrations. It ends with `docker compose down -v` — only run it against a disposable stack.

## Manual / browser verification

Real-browser extension checks are tracked in `docs/release/TEST_MATRIX.md`. The built-in Test Playground page (`/` → Test playground) offers inputs, textareas, contenteditable and password fields for manual expansion checks.
