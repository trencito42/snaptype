# SnapType on Blipmade (Pterodactyl / Wings)

Deploy SnapType as **three Blipmade instances** (Web, API, Database). Reuse Blipmade **Git Deploy** (`api/src/services/git-deploy.ts`); do not run the Docker Compose stack on production Wings nodes.

Repository: `https://github.com/trencito42/snaptype`  
Verified release baseline: `a131f7c` (extend with Blipmade integration commits on `main`).

| Area | Status |
|------|--------|
| SnapType Wings port + Git Deploy commands | **IMPLEMENTED** (this repo) |
| Cross-origin API URL (`VITE_API_BASE`) | **IMPLEMENTED** |
| MySQL 8 egg in `blipmade-hosting` | **IMPLEMENTED** (separate repo; owner must sync eggs + catalog) |
| CI (typecheck, tests, MySQL, E2E) | **VERIFIED IN CI** after push |
| Live Blipmade deploy | **BLOCKED BY OWNER ACTION** |
| Extension store submission | **BLOCKED BY OWNER ACTION** |

---

## 1. Blipmade architecture (relevant parts)

| Component | Behavior |
|-----------|----------|
| **Node.js egg** | Generic `MAIN_FILE` startup; with Git Deploy, startup becomes `bash /home/container/.blipmade/run.sh` and **`START_CMD` runs the app** from `/.blipmade/current`. |
| **Git Deploy** | Clones `https://github.com/…`, runs `BUILD_CMD` (max 900s), keeps 3 releases, `START_CMD` exec, rollback via panel. `app.env` is sourced before build and start. **`SERVER_PORT` is reserved** (set by Wings, not in customer env). |
| **Gateway** | Customer HTTP hostnames → Caddy reverse proxy → **node internal IP + allocation port** (`api/src/services/gateway.ts`, `domain-routing.ts`). Apex + subdomain are separate routes (separate instances). |
| **DNS** | Ownership: TXT `_blipmade-verify.<hostname>`. Routing: **A record** to gateway IP (`dnsRecordsFor`). Cloudflare proxy compatible once TXT is verified. |
| **MariaDB product** | Existing `mariadb` egg/product — **not** SnapType’s tested engine (CI uses **MySQL 8.0**). |
| **MySQL 8 product** | New `mysql8` egg in `blipmade-hosting` (see § Database). |

**Database exposure:** MariaDB/MySQL eggs use `bind-address=0.0.0.0`. A Wings allocation publishes a port on the node network; **it is not private by default**. Restrict with host firewall / private networking between API and DB allocations — **owner must validate** on the live node (`10.77.0.x`-style addresses in code are fallbacks, not your values).

---

## 2. Target instances

### Instance A — SnapType Web

| Setting | Value |
|---------|--------|
| Egg | Node.js **22** (`ghcr.io/ptero-eggs/yolks:nodejs_22`) |
| Domain | `snaptype.org` (HTTP purpose, verified) |
| Listen | `0.0.0.0` + **`SERVER_PORT`** |

**Git Deploy**

| Field | Command |
|-------|---------|
| Repository | `https://github.com/trencito42/snaptype` |
| Branch | `main` |
| Build | `npm ci && npm run build:packages && npm run build:web` |
| Start | `node apps/web/serve.mjs` |

**Build-time env** (in Deploy → environment, applied before build):

```env
VITE_SNAPTYPE_DEPLOY_TARGET=blipmade
VITE_API_BASE=https://api.snaptype.org/api/v1
```

Serves `apps/web/dist` with SPA fallback, static asset caching, security headers, `/health` and `/healthz`.

### Instance B — SnapType API

| Setting | Value |
|---------|--------|
| Egg | Node.js **22** |
| Domain | `api.snaptype.org` |
| Listen | `HOST=0.0.0.0`, port from **`SERVER_PORT`** (via `resolveListenPort`) |

**Git Deploy**

| Field | Command |
|-------|---------|
| Build | `npm ci && npm run build:packages && npm run build:api` |
| Start | `node apps/api/dist/server.js` |

Migrations run on startup (`initDatabase` → `runMigrations`) before routes attach. Production **aborts** if MySQL is missing or unreachable (no in-memory fallback).

### Instance C — SnapType Database

| Setting | Value |
|---------|--------|
| Product | **MySQL 8** (`mysql8` in `blipmade-hosting`) — not MariaDB for SnapType production |
| Persistence | `/home/container/data` (egg datadir) |
| Port | Allocation → `SERVER_PORT` inside container |

Create database + user (example — run from owner-controlled console once server is up):

```sql
CREATE DATABASE snaptype_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'snaptype_user'@'%' IDENTIFIED BY '<STRONG_PASSWORD>';
GRANT ALL PRIVILEGES ON snaptype_db.* TO 'snaptype_user'@'%';
FLUSH PRIVILEGES;
```

**API `DATABASE_URL`:** use the **internal** node IP and **database allocation port** from the panel (not a public DNS name). Template:

```env
DATABASE_URL=mysql://snaptype_user:<PASSWORD>@<NODE_INTERNAL_IP>:<DB_ALLOC_PORT>/snaptype_db
```

---

## 3. Frontend ↔ API routing

Chosen model: **separate hostnames** (simplest with Blipmade gateway — one route per instance).

| URL | Serves |
|-----|--------|
| `https://snaptype.org` | Vite/React SPA |
| `https://api.snaptype.org/api/v1/...` | Fastify API |

The dashboard uses absolute API origin baked at build via `VITE_API_BASE`. Extensions use `SNAPTYPE_API_URL=https://api.snaptype.org/api/v1` at package time.

CORS: set API `ALLOWED_ORIGINS=https://snaptype.org,https://api.snaptype.org` and `APP_URL=https://snaptype.org`. Extension origins (`chrome-extension://`, `moz-extension://`) remain allowed by the API.

---

## 4. DNS and domains (owner)

For each hostname (`snaptype.org`, `api.snaptype.org`):

1. Add domain in Blipmade instance → receive **TXT** token `_blipmade-verify.<hostname>`.
2. Publish TXT at registrar / Cloudflare.
3. Publish **A** record for hostname → **`<GATEWAY_PUBLIC_IP>`** (from Blipmade UI — do not invent).
4. Verify in panel; wait for Caddy route reconciliation (worker ~1 min).

TLS: issued by gateway/Caddy after verification — **do not assume** Blipmade’s own origin cert covers `snaptype.org`.

Placeholder checklist:

| Host | Type | Name | Value |
|------|------|------|--------|
| Web | TXT | `_blipmade-verify.snaptype.org` | `<TOKEN_FROM_PANEL>` |
| Web | A | `snaptype.org` | `<GATEWAY_IP>` |
| API | TXT | `_blipmade-verify.api.snaptype.org` | `<TOKEN_FROM_PANEL>` |
| API | A | `api.snaptype.org` | `<GATEWAY_IP>` |

---

## 5. Environment variables

See [`blipmade.env.example`](./blipmade.env.example). Enter secrets only in Blipmade Deploy UI (file mode `0600` on container).

### API (required production)

| Variable | Notes |
|----------|--------|
| `NODE_ENV` | `production` |
| `HOST` | `0.0.0.0` |
| `DATABASE_URL` | MySQL 8, reachable from API instance |
| `DB_DRIVER` | `mysql` |
| `JWT_SECRET` | ≥32 chars (Compose requires; wire when used) |
| `OTP_HMAC_SECRET` | ≥32 chars, required in production |
| `APP_URL` | `https://snaptype.org` (invitation links) |
| `ALLOWED_ORIGINS` | Comma-separated browser origins |
| `TRUST_PROXY` | `true` when behind Caddy only — API uses Fastify `trustProxy: true` |
| `SMTP_*` | Owner’s existing provider; contact **support@snaptype.org** is public; SMTP_FROM is separate |

`PORT` in `app.env` is optional; Wings **`SERVER_PORT` wins**.

### Web (build)

| Variable | Notes |
|----------|--------|
| `VITE_SNAPTYPE_DEPLOY_TARGET` | `blipmade` |
| `VITE_API_BASE` | `https://api.snaptype.org/api/v1` |

---

## 6. Resource recommendations (starting point)

| Instance | RAM | CPU | Disk |
|----------|-----|-----|------|
| Web | 512–1024 MB | 1 | 5 GB |
| API | 1024–2048 MB | 1–2 | 10 GB |
| MySQL 8 | 2048+ MB | 1–2 | 20+ GB |

Adjust per workspace size and traffic.

---

## 7. Deploy, rollback, backups

| Operation | Mechanism |
|-----------|-----------|
| Deploy | Git Deploy **Build** or GitHub webhook |
| Rollback | Panel → previous release (`rollback` in `run.sh`) — **application only** |
| Failed build | Release dir removed; previous `current` kept |
| Migrations | Forward-only on API start — **rollback code does not downgrade schema** |
| DB backup | Owner: `mysqldump` from DB container or node tool; store off-instance |
| Restore | Restore dump → match API migration version or deploy matching git tag |

Schema strategy: keep migrations idempotent; before rollback, ensure new migrations are backward compatible or restore DB from backup taken pre-deploy.

---

## 8. Extensions (production build)

On a machine with the release API live and auth tested:

```bash
export SNAPTYPE_APP_URL=https://snaptype.org
export SNAPTYPE_API_URL=https://api.snaptype.org/api/v1
npm run build:extension:prod
npm run package:extensions:prod
```

Do **not** submit to stores without owner authorization. Firefox listing identity: `extension@snaptype.app`.

---

## 9. Owner actions before go-live

- [ ] Provision three instances (Web, API, MySQL 8) on Node.js 22 / mysql8 eggs  
- [ ] Sync `mysql8` egg + catalog from `blipmade-hosting` if not already on panel  
- [ ] Configure Git Deploy build/start commands (§2)  
- [ ] Set all secrets in Deploy env  
- [ ] Create DB + user; set `DATABASE_URL` on API  
- [ ] Verify DNS TXT + A records; confirm HTTPS on both hostnames  
- [ ] Confirm DB port **not** reachable from public internet (firewall)  
- [ ] Configure SMTP sending identity  
- [ ] Run smoke: `/health`, login OTP, dashboard sync, extension against production API  
- [ ] Authorize Firefox/Chrome store upload  

---

## 10. Tests (local / CI)

| Test | Command |
|------|---------|
| Full suite | `npm test` |
| Typecheck | `npm run typecheck` |
| Blipmade contract | `tests/unit/blipmade-deploy.test.ts`, `listen-port.test.ts` |
| Wings-style API port | `SERVER_PORT=39001` + start API (manual on owner node) |
| Git Deploy layout | Build/start from repo root as in §2 |

---

## Implementation checklist (maintainers)

- [x] API listens on `SERVER_PORT`
- [x] Web static server + SPA + health
- [x] `VITE_API_BASE` for cross-origin API
- [x] `docs/deployment/BLIPMADE.md` + env example
- [x] Production site metadata (`snaptype.org`, sitemap, support email)
- [x] MySQL 8 egg draft in `blipmade-hosting`
- [ ] Live validation on Blipmade (**owner**)
