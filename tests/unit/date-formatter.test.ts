import { describe, it, expect } from 'vitest';
import { formatDateTime, applyDateOffset } from '@snaptype/snippet-engine';

describe('Date & Time Formatter', () => {
  const fixedDate = new Date('2026-11-06T15:30:45Z');

  it('formats dates with custom patterns', () => {
    // Note: Use UTC for predictable test outputs
    const formatted = formatDateTime(fixedDate, { format: 'YYYY-MM-DD', timezone: 'UTC' });
    expect(formatted).toBe('2026-11-06');

    const formattedTime = formatDateTime(fixedDate, { format: 'HH:mm:ss', timezone: 'UTC' });
    expect(formattedTime).toBe('15:30:45');
  });

  it('calculates relative date offsets correctly', () => {
    const base = new Date('2026-11-06T12:00:00Z');

    const tomorrow = applyDateOffset(base, '+1d');
    expect(tomorrow.getUTCDate()).toBe(7);

    const yesterday = applyDateOffset(base, '-1d');
    expect(yesterday.getUTCDate()).toBe(5);

    const nextWeek = applyDateOffset(base, '+1w');
    expect(nextWeek.getUTCDate()).toBe(13);
  });
});

