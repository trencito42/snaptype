import React from 'react';
import { ShieldCheck } from 'lucide-react';

export const PrivacyPolicy: React.FC = () => {
  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '40px 24px 100px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <ShieldCheck size={28} color="#166534" />
        <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: -0.5 }}>
          Privacy Policy & Security Architecture
        </h1>
      </div>
      <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 32 }}>
        Last updated: November 2026. SnapType is designed for high-security customer support and corporate operations.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 24, fontSize: 14, lineHeight: 1.7, color: 'var(--text-secondary)' }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>
            1. Zero Keystroke Transmission
          </h2>
          <p>
            SnapType matches your shortcuts entirely in-memory inside the browser tab using a lightweight reverse-trie index.
            <strong> Your typed keystrokes, messages, customer data, and surrounding document text are NEVER transmitted to our servers or any third-party service.</strong>
          </p>
        </div>

        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>
            2. Authoritative Database & Ephemeral Client Memory
          </h2>
          <p>
            Your authoritative snippet database is stored securely in MySQL on the backend server.
            When you sign in, your browser loads shortcut definitions into ephemeral session memory. Snippet bodies and libraries are <strong>NOT</strong> permanently written to the browser's persistent disk storage, ensuring confidential text cannot be extracted from browser caches if a workstation is shared or decommissioned.
          </p>
        </div>

        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>
            3. Sensitive Field Exclusions
          </h2>
          <p>
            SnapType automatically detects and completely ignores password inputs (<code className="badge badge-mono">type="password"</code>), credit card numbers, CVV security codes, and one-time MFA codes (<code className="badge badge-mono">autocomplete="one-time-code"</code>).
          </p>
        </div>

        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>
            4. Minimal Browser Extension Permissions
          </h2>
          <p>
            The browser extension requests only the minimum permissions required for operation: active tab context and session storage. It does not use remote executable code, does not load third-party analytics trackers, and operates strictly under modern Manifest V3 security boundaries.
          </p>
        </div>
      </div>
    </div>
  );
};

