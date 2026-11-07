import React from 'react';

/**
 * SnapType mark: a lime tile holding a text caret followed by a forward slash —
 * the "type a shortcut, get text" gesture. Original geometry, pure SVG, no assets.
 * NOTE: no approved brand asset exists in the repository; replace this component's
 * body if the owner supplies one.
 */
export const LogoMark: React.FC<{ size?: number }> = ({ size = 28 }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" role="img" aria-label="SnapType" focusable="false">
    <rect width="32" height="32" rx="8" fill="var(--accent)" />
    <path d="M12 8v16" stroke="#10200d" strokeWidth="3" strokeLinecap="round" />
    <path d="M21.5 8.5 17 23.5" stroke="#10200d" strokeWidth="3" strokeLinecap="round" />
  </svg>
);

export const Wordmark: React.FC = () => (
  <span className="wordmark">
    Snap<span>Type</span>
  </span>
);
