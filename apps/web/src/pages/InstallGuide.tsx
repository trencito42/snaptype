import React from 'react';

const card: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-md)',
  padding: 24,
  marginBottom: 20
};
const steps: React.CSSProperties = { paddingLeft: 20, fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.8 };

export const InstallGuide: React.FC = () => (
  <div style={{ maxWidth: 820, margin: '0 auto', padding: '32px 16px 72px' }}>
    <h1 style={{ fontSize: 'clamp(1.6rem, 5vw, 2.2rem)', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 8 }}>
      Install the SnapType extension
    </h1>
    <p style={{ color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.6 }}>
      SnapType works in Chrome-based browsers (Chrome, Edge, Brave) and in Firefox.
    </p>

    <div style={{ ...card, background: 'var(--surface-subtle)' }} role="note">
      <strong>Availability:</strong> the extension is not published on the Chrome Web Store or Firefox Add-ons yet, so there
      is no store button. Until it is, install it from the release packages (<code>chrome-extension.zip</code>,{' '}
      <code>firefox-extension.zip</code>) provided by whoever runs your SnapType server.
    </div>

    <section style={card} aria-labelledby="chrome-h">
      <h2 id="chrome-h" style={{ fontSize: 18, marginBottom: 10 }}>Chrome, Edge, Brave</h2>
      <ol style={steps}>
        <li>Unzip <code>chrome-extension.zip</code> to a folder you will keep.</li>
        <li>Open <code>chrome://extensions</code> (Edge: <code>edge://extensions</code>) and turn on <strong>Developer mode</strong>.</li>
        <li>Choose <strong>Load unpacked</strong> and select the unzipped folder.</li>
        <li>Pin SnapType from the puzzle-piece menu, open it and sign in with your email code.</li>
      </ol>
    </section>

    <section style={card} aria-labelledby="ff-h">
      <h2 id="ff-h" style={{ fontSize: 18, marginBottom: 10 }}>Firefox</h2>
      <ol style={steps}>
        <li>Open <code>about:debugging#/runtime/this-firefox</code>.</li>
        <li>Choose <strong>Load Temporary Add-on…</strong> and select <code>firefox-extension.zip</code> (or its <code>manifest.json</code>).</li>
        <li>Open SnapType from the toolbar and sign in.</li>
      </ol>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8 }}>
        Firefox removes temporary add-ons when it restarts. A permanent install needs a signed package from Mozilla Add-ons.
      </p>
    </section>

    <section style={card} aria-labelledby="try-h">
      <h2 id="try-h" style={{ fontSize: 18, marginBottom: 10 }}>Check that it works</h2>
      <ol style={steps}>
        <li>Create a snippet in the dashboard, for example shortcut <code>/thx</code>.</li>
        <li>Open any page with a text box and type the shortcut. It should expand in place.</li>
        <li>If nothing happens, press <strong>Sync</strong> in the extension popup, confirm the workspace matches the one in the dashboard, and try the Test playground page.</li>
      </ol>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8 }}>
        SnapType does not expand text in password fields or other sensitive inputs. Some rich-text editors may behave
        differently; compatibility has not been verified for every site.
      </p>
    </section>
  </div>
);
