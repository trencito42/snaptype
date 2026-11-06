import React, { useState } from 'react';
import { ReverseShortcutMatcher, renderSnippet, extractFormFields } from '@snaptype/snippet-engine';
import { ArrowRight, CheckCircle2, ShieldCheck, Cpu, Zap, Download } from 'lucide-react';

interface LandingPageProps {
  onOpenAuth: () => void;
  onNavigate: (view: string) => void;
}

const DEMO_SNIPPETS = [
  {
    id: 'demo-1',
    workspaceId: 'demo',
    folderId: null,
    name: 'Cerere bonus',
    shortcut: 'cerbonus',
    plainContent: `Bună ziua,

Vă mulțumim pentru mesaj.

Pentru a putea verifica solicitarea dumneavoastră legată de bonus, avem nevoie de informații suplimentare.

Vă stăm cu plăcere la dispoziție.`,
    tags: ['suport', 'bonus'],
    isFavorite: true,
    isEnabled: true,
    version: 1,
    usageCount: 42,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'demo-2',
    workspaceId: 'demo',
    folderId: null,
    name: 'Verificare cont',
    shortcut: 'msver',
    plainContent: `Bună ziua,

Vă informăm că verificarea contului dumneavoastră a fost finalizată cu succes.

Vă dorim o zi excelentă!`,
    tags: ['suport', 'verificare'],
    isFavorite: true,
    isEnabled: true,
    version: 1,
    usageCount: 128,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'demo-3',
    workspaceId: 'demo',
    folderId: null,
    name: 'Salutare client',
    shortcut: '/salut',
    plainContent: `Bună ziua, {{input:customerName|default="stimate client"}},

Cu ce vă putem ajuta astăzi în legătură cu solicitarea dumneavoastră?`,
    tags: ['salut'],
    isFavorite: false,
    isEnabled: true,
    version: 1,
    usageCount: 89,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

export const LandingPage: React.FC<LandingPageProps> = ({ onOpenAuth, onNavigate }) => {
  const [demoInput, setDemoInput] = useState('');
  const [matcher] = useState(() => new ReverseShortcutMatcher(DEMO_SNIPPETS, false));
  const [dynamicModal, setDynamicModal] = useState<{
    snippet: any;
    fields: any[];
    matchLength: number;
  } | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, any>>({});

  const handleDemoChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setDemoInput(val);

    // Run local in-memory reverse-trie matcher
    const match = matcher.findMatch(val, {
      triggerMode: 'immediate',
      delimiterChar: '/',
      caseSensitive: false,
      assistantShortcut: 'Ctrl+Shift+Space',
      excludedDomains: [],
      disabledInSensitiveFields: true
    });

    if (match) {
      const fields = extractFormFields(match.snippet.plainContent);
      if (fields.length > 0) {
        // Needs dynamic input
        const defaults: Record<string, any> = {};
        for (const f of fields) defaults[f.name] = f.defaultValue || '';
        setFieldValues(defaults);
        setDynamicModal({
          snippet: match.snippet,
          fields,
          matchLength: match.matchLength
        });
      } else {
        // Immediate expansion
        const rendered = renderSnippet(match.snippet.plainContent);
        const prefix = val.slice(0, val.length - match.matchLength);
        setDemoInput(prefix + rendered.text);
      }
    }
  };

  const handleApplyDynamic = () => {
    if (!dynamicModal) return;
    const rendered = renderSnippet(dynamicModal.snippet.plainContent, { variables: fieldValues });
    const prefix = demoInput.slice(0, demoInput.length - dynamicModal.matchLength);
    setDemoInput(prefix + rendered.text);
    setDynamicModal(null);
  };

  return (
    <div style={{ maxWidth: 1160, margin: '0 auto', padding: '60px 24px 120px' }}>
      {/* Hero Header */}
      <div style={{ textAlign: 'center', maxWidth: 840, margin: '0 auto 60px' }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 12px',
          borderRadius: 20,
          backgroundColor: 'var(--surface)',
          border: '1px solid var(--border)',
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--text-secondary)',
          marginBottom: 24
        }}>
          <span style={{ color: '#166534', fontWeight: 800 }}>● Active</span> Precision Text Expansion Platform
        </div>

        <h1 style={{
          fontSize: 'clamp(36px, 6vw, 62px)',
          fontWeight: 800,
          letterSpacing: '-1.5px',
          lineHeight: 1.08,
          marginBottom: 24,
          color: 'var(--ink)'
        }}>
          Faster responses.<br />
          <span style={{
            background: 'linear-gradient(180deg, #101110 0%, #30332e 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
          }}>
            Zero typing fatigue.
          </span>
        </h1>

        <p style={{
          fontSize: 19,
          lineHeight: 1.6,
          color: 'var(--text-secondary)',
          marginBottom: 36,
          maxWidth: 680,
          margin: '0 auto 36px'
        }}>
          SnapType gives customer support agents, operators, and writers instant shortcut expansion.
          Built for low-end hardware, 100% local keystroke matching, and sub-millisecond precision.
        </p>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 14 }}>
          <button className="btn btn-primary" style={{ padding: '12px 28px', fontSize: 16 }} onClick={onOpenAuth}>
            Get Started Free <ArrowRight size={18} />
          </button>
          <button className="btn btn-secondary" style={{ padding: '12px 24px', fontSize: 16 }} onClick={() => onNavigate('install')}>
            <Download size={18} /> Install Extension
          </button>
        </div>
      </div>

      {/* Interactive Live Demo */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        padding: '32px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.03)',
        marginBottom: 80
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h3 style={{ fontSize: 17, fontWeight: 700 }}>Try it in your browser right now</h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              Type any of these shortcuts inside the box below to test instant replacement:
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <span className="badge badge-mono">cerbonus</span>
            <span className="badge badge-mono">msver</span>
            <span className="badge badge-mono">/salut</span>
          </div>
        </div>

        <div style={{ position: 'relative' }}>
          <textarea
            className="input input-mono"
            style={{
              height: 180,
              fontSize: 15,
              lineHeight: 1.6,
              padding: 16,
              resize: 'vertical'
            }}
            placeholder="Type 'cerbonus', 'msver', or '/salut' here..."
            value={demoInput}
            onChange={handleDemoChange}
          />
          {demoInput && (
            <button
              className="btn btn-ghost btn-sm"
              style={{ position: 'absolute', bottom: 12, right: 12 }}
              onClick={() => setDemoInput('')}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Dynamic Form Modal (if triggered in demo) */}
      {dynamicModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100
        }}>
          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            padding: 24,
            width: 440,
            boxShadow: '0 10px 30px rgba(0,0,0,0.1)'
          }}>
            <h4 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Dynamic Fill-in Form</h4>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
              Snippet <strong>{dynamicModal.snippet.name}</strong> requests user parameters:
            </p>

            {dynamicModal.fields.map((field) => (
              <div key={field.name} style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                  {field.label}
                </label>
                <input
                  type="text"
                  className="input"
                  value={fieldValues[field.name] || ''}
                  onChange={(e) => setFieldValues({ ...fieldValues, [field.name]: e.target.value })}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleApplyDynamic();
                    if (e.key === 'Escape') setDynamicModal(null);
                  }}
                />
              </div>
            ))}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setDynamicModal(null)}>
                Cancel (Esc)
              </button>
              <button className="btn btn-primary btn-sm" onClick={handleApplyDynamic}>
                Insert Snippet (Enter)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Feature Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: 24,
        marginBottom: 80
      }}>
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          padding: 28
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: 8,
            backgroundColor: 'var(--surface-subtle)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 16, color: 'var(--ink)'
          }}>
            <Cpu size={22} />
          </div>
          <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Engineered for Low-End PCs</h3>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Reverse-trie index running entirely in browser RAM. Zero background timers, zero document scanning, zero battery drain.
          </p>
        </div>

        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          padding: 28
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: 8,
            backgroundColor: 'var(--surface-subtle)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 16, color: 'var(--ink)'
          }}>
            <ShieldCheck size={22} />
          </div>
          <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>No Keystroke Surveillance</h3>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Keystrokes never touch our servers. Automatic exclusion of passwords, credit cards, OTP codes, and banking domains.
          </p>
        </div>

        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          padding: 28
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: 8,
            backgroundColor: 'var(--surface-subtle)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 16, color: 'var(--ink)'
          }}>
            <Zap size={22} />
          </div>
          <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Dynamic Variables & Logic</h3>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Current date/time formatting, fill-in forms, caret placement, bounded safe math formulas, and nested snippets.
          </p>
        </div>
      </div>
    </div>
  );
};
