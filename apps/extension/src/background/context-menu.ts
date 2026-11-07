import type { Snippet } from '@snaptype/shared';

export interface MenuItemSpec {
  id: string;
  title?: string;
  type?: 'normal' | 'separator';
  contexts: string[];
  parentId?: string;
  enabled?: boolean;
}

export const MENU_IDS = {
  root: 'snaptype-root',
  assistant: 'snaptype-open-assistant',
  sync: 'snaptype-sync',
  empty: 'snaptype-empty',
  snippetPrefix: 'snaptype-snip:',
  saveSelection: 'snaptype-save-selection',
  openDashboard: 'snaptype-open-dashboard',
  syncAction: 'snaptype-sync-action',
  signIn: 'snaptype-signin'
} as const;

const MAX_SNIPPETS_IN_MENU = 8;
const MAX_TITLE = 56;

const clip = (text: string, max: number) => {
  const single = text.replace(/\s+/g, ' ').trim();
  return single.length > max ? single.slice(0, max - 1) + '…' : single;
};

/** The snippets worth a menu slot: favourites first, then most used, then alphabetical. Disabled ones are skipped. */
export function pickMenuSnippets(snippets: Snippet[], limit = MAX_SNIPPETS_IN_MENU): Snippet[] {
  return snippets
    .filter((s) => s.isEnabled)
    .sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite) || (b.usageCount || 0) - (a.usageCount || 0) || a.name.localeCompare(b.name))
    .slice(0, limit);
}

export function buildMenuModel(input: { authenticated: boolean; hotkey: string; snippets: Snippet[] }): MenuItemSpec[] {
  if (!input.authenticated) {
    return [
      { id: MENU_IDS.signIn, title: 'SnapType: sign in to use your snippets', contexts: ['editable', 'action'] }
    ];
  }

  const items: MenuItemSpec[] = [
    { id: MENU_IDS.root, title: 'SnapType', contexts: ['editable'] },
    { id: MENU_IDS.assistant, parentId: MENU_IDS.root, title: `Search all snippets…   ${input.hotkey}`, contexts: ['editable'] },
    { id: 'snaptype-sep-1', parentId: MENU_IDS.root, type: 'separator', contexts: ['editable'] }
  ];

  const top = pickMenuSnippets(input.snippets);
  if (top.length === 0) {
    items.push({ id: MENU_IDS.empty, parentId: MENU_IDS.root, title: 'No snippets yet. Create one in the dashboard.', contexts: ['editable'], enabled: false });
  } else {
    for (const s of top) {
      items.push({
        id: `${MENU_IDS.snippetPrefix}${s.id}`,
        parentId: MENU_IDS.root,
        title: `${clip(s.name, MAX_TITLE)}   ${clip(s.shortcut, 20)}`,
        contexts: ['editable']
      });
    }
  }

  items.push(
    { id: 'snaptype-sep-2', parentId: MENU_IDS.root, type: 'separator', contexts: ['editable'] },
    { id: MENU_IDS.sync, parentId: MENU_IDS.root, title: 'Sync now', contexts: ['editable'] },
    // Selected text anywhere on a page: turn it into a snippet
    { id: MENU_IDS.saveSelection, title: 'Save "%s" as a SnapType snippet', contexts: ['selection'] },
    // Toolbar button menu
    { id: MENU_IDS.openDashboard, title: 'Open SnapType dashboard', contexts: ['action'] },
    { id: MENU_IDS.syncAction, title: 'Sync now', contexts: ['action'] }
  );
  return items;
}
