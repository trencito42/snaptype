# SnapType — Complete Issue Registry (ST-001 to ST-046)

| ID | Title | Severity | Area | Status | File(s) |
|---|---|---|---|---|---|
| **ST-001** | Extension popup fails on missing DOM reference `authView` | P0 | Extension | OPEN | `apps/extension/src/popup/popup.ts` |
| **ST-002** | Cross-workspace IDOR on Data Table rows update/delete | P0 | Security / API | OPEN | `apps/api/src/routes/table.routes.ts`, `mysql-repository.ts` |
| **ST-003** | MySQL operations & sync revisions not atomic/transactional | P0 | Database / Sync | OPEN | `apps/api/src/db/mysql-repository.ts` |
| **ST-004** | Concurrency race condition on snippet update (lost updates) | P0 | Concurrency / API | OPEN | `apps/api/src/services/snippet.service.ts`, `mysql-repository.ts` |
| **ST-005** | Docker defaults expose static secrets and public MySQL 3306 | P0 | Infra / Security | OPEN | `docker-compose.yml` |
| **ST-006** | Dynamic parser silently drops unresolved/malformed tags | P0 | Snippet Engine | OPEN | `packages/snippet-engine/src/dynamic-parser.ts` |
| **ST-007** | Workspace invite creates unverified phantom users without consent | P0 | Auth / Multi-tenant | OPEN | `apps/api/src/routes/workspace.routes.ts`, `auth.service.ts` |
| **ST-008** | Missing incremental schema migrations (ALTER TABLE vs CREATE IF NOT EXISTS) | P0 | Database | OPEN | `infrastructure/migrations/` |
| **ST-009** | Extension lacks automatic periodic/reactive sync mechanism | P1 | Extension Sync | OPEN | `apps/extension/src/background/background.ts` |
| **ST-010** | Snippet usage recording action is unhandled in background worker | P1 | Extension | OPEN | `apps/extension/src/background/background.ts` |
| **ST-011** | Assistant shortcut is hardcoded in key listener, ignores preference | P1 | Extension | OPEN | `apps/extension/src/content/content.ts` |
| **ST-012** | Per-snippet `siteRestrictions` not evaluated before matching/insertion | P1 | Extension Engine | OPEN | `apps/extension/src/content/content.ts` |
| **ST-013** | Domain exclusions are not reactive to settings updates | P1 | Extension | OPEN | `apps/extension/src/content/content.ts` |
| **ST-014** | Selection Range/caret lost in contenteditable/input on assistant open | P1 | Extension Inserter | OPEN | `apps/extension/src/content/content.ts`, `text-inserter.ts` |
| **ST-015** | Dynamic form modal incomplete (toggle as text input, missing validation) | P1 | Extension Forms | OPEN | `apps/extension/src/content/content.ts` |
| **ST-016** | Synthetic input events risk recursive self-triggering | P1 | Extension Inserter | OPEN | `apps/extension/src/content/content.ts`, `text-inserter.ts` |
| **ST-017** | Popup copy/insert coupling and unhandled clipboard permissions | P1 | Extension Popup | OPEN | `apps/extension/src/popup/popup.ts` |
| **ST-018** | Service worker suspension & network offline handling | P1 | Extension | OPEN | `apps/extension/src/background/background.ts` |
| **ST-019** | Firefox vs Chrome runtime API mismatches | P1 | Browser Compat | OPEN | `packages/browser-compat/src/` |
| **ST-020** | Multi-tab RAM footprint and unvirtualized assistant DOM | P1 | Performance | OPEN | `apps/extension/src/content/content.ts` |
| **ST-021** | Command syntax mismatch: `{{form:name}}` vs parser `input:name` | P1 | Snippet Engine | OPEN | `dynamic-parser.ts`, `CommandBrowserModal.tsx` |
| **ST-022** | `{{selectedText}}` unsupported in parser and missing in content context | P1 | Snippet Engine | OPEN | `dynamic-parser.ts`, `content.ts` |
| **ST-023** | `{{datetime}}` generates default date instead of ISO timestamp | P1 | Snippet Engine | OPEN | `dynamic-parser.ts` |
| **ST-024** | `{{table:...}}` resolver disconnected from extension runtime | P1 | Snippet Engine | OPEN | `dynamic-parser.ts`, `content.ts` |
| **ST-025** | `{{include:...}}` resolver disconnected from extension runtime | P1 | Snippet Engine | OPEN | `dynamic-parser.ts`, `content.ts` |
| **ST-026** | Rich-text promise vs markdown-only implementation | P1 | Web / Inserter | OPEN | `apps/web/src/pages/Dashboard.tsx`, `text-inserter.ts` |
| **ST-027** | Overly permissive CORS with credentials enabled | P1 | API Security | OPEN | `apps/api/src/server.ts` |
| **ST-028** | ESM import ordering causes `dotenv.config()` to run after SMTP init | P1 | API Config | OPEN | `apps/api/src/server.ts`, `email.service.ts` |
| **ST-029** | OTP verification not atomic (race condition on concurrent verification) | P1 | Auth Security | OPEN | `apps/api/src/services/auth.service.ts`, `repository.ts` |
| **ST-030** | Long-lived bearer token in localStorage without refresh rotation | P1 | Auth Security | OPEN | `apps/api/src/services/auth.service.ts`, `api.ts` |
| **ST-031** | Table row data validation against column schema missing | P1 | API Validation | OPEN | `apps/api/src/routes/table.routes.ts` |
| **ST-032** | Folder hierarchy cycle detection & transitive reparenting missing | P1 | API / DB | OPEN | `apps/api/src/routes/folder.routes.ts` |
| **ST-033** | Import/Export metadata loss (folder hierarchy, tags, favorites) | P1 | Data Transfer | OPEN | `apps/api/src/services/snippet.service.ts`, `transfer.routes.ts` |
| **ST-034** | Import modal success callback is no-op in `App.tsx` | P1 | Web UX | OPEN | `apps/web/src/App.tsx` |
| **ST-035** | Editor lacks debounced autosave (risk of lost edits) | P1 | Web UX | OPEN | `apps/web/src/pages/Dashboard.tsx` |
| **ST-036** | Snippet revision history lacks restore capability | P1 | Web UX / API | OPEN | `apps/web/src/pages/Dashboard.tsx`, `snippet.routes.ts` |
| **ST-037** | Workspace switcher and management incomplete in Dashboard | P1 | Web UX | OPEN | `apps/web/src/pages/Dashboard.tsx` |
| **ST-038** | Dashboard fixed multi-pane layout overflows on mobile/tablets | P1 | Web Responsive | OPEN | `apps/web/src/pages/Dashboard.tsx` |
| **ST-039** | Full table scans in search and N+1 query in `findTables` | P1 | Performance | OPEN | `apps/api/src/db/mysql-repository.ts` |
| **ST-040** | Missing legal pages (Terms of Service, honest privacy statements) | P1 | Web Legal | OPEN | `apps/web/src/pages/` |
| **ST-041** | CI does not compile API (`build:api`), run typechecks, or lint | P1 | CI / Quality | OPEN | `.github/workflows/ci.yml` |
| **ST-042** | Docker Compose untested in CI, missing prod verification | P1 | CI / Infra | OPEN | `.github/workflows/ci.yml` |
| **ST-043** | Extension build in CI uses hardcoded localhost URLs | P1 | CI / Release | OPEN | `.github/workflows/ci.yml` |
| **ST-044** | Overbroad manifest host permissions in release extensions | P1 | Extension Security | OPEN | `apps/extension/build.js` |
| **ST-045** | Database migration runner lacks version tracking and rollback | P1 | Database Infra | OPEN | `infrastructure/migrations/` |
| **ST-046** | Documentation contradictions on test claims & benchmarks | P1 | Documentation | OPEN | `TESTING.md`, `PERFORMANCE_REPORT.md` |

