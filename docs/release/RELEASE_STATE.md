# SnapType Release State (checkpoint)

**Verdict: NOT release-ready.** Only the CI/Docker upgrade-test defect (RB-001..003) has been addressed in this session; the rest of the release brief is outstanding. See ISSUES.md and TEST_MATRIX.md.

Base commit: `c9db21f`. Working branch: `main`.

## Done in this checkpoint
- Confirmed the previous CI "legacy upgrade" test was invalid (latest schema auto-initialised by the MySQL init mount; `\$` escapes broken in YAML).
- Removed init mount; added a real legacy fixture and a standalone verification script; CI generates ephemeral secrets.
- Local baseline: typecheck clean, 115/115 tests pass.

## Next steps for the next agent (in order)
1. Check GitHub Actions for the pushed commit; fix `scripts/ci/legacy-upgrade-test.sh` until the step is genuinely green (watch: legacy tables vs `0001`/`0002` `IF NOT EXISTS`; `docker compose run` exit-code logic).
2. RB-004: real-MySQL tests (CI `mysql` service) for fresh install, legacy upgrade, interrupted-DDL retry; make `ensureColumnExists`/token-hash upgrade tracked and idempotent.
3. RB-005: audit in this order: auth/OTP -> permissions matrix per endpoint -> snippet/folder lifecycle -> sync -> data tables -> import/export -> command grammar vs UI examples.
4. RB-007: extension verification in real Chrome and Firefox (Playwright with `--load-extension`; Firefox via `web-ext`).
5. RB-006: homepage review/rebuild, then RB-008 documentation cleanup, packaging, store metadata.

## Owner-only blockers (not actionable by an agent)
Production domain/URLs, SMTP credentials, Chrome Web Store / AMO accounts and submission, approved logo asset (none found yet - verify before use).
