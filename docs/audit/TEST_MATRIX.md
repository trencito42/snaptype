# SnapType Test Matrix & Verification Coverage

| Milestone | Test Suite | Scope | Target | Result |
|---|---|---|---|---|
| A | `tests/unit/popup-dom.test.ts` | Popup DOM elements & state transitions | ST-001 | PASS (3/3) |
| A | `tests/integration/table-security.test.ts` | Cross-workspace IDOR prevention on rows | ST-002 | PASS (3/3) |
| A | `tests/integration/concurrency.test.ts` | Atomic writes & concurrent CAS update conflict (409) | ST-003, ST-004 | PASS (2/2) |
| A | `tests/unit/docker-compose.test.ts` | Clean boot, YAML directives & secure env defaults | ST-005, Blocker 1 | PASS (1/1) |
| A | `tests/unit/command-grammar.test.ts` | Unrecognized command rejection / error reporting | ST-006 | PASS (6/6) |
| A | `tests/integration/invitations.test.ts` | Invite token hashing, expiry, scoped revocation | ST-007, Blocker 10 | PASS (5/5) |
| A | `tests/unit/migrate.test.ts` | Versioned schema upgrade on existing DB, portable SQL | ST-008, Blocker 3 | PASS (2/2) |
| B | `tests/unit/extension-content.test.ts` | Fail-safe insertion, data tables, site restrictions, selection | ST-011 - ST-020, Blocker 8, 9 | PASS (7/7) |
| B | `tests/unit/extension-build.test.ts` | Loopback permission stripping in production builds | Blocker 4 | PASS (3/3) |
| C | `tests/unit/dynamic-parser.test.ts` | Full grammar & resolver integration | ST-021 - ST-026 | PASS (9/9) |
| C | `tests/unit/formula-evaluator.test.ts` | Safe math expressions & formula parser | ST-025 | PASS (6/6) |
| C | `tests/unit/date-formatter.test.ts` | Dynamic date tags & timezone formatting | ST-023 | PASS (2/2) |
| D | `tests/integration/api.test.ts` | Atomic OTP, CORS, user auth, sessions | ST-027 - ST-030 | PASS (7/7) |
| D | `tests/integration/folder-security.test.ts` | Transitive folder cycles, orphan detach, parentId validation | ST-032, Requirement 19 | PASS (6/6) |
| D | `tests/integration/tables.test.ts` | Live data tables API, columns, rows & schema | ST-031 | PASS (5/5) |
| D | `tests/unit/csv-parser.test.ts` | CSV serialization, parsing, RFC 4180 quotes | ST-033 | PASS (5/5) |
| D | `tests/unit/db-connection.test.ts` | Production DB validation, no silent fallback | P0.2 | PASS (3/3) |
| E | `tests/unit/matcher.test.ts` | Sub-millisecond reverse-trie matching | Core | PASS (7/7) |
| E | `tests/unit/browser-compat.test.ts` | Browser API abstraction & storage layer | Core | PASS (1/1) |
| F | `tests/unit/performance.test.ts` | Benchmarks on 10 to 5,000 snippets (<5µs lookup) | Low-End PC | PASS (4/4) |
| F | CI & TypeScript Typecheck | Multi-project strict typechecking (6 workspaces) | ST-041 - ST-046 | PASS |

**Total:** 20 Test Files, 87 Tests Passing (100% Pass Rate).
