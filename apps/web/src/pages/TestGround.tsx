import React, { useState } from 'react';
import { ShieldCheck, Info } from 'lucide-react';

export const TestGround: React.FC = () => {
  const [reactVal, setReactVal] = useState('Type your shortcut here...');
  const [inputVal, setInputVal] = useState('');

  return (
    <div style={{ maxWidth: 880, margin: '0 auto', padding: '40px 24px 100px' }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: -0.5, marginBottom: 8 }}>
          Extension Verification Playground
        </h1>
        <p style={{ fontSize: 15, color: 'var(--text-secondary)' }}>
          Test the SnapType extension across diverse DOM elements, frameworks, and security boundary conditions.
        </p>
      </div>

      <div style={{
        background: 'var(--surface-subtle)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)',
        padding: '14px 18px',
        marginBottom: 28,
        display: 'flex',
        alignItems: 'center',
        gap: 12
      }}>
        <Info size={18} color="#101110" />
        <span style={{ fontSize: 13, color: 'var(--ink)' }}>
          Try shortcuts like <strong>msver</strong>, <strong>cerbonus</strong>, <strong>/salut</strong>, or your custom configured shortcuts.
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 24 }}>
        {/* Field 1: Standard Input */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 20 }}>
          <label style={{ display: 'block', fontSize: 14, fontWeight: 700, marginBottom: 4 }}>
            1. Standard HTML &lt;input type="text"&gt;
          </label>
          <span style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>
            Tests native DOM input text replacement and caret preservation.
          </span>
          <input
            id="test-standard-input"
            type="text"
            className="input"
            placeholder="Type 'msver' or 'cerbonus' here..."
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
          />
        </div>

        {/* Field 2: Standard Textarea */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 20 }}>
          <label style={{ display: 'block', fontSize: 14, fontWeight: 700, marginBottom: 4 }}>
            2. Standard HTML &lt;textarea&gt; (Multi-line)
          </label>
          <span style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>
            Tests multi-line responses, cursor positioning, and undo stack.
          </span>
          <textarea
            id="test-standard-textarea"
            className="input"
            rows={5}
            placeholder="Type 'cerbonus' or '/salut' here..."
          />
        </div>

        {/* Field 3: React-controlled input */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 20 }}>
          <label style={{ display: 'block', fontSize: 14, fontWeight: 700, marginBottom: 4 }}>
            3. React-Controlled Input with Synthetic State
          </label>
          <span style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>
            Tests synthetic event dispatching (`beforeinput`, `input`, `change`) so React state syncs properly.
          </span>
          <input
            id="test-react-input"
            type="text"
            className="input"
            value={reactVal}
            onChange={(e) => setReactVal(e.target.value)}
          />
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
            Current React state character length: <strong>{reactVal.length}</strong>
          </div>
        </div>

        {/* Field 4: ContentEditable Div */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 20 }}>
          <label style={{ display: 'block', fontSize: 14, fontWeight: 700, marginBottom: 4 }}>
            4. Rich Text &lt;div contenteditable="true"&gt;
          </label>
          <span style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>
            Simulates modern support chat tools (Zendesk, Intercom, Gmail). Tests DOM Range and Selection API.
          </span>
          <div
            id="test-contenteditable"
            contentEditable
            style={{
              minHeight: 100,
              padding: 12,
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              outline: 'none',
              backgroundColor: 'var(--surface)'
            }}
          >
            Click here and type <strong>cerbonus</strong>
          </div>
        </div>

        {/* Field 5: Security exclusion password field */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <ShieldCheck size={18} color="#166534" />
            <label style={{ fontSize: 14, fontWeight: 700 }}>
              5. Sensitive &lt;input type="password"&gt; (Security Boundary)
            </label>
          </div>
          <span style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>
            SnapType must <strong>NEVER</strong> trigger or expand inside password or sensitive fields.
          </span>
          <input
            id="test-password-input"
            type="password"
            className="input"
            placeholder="Type 'cerbonus' here - it should NOT expand"
          />
        </div>
      </div>
    </div>
  );
};
