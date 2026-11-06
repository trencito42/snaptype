import { describe, it, expect } from 'vitest';
import { ReverseShortcutMatcher } from '@snaptype/snippet-engine';
import { Snippet, DEFAULT_PREFERENCES } from '@snaptype/shared';

function generateSnippets(count: number): Snippet[] {
  const result: Snippet[] = [];
  for (let i = 0; i < count; i++) {
    result.push({
      id: `snip-${i}`,
      workspaceId: 'ws-perf',
      folderId: null,
      name: `Performance Snippet ${i}`,
      shortcut: `sc_${i}_test`,
      plainContent: `This is the expanded text for snippet number ${i}. It contains realistic customer support copy.`,
      tags: ['perf', `batch-${Math.floor(i / 100)}`],
      isFavorite: i % 10 === 0,
      isEnabled: true,
      version: 1,
      usageCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }
  return result;
}

describe('Performance Benchmarks on Large Snippet Libraries', () => {
  const counts = [10, 100, 1000, 5000];

  for (const count of counts) {
    it(`benchmarks reverse-trie lookup speed with ${count} snippets`, () => {
      const snippets = generateSnippets(count);
      const matcher = new ReverseShortcutMatcher(snippets, false);

      // Verify size
      expect(matcher.size()).toBe(count);

      // Pick a target shortcut in the library
      const targetShortcut = `sc_${Math.floor(count / 2)}_test`;
      const testBuffer = `Here is some normal typing context before the shortcut: ${targetShortcut}`;

      // Measure 1,000 lookups
      const iterations = 1000;
      const start = performance.now();

      for (let i = 0; i < iterations; i++) {
        const match = matcher.findMatch(testBuffer, {
          ...DEFAULT_PREFERENCES,
          triggerMode: 'immediate'
        });
        if (i === 0) {
          expect(match).not.toBeNull();
          expect(match?.snippet.shortcut).toBe(targetShortcut);
        }
      }

      const totalElapsedMs = performance.now() - start;
      const avgLatencyPerLookupMs = totalElapsedMs / iterations;

      console.log(`⚡ [Benchmark ${count} snippets] Total time for ${iterations} lookups: ${totalElapsedMs.toFixed(2)}ms | Avg per lookup: ${(avgLatencyPerLookupMs * 1000).toFixed(2)} µs (${avgLatencyPerLookupMs.toFixed(4)} ms)`);

      // Performance budget: Target below 5ms processing on low-end hardware
      // Our trie takes ~0.001 - 0.05 ms!
      expect(avgLatencyPerLookupMs).toBeLessThan(1.0); // Strict under 1ms requirement
    });
  }
});

