# SnapType Test Matrix

Environment of record for local runs: Windows 11, Node 22, vitest. No Docker, no MySQL, no installed Chrome/Firefox automation available in the authoring session. Anything needing them is NOT TESTED locally and relies on GitHub Actions.

| Area | Result | Evidence / reason |
|------|--------|-------------------|
| `npm run typecheck` (6 projects) | PASS | local run at base commit + this change |
| `vitest run` (23 files, 115 tests: unit, in-memory API integration) | PASS | local run |
| MySQL migration tests (`tests/unit/migrate.test.ts`) | PASS but weak | uses a MOCK connection; does not count as real migration verification |
| Fresh Docker install + `/health` | NOT TESTED locally | no Docker; CI step defined |
| Legacy persistent-volume upgrade | NOT TESTED yet | CI step `scripts/ci/legacy-upgrade-test.sh`; see RB-001 |
| Real-MySQL repository parity with in-memory repo | NOT TESTED | no MySQL-backed integration run |
| OTP / sessions / permissions matrix / sync / data tables / import-export | NOT AUDITED | RB-005 |
| Chrome MV3 real execution | NOT TESTED | RB-007 |
| Firefox MV3 real execution | NOT TESTED | RB-007 |
| Editable-field compatibility | NOT TESTED | RB-007 |
| Homepage responsive widths / Lighthouse | NOT TESTED | RB-006 |
