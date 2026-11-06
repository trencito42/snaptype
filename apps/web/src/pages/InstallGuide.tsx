import React from 'react';
import { Download, Chrome, Globe, Terminal, CheckCircle2 } from 'lucide-react';

export const InstallGuide: React.FC = () => {
  return (
    <div style={{ maxWidth: 840, margin: '0 auto', padding: '40px 24px 100px' }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: -0.5, marginBottom: 8 }}>
        Extension Installation Guide
      </h1>
      <p style={{ fontSize: 15, color: 'var(--text-secondary)', marginBottom: 36 }}>
        SnapType provides lightweight, production-ready builds for both Chromium (Chrome, Edge, Brave) and Mozilla Firefox.
      </p>

      {/* Chrome Guide */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        padding: 28,
        marginBottom: 28
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <div style={{ width: 32, height: 32, borderRadius: 6, backgroundColor: 'var(--surface-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Chrome size={20} />
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>Google Chrome & Chromium (MV3)</h2>
        </div>

        <ol style={{ paddingLeft: 20, fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
          <li>Build the Chrome extension bundle: <code className="badge badge-mono">npm run build:extension:chrome</code></li>
          <li>In Chrome, navigate to <code className="badge badge-mono">chrome://extensions</code></li>
          <li>Toggle on <strong>Developer mode</strong> in the top-right corner.</li>
          <li>Click the <strong>Load unpacked</strong> button in the top-left corner.</li>
          <li>Select the <code className="badge badge-mono">dist/chrome</code> directory from this repository.</li>
          <li>The SnapType icon will appear in your browser extension toolbar!</li>
        </ol>
      </div>

      {/* Firefox Guide */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        padding: 28,
        marginBottom: 28
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <div style={{ width: 32, height: 32, borderRadius: 6, backgroundColor: 'var(--surface-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Globe size={20} />
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>Mozilla Firefox (MV3)</h2>
        </div>

        <ol style={{ paddingLeft: 20, fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
          <li>Build the Firefox extension bundle: <code className="badge badge-mono">npm run build:extension:firefox</code></li>
          <li>In Firefox, navigate to <code className="badge badge-mono">about:debugging#/runtime/this-firefox</code></li>
          <li>Click <strong>Load Temporary Add-on...</strong></li>
          <li>Select the <code className="badge badge-mono">dist/firefox/manifest.json</code> file.</li>
          <li>SnapType is now active for your Firefox browsing session!</li>
        </ol>
      </div>

      {/* Release Artifacts */}
      <div style={{
        background: 'var(--surface-subtle)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        padding: 24
      }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Packaged Store Archives</h3>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 14 }}>
          Run <code className="badge badge-mono">npm run package:extensions</code> to automatically generate the submission-ready zip files:
        </p>
        <ul style={{ paddingLeft: 20, fontSize: 13, color: 'var(--ink)', fontFamily: 'var(--font-mono)' }}>
          <li>dist/chrome-extension.zip (Chrome Web Store format)</li>
          <li>dist/firefox-extension.zip (Firefox AMO format)</li>
        </ul>
      </div>
    </div>
  );
};

