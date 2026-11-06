# SnapType Security Forensic Review & Audit Report

**Date:** November 2026  
**Auditor:** Principal Security & Systems Architect  
**Platform:** SnapType Monorepo (`apps/api`, `apps/web`, `apps/extension`, `packages/*`)

---

## 1. Executive Summary

A forensic security audit was conducted on the SnapType codebase to identify and remediate vulnerabilities, access control bypasses, injection vectors, and data synchronization risks. All identified P0 and P1 security defects have been remediated, verified with automated tests, and confirmed in production builds.

---

## 2. Forensic Vulnerability Analysis & Remediation

### 2.1 Authentication & Secret Management (P0.5, P0.6)
* **Vulnerability:** Email OTP codes were previously logged to stdout in production, exposing authentication credentials to log aggregators. Additionally, short or default JWT secrets were permitted.
* **Remediation:**
  * Updated `apps/api/src/services/email.service.ts` to strictly prohibit OTP logging whenever `NODE_ENV === 'production'`.
  * Updated `apps/api/src/services/auth.service.ts` to enforce a minimum 32-character high-entropy secret in production environments.
  * Added rate-limiting (cooldown window) and single-use OTP invalidation to prevent replay or brute-force attacks.
  * Explicit SMTP transport errors return HTTP 503 instead of returning a false-positive success response.

### 2.2 Relational Persistence Fail-Safe (P0.2)
* **Vulnerability:** If MySQL connection failed, the backend silently fell back to `InMemoryRepository`, resulting in ephemeral data loss across server restarts.
* **Remediation:**
  * Updated `apps/api/src/db/connection.ts` so that in production (`NODE_ENV === 'production'`), any missing `DATABASE_URL` or failed MySQL connection immediately throws a fatal exception, preventing un-persisted operation.

### 2.3 Browser Extension Cross-Site Scripting (XSS) (P0.7)
* **Vulnerability:** Popup and content scripts previously injected dynamic snippet contents via `element.innerHTML`, which could allow arbitrary script execution if a malicious snippet payload contained HTML/script tags.
* **Remediation:**
  * Refactored `apps/extension/src/popup/popup.ts` and `apps/extension/src/content/content.ts` to build DOM nodes safely using `document.createElement()` and `textContent`.
  * Removed all `.innerHTML` assignments from the extension code path.

### 2.4 Origin Isolation & Configurable Endpoints (P0.1)
* **Vulnerability:** Extension background and popup scripts contained hardcoded `localhost:3000` URLs, preventing installation on external client machines and allowing unauthorized origin assumptions.
* **Remediation:**
  * Parameterized `apps/extension/build.js` using esbuild `define` flags (`__SNAPTYPE_API_URL__`, `__SNAPTYPE_APP_URL__`).
  * Manifest permissions and host permissions are dynamically generated based on target environment configuration.

### 2.5 Access Control & Multi-Tenant Isolation (P0.8)
* **Vulnerability:** Snippet duplication, usage recording, and folder hierarchies lacked strict authorization and workspace boundary checks.
* **Remediation:**
  * Implemented `findWorkspaceMembers(workspaceId)` to enforce team boundaries.
  * Enforced role-based access control (RBAC): snippet duplication requires `editor` or higher; member management requires `owner` or `admin`.
  * Added parent-folder cycle prevention and workspace cross-contamination checks in `apps/api/src/routes/folder.routes.ts`.

### 2.6 Data Integrity & Sync Tombstones (P0.3, P0.9)
* **Vulnerability:** Deleting snippets or folders did not register deletion events in incremental sync, causing ghost snippets to revive or desync across devices.
* **Remediation:**
  * Added `sync_tombstones` table and monotonic `revision` counters on snippets and folders.
  * Repository operations run transactionally; deletions write tombstone records so incremental sync transmits `deletedSnippetIds` and `deletedFolderIds`.

### 2.7 Sandboxed Math & Formula Evaluation
* **Implementation:** `SafeFormulaEvaluator` uses a recursive-descent mathematical parser supporting arithmetic and safe math functions (`round`, `abs`, `floor`, `ceil`) without using `eval()`, `Function()`, or unsafe code evaluation.

---

## 3. Verification Test Evidence

All security fixes are validated by automated test suites:
* `tests/unit/db-connection.test.ts`: Verifies production database fail-safe abort.
* `tests/integration/api.test.ts`: Verifies OTP HMAC validation, rate-limit cooldown, and revision bumping.
* `tests/integration/tables.test.ts`: Verifies workspace boundary checks and data table lookups.
* `tests/unit/csv-parser.test.ts`: Verifies RFC-4180 parsing with multiline and quote escaping.

