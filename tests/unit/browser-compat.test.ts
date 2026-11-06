import { describe, it, expect } from 'vitest';
import { DomDetector } from '@snaptype/browser-compat';

describe('Browser Compatibility & Security Exclusions', () => {
  it('correctly matches excluded domains including subdomains', () => {
    const excluded = ['accounts.google.com', 'bankofamerica.com', 'chase.com'];

    expect(DomDetector.isExcludedDomain('accounts.google.com', excluded)).toBe(true);
    expect(DomDetector.isExcludedDomain('chase.com', excluded)).toBe(true);
    expect(DomDetector.isExcludedDomain('onlinebanking.bankofamerica.com', excluded)).toBe(true);
    expect(DomDetector.isExcludedDomain('github.com', excluded)).toBe(false);
    expect(DomDetector.isExcludedDomain('localhost', excluded)).toBe(false);
  });
});

