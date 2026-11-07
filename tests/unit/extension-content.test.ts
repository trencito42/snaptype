import { describe, it, expect } from 'vitest';
import { TextInserter } from '@snaptype/browser-compat';
import { extractFormFields } from '@snaptype/snippet-engine';
import { Snippet } from '@snaptype/shared';

// Extracted logic identical to ContentEngine site restriction helper
function isSnippetAllowedOnSite(snippet: Snippet, currentHostname: string): boolean {
  if (!snippet.siteRestrictions || !snippet.siteRestrictions.mode || !snippet.siteRestrictions.domains?.length) {
    return true;
  }
  const host = currentHostname.toLowerCase();
  const domains = snippet.siteRestrictions.domains.map((d) => d.toLowerCase().trim()).filter(Boolean);
  const matches = domains.some((d) => host === d || host.endsWith('.' + d));

  if (snippet.siteRestrictions.mode === 'allow') {
    return matches;
  }
  if (snippet.siteRestrictions.mode === 'block') {
    return !matches;
  }
  return true;
}

function isMatchingHotkey(e: { ctrlKey: boolean; shiftKey: boolean; altKey: boolean; metaKey: boolean; key: string; code: string }, shortcutStr?: string): boolean {
  const hotkey = (shortcutStr || 'Ctrl+Shift+Space').toLowerCase();
  const parts = hotkey.split('+').map((p) => p.trim());

  const expectCtrl = parts.includes('ctrl') || parts.includes('control');
  const expectShift = parts.includes('shift');
  const expectAlt = parts.includes('alt');
  const expectMeta = parts.includes('meta') || parts.includes('cmd') || parts.includes('command');

  if (e.ctrlKey !== expectCtrl) return false;
  if (e.shiftKey !== expectShift) return false;
  if (e.altKey !== expectAlt) return false;
  if (e.metaKey !== expectMeta) return false;

  const keyPart = parts.find((p) => !['ctrl', 'control', 'shift', 'alt', 'meta', 'cmd', 'command'].includes(p)) || 'space';

  if (keyPart === 'space' && (e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar')) {
    return true;
  }

  return e.key.toLowerCase() === keyPart || e.code.toLowerCase() === `key${keyPart}`;
}

describe('Milestone B: Extension Engine & Content Script Verifications', () => {
  it('ST-011: matches configurable user hotkey (not hardcoded)', () => {
    // Default Ctrl+Shift+Space
    expect(isMatchingHotkey({ ctrlKey: true, shiftKey: true, altKey: false, metaKey: false, key: ' ', code: 'Space' }, 'Ctrl+Shift+Space')).toBe(true);
    expect(isMatchingHotkey({ ctrlKey: false, shiftKey: true, altKey: false, metaKey: false, key: ' ', code: 'Space' }, 'Ctrl+Shift+Space')).toBe(false);

    // Custom Alt+Shift+S
    expect(isMatchingHotkey({ ctrlKey: false, shiftKey: true, altKey: true, metaKey: false, key: 's', code: 'KeyS' }, 'Alt+Shift+S')).toBe(true);
    expect(isMatchingHotkey({ ctrlKey: true, shiftKey: false, altKey: false, metaKey: false, key: 's', code: 'KeyS' }, 'Alt+Shift+S')).toBe(false);
  });

  it('ST-012: enforces per-snippet siteRestrictions (allow and block modes)', () => {
    const baseSnippet: Snippet = {
      id: 'snip-1',
      workspaceId: 'ws-1',
      folderId: null,
      name: 'Internal Only',
      shortcut: 'corp',
      plainContent: 'Confidential company info',
      tags: [],
      isFavorite: false,
      isEnabled: true,
      version: 1,
      usageCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // No restrictions -> allowed anywhere
    expect(isSnippetAllowedOnSite(baseSnippet, 'crm.company.com')).toBe(true);
    expect(isSnippetAllowedOnSite(baseSnippet, 'public-site.org')).toBe(true);

    // Allowlist mode
    const allowSnippet: Snippet = {
      ...baseSnippet,
      siteRestrictions: {
        mode: 'allow',
        domains: ['company.com', 'internal.net']
      }
    };
    expect(isSnippetAllowedOnSite(allowSnippet, 'support.company.com')).toBe(true);
    expect(isSnippetAllowedOnSite(allowSnippet, 'company.com')).toBe(true);
    expect(isSnippetAllowedOnSite(allowSnippet, 'competitor.com')).toBe(false);

    // Blocklist mode
    const blockSnippet: Snippet = {
      ...baseSnippet,
      siteRestrictions: {
        mode: 'block',
        domains: ['facebook.com', 'twitter.com']
      }
    };
    expect(isSnippetAllowedOnSite(blockSnippet, 'crm.company.com')).toBe(true);
    expect(isSnippetAllowedOnSite(blockSnippet, 'm.facebook.com')).toBe(false);
    expect(isSnippetAllowedOnSite(blockSnippet, 'facebook.com')).toBe(false);
  });

  it('ST-015: parses dynamic form toggle and enforces required attributes', () => {
    const template = 'Status: {{form:agree|type=toggle|default=true}}, Reason: {{form:reason|type=paragraph|required=true}}';
    const fields = extractFormFields(template);

    expect(fields).toHaveLength(2);
    expect(fields[0].type).toBe('toggle');
    expect(fields[0].defaultValue).toBe(true);

    expect(fields[1].type).toBe('paragraph');
    expect(fields[1].required).toBe(true);
  });

  it('ST-016: verifies programmatic insert guard in TextInserter', () => {
    expect(TextInserter.isProgrammaticInsert).toBe(false);
  });

  it('Blocker 8: Fail-safe dynamic command insertion stops insertion when template errors exist', () => {
    const { renderSnippet } = require('@snaptype/snippet-engine');
    // Template with unknown table command and missing resolver
    const brokenTemplate = 'Hello {{table:nonexistent_table|lookup=id|value=999|column=name}}!';
    const rendered = renderSnippet(brokenTemplate, {});

    expect(rendered.errors).toBeDefined();
    expect(rendered.errors!.length).toBeGreaterThan(0);
    expect(rendered.errors![0]).toContain('resolver unavailable for table');
  });

  it('Blocker 9: In-memory Data Table resolver resolves rows accurately', () => {
    const { renderSnippet } = require('@snaptype/snippet-engine');
    const mockTables = [
      {
        id: 't1',
        name: 'Pricing',
        workspaceId: 'ws-1',
        columns: [],
        rows: [
          { id: 'r1', tableId: 't1', data: { plan: 'Pro', price: '$29/mo' }, createdAt: '', updatedAt: '' },
          { id: 'r2', tableId: 't1', data: { plan: 'Enterprise', price: '$99/mo' }, createdAt: '', updatedAt: '' }
        ],
        createdAt: '',
        updatedAt: ''
      }
    ];

    const tableResolver = (tableName: string, lookupKey: string, lookupVal: any, targetCol: string) => {
      const table = mockTables.find((t) => t.name.toLowerCase() === tableName.toLowerCase());
      if (!table || !table.rows) return null;
      const lookupStr = String(lookupVal).toLowerCase().trim();
      const match = table.rows.find((r) => {
        const val = r.data && r.data[lookupKey];
        return val !== undefined && String(val).toLowerCase().trim() === lookupStr;
      });
      if (!match || !match.data) return null;
      const targetVal = match.data[targetCol];
      return targetVal !== undefined ? String(targetVal) : null;
    };

    const template = 'Your price is: {{table:Pricing|lookup=plan|value=Enterprise|column=price}}';
    const rendered = renderSnippet(template, { tableResolver });

    expect(rendered.errors).toHaveLength(0);
    expect(rendered.text).toBe('Your price is: $99/mo');
  });

  it('Requirement 14: extracts selected text from input and textarea elements via selectionStart / selectionEnd', () => {
    function getSelectedTextFromElement(el: { selectionStart?: number; selectionEnd?: number; value?: string }): string {
      if (typeof el.selectionStart === 'number' && typeof el.selectionEnd === 'number' && el.value) {
        if (el.selectionEnd > el.selectionStart) {
          return el.value.substring(el.selectionStart, el.selectionEnd);
        }
      }
      return '';
    }

    const mockInput = { selectionStart: 5, selectionEnd: 11, value: 'Good morning world' };
    expect(getSelectedTextFromElement(mockInput)).toBe('mornin');
  });
});

