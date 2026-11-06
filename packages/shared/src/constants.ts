export const DEFAULT_PREFERENCES = {
  triggerMode: 'immediate' as const, // 'immediate' | 'space' | 'delimiter' | 'manual'
  delimiterChar: '/',
  caseSensitive: false,
  assistantShortcut: 'Ctrl+Shift+Space',
  excludedDomains: [
    'accounts.google.com',
    'bankofamerica.com',
    'chase.com',
    'paypal.com',
    'login.live.com',
    'appleid.apple.com'
  ],
  disabledInSensitiveFields: true
};

export const SENSITIVE_INPUT_TYPES = new Set([
  'password',
  'hidden'
]);

export const SENSITIVE_AUTOCOMPLETE_VALUES = new Set([
  'current-password',
  'new-password',
  'cc-number',
  'cc-csc',
  'cc-exp',
  'one-time-code'
]);

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_SNIPPET_CONTENT_LENGTH = 100000;
export const MAX_SHORTCUT_LENGTH = 64;
