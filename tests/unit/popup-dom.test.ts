import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('ST-001: Extension Popup DOM Elements & Bindings', () => {
  const htmlPath = path.resolve('apps/extension/src/popup/popup.html');
  const tsPath = path.resolve('apps/extension/src/popup/popup.ts');

  it('contains popup.html and popup.ts files', () => {
    expect(fs.existsSync(htmlPath)).toBe(true);
    expect(fs.existsSync(tsPath)).toBe(true);
  });

  it('guarantees every document.getElementById queried in popup.ts exists in popup.html', () => {
    const htmlContent = fs.readFileSync(htmlPath, 'utf-8');
    const tsContent = fs.readFileSync(tsPath, 'utf-8');

    // Regex to find all document.getElementById('...') occurrences
    const idRegex = /document\.getElementById\(['"]([^'"]+)['"]\)/g;
    const queriedIds: string[] = [];
    let match;
    while ((match = idRegex.exec(tsContent)) !== null) {
      queriedIds.push(match[1]);
    }

    expect(queriedIds.length).toBeGreaterThan(0);
    expect(queriedIds).toContain('auth-view');
    expect(queriedIds).toContain('main-view');

    // For every queried ID, verify it exists in popup.html as id="..."
    for (const id of queriedIds) {
      const existsInHtml = htmlContent.includes(`id="${id}"`);
      expect(existsInHtml, `Expected element id="${id}" to exist in popup.html`).toBe(true);
    }
  });

  it('verifies authView is properly declared and bound in popup.ts', () => {
    const tsContent = fs.readFileSync(tsPath, 'utf-8');
    expect(tsContent).toMatch(/const\s+authView\s*=\s*document\.getElementById\(['"]auth-view['"]\)/);
  });
});

