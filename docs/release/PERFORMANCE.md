# Performance notes (measured vs. not measured)

Environment: Windows 11, Chrome 157.0.8103.38 headless, Node 24, throw-away in-memory API on localhost, `scripts/e2e/chrome-extension-perf.mjs`. Library entries are ~290 bytes of text each. Numbers are from several runs on one machine; treat them as order-of-magnitude, not a benchmark.

## Bundle sizes (production esbuild output)

| Item | Size |
|------|------|
| `content.js` (injected on every page) | ~100 KB minified, ~27 KB gzip |
| `background.js` | ~72 KB minified |
| `popup.js` | ~81 KB minified |
| Homepage JS | ~420 KB / ~122 KB gzip (includes FontAwesome subset and the real snippet engine for the demo) |

## Library size in real Chrome

| Snippets | Full sync payload | Service-worker JS heap | Page JS heap (content script + page) |
|---------:|------------------:|-----------------------:|-------------------------------------:|
| 100 | ~60 KB | ~0.9 MB | ~1.2 MB |
| 1,000 | ~600 KB | ~2.9 MB | ~6-7 MB |
| 5,000 | ~3 MB | ~10-12 MB | ~7-29 MB (varied between runs) |

- The sync endpoint is incremental after the first sync (`lastRevision`), so these payloads are first-sync / workspace-switch costs. Data Tables are only re-sent when the workspace revision advanced.

## Responsiveness

- With the library loaded, key press to expanded text was **2-6 ms median** in the runs where expansion was verified. This includes Chrome DevTools Protocol round trips, so it is an upper bound for the extension's own work.
- **Caveat:** the perf harness did not verify expansion in every stage of every run (it reported timeouts in some stages at 1,000 and 5,000 snippets). The content script was confirmed to hold the full library in those runs (instrumented logs showed 1,000 / 5,000 snippets loaded), and the functional E2E (41 checks) passes, so this looks like a harness typing/focus problem rather than an extension limit, but it is **not proven**. Do not quote latency at scale as a guarantee.

## Idle behaviour

- No `setInterval` and no `MutationObserver` in `apps/extension/src`; periodic sync uses `chrome.alarms`.
- Over 10 s of idle, the page's task time was ~4-23 ms. Chrome terminates the idle MV3 service worker, so it consumes nothing while idle (it could therefore not be sampled).

## NOT measured (no claim is made)

- Extension memory as reported by the browser task manager, many-tab effects, extension startup time, battery/CPU on low-end hardware, Firefox performance.
- Lighthouse of the redesigned homepage after the Clarity City/Inter font change (the earlier measurement was before the redesign).

Earlier statements such as "0.0% idle CPU", "< 20 MB" and "sub-millisecond" were derived from a Node microbenchmark and have been removed from all user-facing text.
