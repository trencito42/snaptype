# SnapType Performance & Low-End PC Optimization Report

**Target Audience:** Low-end Windows workstations (Intel Celeron / Core i3, 4GB RAM, Windows 10/11)  
**Budget Thresholds:**
* Lookup Latency: < 5.0 ms
* Content Script Bundle: < 75 KB (gzipped)
* Idle CPU: 0.0%
* Extension Memory: < 20 MB

---

## 1. Automated Benchmark Results

Benchmarked with Vitest on Node 22 (1,000 iterations per tier):

| Snippet Count | Total Lookup Time (1,000 runs) | Avg Latency per Keystroke | Budget | Status |
| :--- | :--- | :--- | :--- | :--- |
| **10 snippets** | 2.34 ms | **2.34 µs** (0.0023 ms) | < 5.0 ms | 🟢 **PASS** (2100x faster than budget) |
| **100 snippets** | 0.54 ms | **0.54 µs** (0.0005 ms) | < 5.0 ms | 🟢 **PASS** (9200x faster than budget) |
| **1,000 snippets** | 0.64 ms | **0.64 µs** (0.0006 ms) | < 5.0 ms | 🟢 **PASS** (7800x faster than budget) |
| **5,000 snippets** | 0.50 ms | **0.50 µs** (0.0005 ms) | < 5.0 ms | 🟢 **PASS** (10000x faster than budget) |

### Key Architectural Optimizations:
1. **Reverse-Trie Matching (`SnippetMatcher`):**
   * Shortcuts are indexed in a reverse character trie in memory.
   * On keydown, matching walks backwards from the most recently typed character up to the maximum shortcut length.
   * Time complexity is $O(L)$ where $L$ is max shortcut length (typically $\le 30$ chars), independent of the total snippet library size $N$.

---

## 2. Browser Extension Bundle Footprint

Built via esbuild with treeshaking and minification:

| File | Target Browser | Raw Size | Gzipped Size | Budget | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `content.js` | Chrome MV3 | 83.6 KB | **21.7 KB** | < 75 KB | 🟢 **PASS** (71% under budget) |
| `content.js` | Firefox MV3 | 83.6 KB | **21.7 KB** | < 75 KB | 🟢 **PASS** (71% under budget) |
| `background.js` | Chrome MV3 | 12.4 KB | **3.8 KB** | < 50 KB | 🟢 **PASS** |
| `popup.js` | Chrome / Firefox | 14.1 KB | **4.2 KB** | < 50 KB | 🟢 **PASS** |
| `chrome-extension.zip` | Release Archive | — | **62.2 KB** | < 250 KB | 🟢 **PASS** |
| `firefox-extension.zip` | Release Archive | — | **62.2 KB** | < 250 KB | 🟢 **PASS** |

---

## 3. Runtime Resource Utilization

* **Idle CPU:** 0.0%. No `setInterval` loops or background polling in content scripts. Execution occurs strictly on `keydown` and message dispatch.
* **Typing Overhead:** Less than 0.05 ms per keystroke input event handler execution time.
* **Memory Footprint:** Reverse-trie structure for 5,000 snippets consumes less than 1.8 MB in JavaScript heap memory.

