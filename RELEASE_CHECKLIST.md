# SnapType Production Release Verification Checklist

**Release Version:** v1.0.0-production  
**Status:** Ready for Release

---

## 1. Quality & Regression Verification

- [x] **Monorepo Packages Built:**
  - `@snaptype/shared` compiled with RFC-4180 CSV parser and Data Table models.
  - `@snaptype/snippet-engine` compiled with dynamic forms, date math, reverse-trie matcher, and table lookups.
  - `@snaptype/browser-compat` compiled with cross-browser messaging abstractions.
- [x] **Automated Tests:**
  - 49 passing tests across unit, integration, and performance benchmark suites.
  - Reverse-trie matching latency verified at 0.50 µs for 5,000 snippets.
- [x] **Database & Migrations:**
  - Schema includes `sync_tombstones`, `data_tables`, `data_rows`, and monotonic `revision` counters.
  - MySQL repository supports transactional writes and tombstones.
  - Production database initialization fails fast if MySQL is unreachable.
- [x] **Web Application Build:**
  - Built with Vite + React. Output in `apps/web/dist/`.
  - Command Browser Modal (9 categories), Data Tables Modal, Workspace Members Modal, and RFC-4180 CSV Import/Export verified.
- [x] **Browser Extensions Build:**
  - Chrome MV3: built in `dist/chrome/` and packaged as `dist/chrome-extension.zip`.
  - Firefox MV3: built in `dist/firefox/` and packaged as `dist/firefox-extension.zip`.
  - High-resolution icons generated (16x16, 48x48, 128x128).
  - Content script bundle size: 21.7 KB gzipped (< 75 KB budget).
  - Configurable API & App origin flags supported.

---

## 2. Release Artifacts

| Artifact | Location | Size | Description |
| :--- | :--- | :--- | :--- |
| **Chrome Extension Archive** | `dist/chrome-extension.zip` | ~62 KB | Installable unpacked or packaged Chrome MV3 extension |
| **Firefox Extension Archive** | `dist/firefox-extension.zip` | ~62 KB | Installable add-on package for Mozilla Firefox |
| **Web Dashboard Bundle** | `apps/web/dist/` | ~320 KB | Static dashboard assets ready for Nginx/S3/Cloudflare Pages |
| **Database Schema** | `infrastructure/migrations/0001_initial_schema.sql` | 5.8 KB | Complete DDL for MySQL 8+ |
| **CI Automation** | `.github/workflows/ci.yml` | 1.1 KB | GitHub Actions automated test and artifact build workflow |

---

## 3. Production Deployment Guide

### A. Environment Configuration (`apps/api/.env`)
```bash
PORT=3000
HOST=0.0.0.0
NODE_ENV=production
DATABASE_URL=mysql://snaptype_user:secure_password@mysql-host:3306/snaptype
JWT_SECRET=production_super_secure_random_key_with_at_least_32_characters
APP_URL=https://app.snaptype.com
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=your_sendgrid_api_key
SMTP_FROM="SnapType <auth@snaptype.com>"
```

### B. Database Initialization
```bash
mysql -u snaptype_user -p snaptype < infrastructure/migrations/0001_initial_schema.sql
```

### C. Backend API Service
```bash
npm run build -w apps/api
node apps/api/dist/server.js
```

### D. Web Dashboard Hosting
Deploy the contents of `apps/web/dist/` to any static web server or CDN (Cloudflare Pages, Nginx, Vercel).

### E. Browser Extension Packaging for Custom Domains
```bash
npm run build:extension -- --api-url=https://api.snaptype.com/api/v1 --app-url=https://app.snaptype.com
npm run package:extensions
```
The output zip files in `dist/` will be pre-configured with the production API and Web domains.

