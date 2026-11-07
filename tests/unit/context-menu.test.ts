import { describe, it, expect } from 'vitest';
import { buildMenuModel, pickMenuSnippets, MENU_IDS } from '../../apps/extension/src/background/context-menu.js';

const snip = (o: Partial<any>) => ({ id: 'i', name: 'n', shortcut: 's', isEnabled: true, isFavorite: false, usageCount: 0, ...o }) as any;

describe('context menu model', () => {
  it('shows only a sign-in entry when signed out', () => {
    const m = buildMenuModel({ authenticated: false, hotkey: 'Ctrl+Shift+Space', snippets: [] });
    expect(m.map((i) => i.id)).toEqual([MENU_IDS.signIn]);
  });

  it('offers assistant, top snippets, sync, save-selection and toolbar items when signed in', () => {
    const m = buildMenuModel({ authenticated: true, hotkey: 'Ctrl+Shift+Space', snippets: [snip({ id: 'a', name: 'Refund', shortcut: '/refund' })] });
    const ids = m.map((i) => i.id);
    expect(ids).toContain(MENU_IDS.root);
    expect(ids).toContain(MENU_IDS.assistant);
    expect(ids).toContain(`${MENU_IDS.snippetPrefix}a`);
    expect(ids).toContain(MENU_IDS.sync);
    expect(m.find((i) => i.id === MENU_IDS.saveSelection)?.contexts).toEqual(['selection']);
    expect(m.find((i) => i.id === MENU_IDS.openDashboard)?.contexts).toEqual(['action']);
    expect(m.find((i) => i.id === MENU_IDS.assistant)?.title).toContain('Ctrl+Shift+Space');
  });

  it('every child points at an existing parent and ids are unique', () => {
    const m = buildMenuModel({ authenticated: true, hotkey: 'Alt+K', snippets: [snip({ id: 'a' }), snip({ id: 'b' })] });
    const ids = m.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const i of m) if (i.parentId) expect(ids).toContain(i.parentId);
  });

  it('ranks favourites, then most used, skips disabled, and caps the list', () => {
    const list = [
      snip({ id: 'plain', name: 'Plain' }),
      snip({ id: 'used', name: 'Used', usageCount: 50 }),
      snip({ id: 'fav', name: 'Fav', isFavorite: true }),
      snip({ id: 'off', name: 'Off', isFavorite: true, isEnabled: false }),
      ...Array.from({ length: 12 }, (_, k) => snip({ id: `x${k}`, name: `X${k}` }))
    ];
    const top = pickMenuSnippets(list);
    expect(top.map((s) => s.id).slice(0, 3)).toEqual(['fav', 'used', 'plain']);
    expect(top.find((s) => s.id === 'off')).toBeUndefined();
    expect(top.length).toBe(8);
  });

  it('shows a disabled hint instead of an empty submenu and clips long names', () => {
    const empty = buildMenuModel({ authenticated: true, hotkey: 'Alt+K', snippets: [] });
    expect(empty.find((i) => i.id === MENU_IDS.empty)?.enabled).toBe(false);
    const long = buildMenuModel({ authenticated: true, hotkey: 'Alt+K', snippets: [snip({ id: 'l', name: 'A'.repeat(200), shortcut: '/x' })] });
    expect((long.find((i) => i.id === `${MENU_IDS.snippetPrefix}l`)?.title || '').length).toBeLessThan(90);
  });
});
