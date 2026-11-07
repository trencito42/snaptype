# SnapType Test Matrix & Verification Coverage

| Milestone | Test Suite | Scope | Target | Result |
|---|---|---|---|---|
| A | `tests/unit/popup.test.ts` | Popup DOM elements & state transitions | ST-001 | PENDING |
| A | `tests/integration/table-security.test.ts` | Cross-workspace IDOR prevention on rows | ST-002 | PENDING |
| A | `tests/integration/mysql-transactions.test.ts` | Atomic writes & concurrent CAS update conflict (409) | ST-003, ST-004 | PENDING |
| A | `docker-compose.test.sh` | Clean boot & secure env defaults | ST-005 | PENDING |
| A | `tests/unit/command-grammar.test.ts` | Unrecognized command rejection / error reporting | ST-006 | PENDING |
| A | `tests/integration/invitations.test.ts` | Invite token lifecycle, expiry, consent | ST-007 | PENDING |
| A | `tests/integration/migration-upgrade.test.ts` | Versioned schema upgrade on existing DB | ST-008 | PENDING |
| B | `tests/unit/sync-engine.test.ts` | Bounded sync, tombstone handling, service worker | ST-009, ST-010 | PENDING |
| B | `tests/unit/extension-insertion.test.ts` | Target & caret preservation, synthetic event loop guard | ST-011 - ST-020 | PENDING |
| C | `tests/unit/command-runtime.test.ts` | Full grammar & resolver integration | ST-021 - ST-026 | PENDING |
| D | `tests/integration/security-auth.test.ts` | Atomic OTP, CORS, folder cycles, import/export fidelity | ST-027 - ST-033 | PENDING |
| E | `tests/unit/web-dashboard.test.ts` | Autosave, revision restore, workspace switcher | ST-034 - ST-040 | PENDING |
| F | GitHub Actions Run | CI build:api, typechecks, Vitest, docker build | ST-041 - ST-046 | PENDING |
