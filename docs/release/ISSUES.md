# SnapType Release Issues (canonical tracker)

Priorities: P0 data/security, P1 functional, P2 polish. Status: OPEN / FIXED-UNVERIFIED (fix committed, awaiting CI/real-browser evidence) / VERIFIED.

| ID | Pri | Status | Issue | Root cause / files | Acceptance criteria |
|----|-----|--------|-------|--------------------|---------------------|
| RB-001 | P0 | FIXED-UNVERIFIED | CI "persistent upgrade" test never tested a legacy upgrade | `docker-compose.yml` mounted `infrastructure/migrations` into `/docker-entrypoint-initdb.d`, so a fresh MySQL volume was initialised with the LATEST schema; the seed used `CREATE TABLE IF NOT EXISTS` (no-ops). Fixed: initdb mount removed (API migration runner is the sole schema owner); real legacy fixture `tests/fixtures/legacy/legacy_schema.sql`; test in `scripts/ci/legacy-upgrade-test.sh` asserts the DB is empty first, that `snippets.revision` is absent, then verifies hash backfill, dropped `token` column, preserved Romanian-text snippet/folder, restart persistence, and fatal exit without migrations. | CI job step "Legacy Upgrade" green on GitHub Actions |
| RB-002 | P0 | FIXED-UNVERIFIED | Invalid Bash in workflow (`\$(...)` escapes inside YAML `run: |`), so hash comparison could never work | `.github/workflows/ci.yml`; logic moved into the script above (valid syntax, `set -euo pipefail`) | Script runs under `bash` in CI |
| RB-003 | P1 | FIXED-UNVERIFIED | Static DB root password hardcoded in CI | `.env.docker.example` placeholders reused as real secrets; now `openssl rand` per run, `MYSQL_PWD` env instead of `-p` argv | No static secrets in workflow |
| RB-004 | P0 | OPEN | Legacy migration relies on code-path (`ensureColumnExists`, `upgradeWorkspaceInvitationsTokenHash`) outside the transaction/tracking of `schema_migrations`; partial-failure retry untested on real MySQL | `apps/api/src/db/migrate.ts` | Real-MySQL test of interrupted upgrade + retry |
| RB-005 | P1 | OPEN | Whole-product audit (phases 1-7 of the release brief) not yet performed: auth/OTP, permissions matrix, sync, data tables, import/export, grammar/UI parity, editors | see TEST_MATRIX.md | Each row in TEST_MATRIX = PASS with evidence |
| RB-006 | P1 | OPEN | Homepage not yet independently reviewed or rebuilt | `apps/web` | Phase 4 criteria |
| RB-007 | P1 | OPEN | Extensions never executed in real Chrome/Firefox in this audit | no browser automation harness for MV3 | Phase 6 rows PASS |
| RB-008 | P2 | OPEN | Legacy docs in repo root (`AUDIT_REPORT.md`, `AGENT_PROGRESS.md`, `PERFORMANCE_REPORT.md`, etc.) make unverified claims | root `*.md` | Remove/replace with verified statements |
