import { describe, it, expect } from 'vitest';
import { ReverseShortcutMatcher } from '@snaptype/snippet-engine';
import { Snippet, DEFAULT_PREFERENCES } from '@snaptype/shared';

function createSnippet(shortcut: string, content: string = 'test content'): Snippet {
  return {
    id: `snip-${shortcut}`,
    workspaceId: 'ws-1',
    folderId: null,
    name: `Snippet ${shortcut}`,
    shortcut,
    plainContent: content,
    tags: [],
    isFavorite: false,
    isEnabled: true,
    version: 1,
    usageCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

describe('ReverseShortcutMatcher', () => {
  it('correctly matches simple shortcuts immediately at the end of text', () => {
    const snippets = [
      createSnippet('cerbonus', 'Cerere bonus text'),
      createSnippet('msver', 'Mesaj verificare'),
      createSnippet('/salut', 'Salut client')
    ];

    const matcher = new ReverseShortcutMatcher(snippets, false);

    // Exact match
    const match1 = matcher.findMatch('cerbonus', { ...DEFAULT_PREFERENCES, triggerMode: 'immediate' });
    expect(match1).not.toBeNull();
    expect(match1?.snippet.shortcut).toBe('cerbonus');
    expect(match1?.matchLength).toBe(8);

    // Preceded by sentence
    const match2 = matcher.findMatch('Hello client, here is msver', { ...DEFAULT_PREFERENCES, triggerMode: 'immediate' });
    expect(match2).not.toBeNull();
    expect(match2?.snippet.shortcut).toBe('msver');
    expect(match2?.matchLength).toBe(5);

    // Slash prefix shortcut
    const match3 = matcher.findMatch('/salut', { ...DEFAULT_PREFERENCES, triggerMode: 'immediate' });
    expect(match3).not.toBeNull();
    expect(match3?.snippet.shortcut).toBe('/salut');
    expect(match3?.matchLength).toBe(6);
  });

  it('handles space trigger mode correctly', () => {
    const snippets = [createSnippet('cerbonus')];
    const matcher = new ReverseShortcutMatcher(snippets, false);

    // Typing without space should NOT trigger
    const noMatch = matcher.findMatch('cerbonus', { ...DEFAULT_PREFERENCES, triggerMode: 'space' });
    expect(noMatch).toBeNull();

    // Typing shortcut followed by space SHOULD trigger
    const matchWithSpace = matcher.findMatch('cerbonus ', { ...DEFAULT_PREFERENCES, triggerMode: 'space' });
    expect(matchWithSpace).not.toBeNull();
    expect(matchWithSpace?.snippet.shortcut).toBe('cerbonus');
    expect(matchWithSpace?.matchLength).toBe(9); // includes trailing space
  });

  it('handles case-insensitivity and case-sensitivity properly', () => {
    const snippets = [createSnippet('cerbonus')];

    // Case-insensitive
    const matcherInsensitive = new ReverseShortcutMatcher(snippets, false);
    const match1 = matcherInsensitive.findMatch('CERBONUS', { ...DEFAULT_PREFERENCES, caseSensitive: false });
    expect(match1).not.toBeNull();
    expect(match1?.snippet.shortcut).toBe('cerbonus');

    // Case-sensitive
    const matcherSensitive = new ReverseShortcutMatcher(snippets, true);
    const match2 = matcherSensitive.findMatch('CERBONUS', { ...DEFAULT_PREFERENCES, caseSensitive: true });
    expect(match2).toBeNull();

    const match3 = matcherSensitive.findMatch('cerbonus', { ...DEFAULT_PREFERENCES, caseSensitive: true });
    expect(match3).not.toBeNull();
  });

  it('distinguishes overlapping shortcuts by matching the longest valid shortcut', () => {
    const snippets = [
      createSnippet('bonus'),
      createSnippet('cerbonus')
    ];

    const matcher = new ReverseShortcutMatcher(snippets, false);
    const match = matcher.findMatch('cerbonus', { ...DEFAULT_PREFERENCES, triggerMode: 'immediate' });

    expect(match).not.toBeNull();
    expect(match?.snippet.shortcut).toBe('cerbonus');
    expect(match?.matchLength).toBe(8);
  });

  it('ignores disabled snippets', () => {
    const snip = createSnippet('disabled_snip');
    snip.isEnabled = false;

    const matcher = new ReverseShortcutMatcher([snip], false);
    const match = matcher.findMatch('disabled_snip', { ...DEFAULT_PREFERENCES, triggerMode: 'immediate' });
    expect(match).toBeNull();
  });
});
