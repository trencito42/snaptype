import { Snippet, UserPreferences } from '@snaptype/shared';

export interface MatchResult {
  snippet: Snippet;
  matchedShortcut: string;
  matchLength: number; // characters to delete before caret
  triggerUsed: 'immediate' | 'space' | 'delimiter' | 'manual';
}

interface TrieNode {
  children: Map<string, TrieNode>;
  snippet?: Snippet;
  shortcut?: string;
}

export class ReverseShortcutMatcher {
  private root: TrieNode = { children: new Map() };
  private count: number = 0;
  private caseSensitive: boolean = false;
  private maxShortcutLength: number = 0;

  constructor(snippets: Snippet[] = [], caseSensitive: boolean = false) {
    this.caseSensitive = caseSensitive;
    this.rebuild(snippets, caseSensitive);
  }

  public rebuild(snippets: Snippet[], caseSensitive: boolean = this.caseSensitive): void {
    this.root = { children: new Map() };
    this.count = 0;
    this.caseSensitive = caseSensitive;
    this.maxShortcutLength = 0;

    for (const snippet of snippets) {
      if (snippet.isEnabled && snippet.shortcut) {
        this.insert(snippet);
      }
    }
  }

  public insert(snippet: Snippet): void {
    const rawShortcut = snippet.shortcut.trim();
    if (!rawShortcut) return;

    const shortcut = this.caseSensitive ? rawShortcut : rawShortcut.toLowerCase();
    if (shortcut.length > this.maxShortcutLength) {
      this.maxShortcutLength = shortcut.length;
    }

    // Insert into reverse trie: last character of shortcut is at root level
    let current = this.root;
    for (let i = shortcut.length - 1; i >= 0; i--) {
      const char = shortcut[i];
      let next = current.children.get(char);
      if (!next) {
        next = { children: new Map() };
        current.children.set(char, next);
      }
      current = next;
    }

    current.snippet = snippet;
    current.shortcut = rawShortcut;
    this.count++;
  }

  public size(): number {
    return this.count;
  }

  /**
   * Search for a matched shortcut ending at the current cursor position.
   * bufferTail is the preceding text up to the cursor (e.g. the last 100 characters).
   */
  public findMatch(bufferTail: string, prefs: UserPreferences): MatchResult | null {
    if (!bufferTail || this.count === 0) return null;

    const text = this.caseSensitive ? bufferTail : bufferTail.toLowerCase();
    const len = text.length;

    // Handle trigger modes
    if (prefs.triggerMode === 'manual') {
      return null;
    }

    if (prefs.triggerMode === 'space') {
      // Must end with whitespace or tab
      const lastChar = text[len - 1];
      if (lastChar !== ' ' && lastChar !== '\t' && lastChar !== '\n') {
        return null;
      }
      // Look back starting before the space
      return this.matchReverse(text.slice(0, len - 1), prefs, true);
    }

    return this.matchReverse(text, prefs, false);
  }

  private matchReverse(text: string, prefs: UserPreferences, trailingSpace: boolean): MatchResult | null {
    const len = text.length;
    let current = this.root;
    let matchedNode: TrieNode | null = null;
    let matchedLength = 0;

    for (let i = len - 1; i >= 0; i--) {
      const char = text[i];
      const next = current.children.get(char);
      if (!next) {
        break;
      }

      current = next;
      const depth = len - i;

      if (current.snippet && current.shortcut) {
        // Boundary check: ensure it doesn't accidentally trigger inside an alphanumeric word
        // unless delimiter is used or deliberate boundary
        const charBeforeShortcut = i > 0 ? text[i - 1] : '';
        const isWordChar = /[\p{L}\p{N}]/u.test(charBeforeShortcut);

        // If the shortcut starts with a non-word char (like `/` or `#` or `@`), it's safe anywhere
        const startsWithSymbol = !/[\p{L}\p{N}]/u.test(current.shortcut[0]);

        if (startsWithSymbol || !isWordChar || prefs.triggerMode === 'immediate') {
          matchedNode = current;
          matchedLength = depth;
          // Prefer longest matching shortcut
        }
      }

      if (depth > this.maxShortcutLength) {
        break;
      }
    }

    if (matchedNode && matchedNode.snippet && matchedNode.shortcut) {
      return {
        snippet: matchedNode.snippet,
        matchedShortcut: matchedNode.shortcut,
        matchLength: matchedLength + (trailingSpace ? 1 : 0),
        triggerUsed: trailingSpace ? 'space' : 'immediate'
      };
    }

    return null;
  }
}

