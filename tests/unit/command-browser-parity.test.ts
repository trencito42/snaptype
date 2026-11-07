import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { renderSnippet, validateSnippetTemplate, extractFormFields } from '../../packages/snippet-engine/src/index.js';

// The Command Browser is user-facing documentation. Every syntax/example it shows must be
// accepted by the real parser, otherwise users copy commands that silently do not work.
const src = fs.readFileSync('apps/web/src/pages/CommandBrowserModal.tsx', 'utf-8');
const entries: { name: string; syntax: string; example: string }[] = src
  .split(String.fromCharCode(10))
  .map((l) => l.trim())
  .filter((l) => l.startsWith('{ name:') && l.includes('syntax:') && l.includes('example:'))
  .map((l) => new Function(`return (${l.replace(/,$/, '')})`)());

const ctx = {
  variables: { urgent: true, price: 100, subtotal: 200, client: 'Ana', client_name: 'Ana', issue_summary: 'x', status: 'Open', priority: true, scheduled_date: '2026-01-02' },
  clipboardText: 'CLIP', selectedText: 'SEL',
  siteContext: { hostname: 'example.test', url: 'https://example.test/a' },
  snippetResolver: (s: string) => (s === 'signature' ? 'Kind regards' : null),
  tableResolver: () => 'Ion',
  currentDate: new Date('2026-03-15T10:30:00Z')
};

describe('Command Browser examples match the real parser', () => {
  it('extracts the documented commands', () => { expect(entries.length).toBeGreaterThan(15); });

  for (const e of entries) {
    for (const [kind, text] of [['syntax', e.syntax], ['example', e.example]] as const) {
      it(`${e.name} (${kind}) validates and renders without leftovers`, () => {
        const v = validateSnippetTemplate(text);
        expect(v.errors, 'validation errors').toEqual([]);
        expect(v.warnings, 'validation warnings').toEqual([]);
        const out = renderSnippet(text, ctx);
        expect(out.errors ?? [], 'render errors').toEqual([]);
        expect(out.text).not.toMatch(/\{\{|\}\}|\[Missing|\[Unknown|\[Error|undefined|NaN/);
      });
    }
  }

  it('form field commands are discovered as interactive fields', () => {
    const fields = extractFormFields('{{form:a}} {{form:b|type=paragraph}} {{form:c|options="X,Y"}} {{form:d|type=toggle}} {{form:e|type=date}}');
    expect(fields.map((f) => f.type)).toEqual(['text', 'paragraph', 'dropdown', 'toggle', 'date']);
  });
});
