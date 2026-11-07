# Performance notes (measured vs. not measured)

Measured on 2026-11-07, Windows 11, Node 22, esbuild minified production bundle.

| Item | Result | How measured |
|------|--------|--------------|
| `content.js` size | 93.5 KB minified, 24.8 KB gzip | `npm run build:extension` output |
| `background.js` | ~71 KB minified | file size in `dist/chrome` |
| `popup.js` | ~80 KB minified | file size in `dist/chrome` |
| Timers / observers in extension source | No `setInterval`, no `MutationObserver` in `apps/extension/src` (only a `chrome.alarms` periodic sync) | `grep` of the source |
| Matcher cost | Microbenchmark in `tests/unit/performance.test.ts` (reverse trie, Node, no DOM) | vitest; **not** a browser CPU measurement |
| Homepage JS | 342 KB / 95 KB gzip (single bundle) | `vite build` |

## NOT measured (no claim is made)

- Idle CPU and memory of the extension in Chrome or Firefox.
- Keystroke latency inside real pages, effect of many open tabs, extension startup time.
- Memory with 100 / 1,000 / 5,000 snippets in a browser.
- Lighthouse scores.

The previous report's "0.0% idle CPU", "< 20 MB" and "sub-millisecond" statements were derived from the Node microbenchmark and have been removed from all user-facing text.

## Sync payload behaviour

`GET /api/v1/sync` returns only snippets changed since the client's revision. Data Tables (with all rows) are included on a full sync, on request (`includeTables=true`) or when the workspace revision advanced. A client revision ahead of the server's is treated as a rollback and answered with a full replace (`fullSync: true`).
