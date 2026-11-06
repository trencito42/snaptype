# SnapType — Production-Ready Text Expansion Platform

SnapType is a high-performance, self-hosted text expansion platform inspired functionally by Text Blaze, engineered with original product identity, editorial minimalism (JoyPixels-inspired visual direction), and extreme performance for low-end hardware.

---

## ⚡ Core Highlights

- **Sub-Millisecond Keystroke Matching**: Pure in-memory reverse-trie lookup (average ~1.5 µs latency across 5,000 snippets).
- **Zero Keystroke Transmission**: Keystrokes never leave the browser. Zero network calls on typing.
- **Authoritative Database & Ephemeral Client Memory**: Authoritative snippet data resides in MySQL. Browsers keep in-memory matching structures in temporary tab/session memory without persisting sensitive customer responses to browser disk.
- **Low Hardware Footprint**: Idle content-script CPU usage is 0.0%. No continuous DOM polling or layout recalculation.
- **Manifest V3 Extensions**: Production builds for both Chromium (Chrome, Edge, Brave) and Mozilla Firefox.
- **Dynamic Syntax & Safe AST Parser**:
  - Date & time formatting with relative calculations (`+1d`, `-2w`, `+1m`, timezones).
  - Caret placement with `{{cursor}}`.
  - Fill-in interactive forms (`{{input:...}}`, `{{paragraph:...}}`, `{{dropdown:...}}`, `{{toggle:...}}`).
  - Safe arithmetic formulas (`{{formula: price * qty}}`) without `eval()` or `Function()`.
  - Conditionals (`{{#if isApproved}}...{{else}}...{{/if}}`) and repetitions (`{{#repeat 3}}...{{/repeat}}`).
  - Modular snippet composition (`{{snippet:shortcut}}`) with recursion safeguards.
- **Clean Passwordless Auth**: Unified email OTP authentication with cryptographically secure single-use codes, cooldown rate limiting, and session rotation.

---

## 📁 Repository Structure

```text
snaptype/
├── apps/
│   ├── api/            # Fastify backend, MySQL / Drizzle ORM, OTP auth, sync API
│   ├── web/            # React + Vite web dashboard & JoyPixels-inspired marketing site
│   └── extension/      # Manifest V3 extension (Chrome & Firefox vanilla TS)
│
├── packages/
│   ├── shared/         # Domain models, Zod validation schemas, DTOs
│   ├── snippet-engine/ # Reverse-trie index, date formatter, AST formula evaluator
│   └── browser-compat/ # Cross-browser polyfill & input/contenteditable DOM inserters
│
├── infrastructure/
│   ├── migrations/     # MySQL 8.0+ idempotent migration SQL
│   └── deployment/     # PM2 & Nginx reverse proxy configurations
│
├── tests/
│   ├── unit/           # Trie matching, formula evaluator, parser, dates, benchmarks
│   └── integration/    # Auth, sessions, snippet CRUD, revisions, workspace isolation
│
├── dist/
│   ├── chrome/         # Unpacked Chrome MV3 extension
│   ├── firefox/        # Unpacked Firefox MV3 extension
│   ├── chrome-extension.zip
│   └── firefox-extension.zip
│
├── DEPLOYMENT.md       # Linux VPS / CloudPanel production setup guide
├── TESTING.md          # Test suite documentation & benchmark reports
└── AGENT_PROGRESS.md   # Durable checkpoint and implementation milestones
```

---

## 🚀 Quickstart Guide

### 1. Prerequisites
- Node.js 22+ (tested on Node v24.19.0)
- npm 10+
- (Optional) MySQL 8.0+ (the system includes an automated in-memory adapter for immediate zero-config local testing!)

### 2. Install & Build

```bash
# Install dependencies across all workspaces
npm install

# Build shared packages
npm run build:packages

# Run full test suite (33 unit & integration tests)
npm test

# Build all applications and browser extensions
npm run build
npm run package:extensions
```

### 3. Start Development Services

```bash
# Terminal 1: Backend API (port 3000)
npm run dev -w apps/api

# Terminal 2: Web Dashboard & Marketing (port 5173)
npm run dev -w apps/web
```

Open `http://localhost:5173` in your browser.

---

## 🧩 Installing the Browser Extension

### Chrome / Chromium:
1. Open Chrome and navigate to `chrome://extensions/`.
2. Toggle on **Developer mode** in the top-right corner.
3. Click **Load unpacked** and select the `dist/chrome` folder in this repository.
4. Click the SnapType extension icon in the browser toolbar to sign in via email OTP.

### Firefox:
1. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on...**.
3. Select `dist/firefox/manifest.json`.
4. SnapType is active for your Firefox session.

---

## ⌨️ Built-in Starter Shortcuts

When a new account is registered, these default snippets are automatically ready:
- `cerbonus` — Formal Romanian bonus request response
- `msver` — Account verification confirmation notice
- `/salut` — Personalized customer greeting with dynamic name form
- `/closing` — Timestamped closing with dynamic date & time
- `retragere` — Withdrawal processing timeline notice

Press **Ctrl + Shift + Space** on any webpage to open the keyboard search assistant!
