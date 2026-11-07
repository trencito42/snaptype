import React, { useMemo, useRef, useState, useEffect } from 'react';
import { ReverseShortcutMatcher, renderSnippet, extractFormFields } from '@snaptype/snippet-engine';
import type { Snippet, DynamicFormField } from '@snaptype/shared';
import { ArrowRight, FolderTree, RefreshCw, Users, Braces } from 'lucide-react';
import { LogoMark } from '../components/Logo.js';
import './landing.css';

interface LandingPageProps {
  onOpenAuth: () => void;
  onNavigate: (view: string) => void;
}

const stamp = '2026-01-01T00:00:00.000Z';
function demoSnippet(id: string, name: string, shortcut: string, plainContent: string): Snippet {
  return {
    id, workspaceId: 'demo', folderId: null, name, shortcut, plainContent,
    tags: [], isFavorite: false, isEnabled: true, version: 1, usageCount: 0,
    createdAt: stamp, updatedAt: stamp
  } as Snippet;
}

/** These are rendered by the SAME engine the extension uses. */
const DEMO_SNIPPETS: Snippet[] = [
  demoSnippet('d1', 'Order delay apology', '/late',
    'Hi {{input:customer|label=Customer name|default=there}},\n\nI am sorry your order is late. I checked with our warehouse and it will ship within {{dropdown:days|label=Ships within|options=1 business day,2 business days,3 business days}}.\n\nIf anything changes, I will let you know right away.\n\n{{cursor}}'),
  demoSnippet('d2', 'Thanks + close', '/thx',
    'Thanks for getting in touch. If there is anything else I can help with, just reply to this message.'),
  demoSnippet('d3', 'Request details', '/info',
    'To look into this, could you please send me your order number and the email address used at checkout?')
];

const EXAMPLES = ['/late', '/thx', '/info'];

export const LandingPage: React.FC<LandingPageProps> = ({ onOpenAuth, onNavigate }) => {
  const matcher = useMemo(() => new ReverseShortcutMatcher(DEMO_SNIPPETS, false), []);
  const [text, setText] = useState('');
  const [form, setForm] = useState<{ snippet: Snippet; fields: DynamicFormField[]; matchLength: number } | null>(null);
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const expand = (before: string, snippet: Snippet, matchLength: number, vars?: Record<string, string | boolean>) => {
    const out = renderSnippet(snippet.plainContent, { variables: vars });
    const prefix = before.slice(0, before.length - matchLength);
    const next = prefix + out.text;
    setText(next);
    const caret = out.cursorOffset >= 0 ? prefix.length + out.cursorOffset : next.length;
    requestAnimationFrame(() => {
      const el = areaRef.current;
      if (el) { el.focus(); el.setSelectionRange(caret, caret); }
    });
  };

  const onChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    const match = matcher.findMatch(val, {
      triggerMode: 'immediate', delimiterChar: '/', caseSensitive: false,
      assistantShortcut: 'Ctrl+Shift+Space', excludedDomains: [], disabledInSensitiveFields: true
    } as any);
    if (!match) { setText(val); return; }
    const fields = extractFormFields(match.snippet.plainContent);
    if (fields.length) {
      const defaults: Record<string, string | boolean> = {};
      for (const f of fields) defaults[f.name] = f.type === 'dropdown' ? (f.options?.[0] ?? '') : (f.defaultValue ?? '');
      setText(val);
      setValues(defaults);
      setForm({ snippet: match.snippet, fields, matchLength: match.matchLength });
    } else {
      expand(val, match.snippet, match.matchLength);
    }
  };

  const submitForm = () => {
    if (!form) return;
    expand(text, form.snippet, form.matchLength, values);
    setForm(null);
  };
  const cancelForm = () => { setForm(null); areaRef.current?.focus(); };

  useEffect(() => { dialogRef.current?.querySelector<HTMLElement>('input,select')?.focus(); }, [form]);

  const insertExample = (s: string) => {
    setText(''); setForm(null);
    const el = areaRef.current;
    if (el) { el.focus(); }
    // Feed the shortcut through the same path real typing uses.
    onChange({ target: { value: s } } as React.ChangeEvent<HTMLTextAreaElement>);
  };

  return (
    <div className="lp">
      <section className="lp-hero">
        <p className="lp-eyebrow"><LogoMark size={18} /> Text expansion for browsers</p>
        <h1>Type a short code.<br />Send the whole reply.</h1>
        <p className="lp-lede">
          SnapType turns shortcuts like <code>/late</code> into complete, consistent messages in any web text field.
          Keep your snippets in one place and use them in Chrome and Firefox.
        </p>
        <div className="lp-cta">
          <button className="lp-btn lp-btn-primary" onClick={onOpenAuth}>Create an account <ArrowRight size={18} aria-hidden="true" /></button>
          <button className="lp-btn" onClick={() => onNavigate('install')}>Install the extension</button>
        </div>
        <p className="lp-note">Chrome / Chromium and Firefox. Store listings are not published yet — see install steps.</p>
      </section>

      <section className="lp-demo" aria-labelledby="demo-h">
        <div className="lp-demo-head">
          <h2 id="demo-h">Try it here — nothing to install</h2>
          <p>Type a shortcut, or press one below. This runs the same expansion engine as the extension.</p>
          <div className="lp-chips" role="group" aria-label="Example shortcuts">
            {EXAMPLES.map((s) => (
              <button key={s} className="lp-chip" onClick={() => insertExample(s)}>{s}</button>
            ))}
          </div>
        </div>
        <label htmlFor="demo-area" className="lp-sr">Demo message field</label>
        <textarea
          id="demo-area" ref={areaRef} className="lp-area" rows={9}
          placeholder="Reply to customer… try typing /thx"
          value={text} onChange={onChange}
        />
        <div className="lp-demo-foot">
          <span>Undo with Ctrl+Z is not available in this demo.</span>
          {text && <button className="lp-link" onClick={() => setText('')}>Clear</button>}
        </div>

        {form && (
          <div className="lp-overlay" onKeyDown={(e) => { if (e.key === 'Escape') cancelForm(); }}>
            <div className="lp-dialog" role="dialog" aria-modal="true" aria-labelledby="form-h" ref={dialogRef}>
              <h3 id="form-h">{form.snippet.name}</h3>
              <p>Fill in the details for this reply.</p>
              {form.fields.map((f) => (
                <div className="lp-field" key={f.name}>
                  <label htmlFor={`f-${f.name}`}>{f.label}</label>
                  {f.type === 'dropdown' ? (
                    <select id={`f-${f.name}`} value={String(values[f.name] ?? '')}
                      onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}>
                      {(f.options ?? []).map((o) => <option key={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input id={`f-${f.name}`} type="text" value={String(values[f.name] ?? '')}
                      onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}
                      onKeyDown={(e) => { if (e.key === 'Enter') submitForm(); }} />
                  )}
                </div>
              ))}
              <div className="lp-dialog-actions">
                <button className="lp-btn" onClick={cancelForm}>Cancel</button>
                <button className="lp-btn lp-btn-primary" onClick={submitForm}>Insert</button>
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="lp-steps" aria-labelledby="how-h">
        <h2 id="how-h">Up and running in four steps</h2>
        <ol>
          <li><strong>Create an account.</strong> Sign in with a one-time code sent to your email — no password.</li>
          <li><strong>Install the extension</strong> for Chrome or Firefox and sign in.</li>
          <li><strong>Write a snippet</strong> in the dashboard and give it a shortcut.</li>
          <li><strong>Type the shortcut</strong> in any text field. It expands in place.</li>
        </ol>
      </section>

      <section className="lp-features" aria-labelledby="feat-h">
        <h2 id="feat-h">What you get</h2>
        <ul>
          <li><Braces aria-hidden="true" /><div><h3>Dynamic snippets</h3><p>Fill-in fields, dropdowns, dates, clipboard, cursor placement, conditions and simple formulas.</p></div></li>
          <li><FolderTree aria-hidden="true" /><div><h3>Organised library</h3><p>Folders, tags, search, favourites and per-site restrictions. Import and export your snippets.</p></div></li>
          <li><RefreshCw aria-hidden="true" /><div><h3>Synced across browsers</h3><p>Snippets live in your account and are fetched by the extension when you sign in.</p></div></li>
          <li><Users aria-hidden="true" /><div><h3>Shared workspaces</h3><p>Invite teammates as owner, admin, editor or viewer so a team can share one library.</p></div></li>
        </ul>
      </section>

      <section className="lp-trust" aria-labelledby="trust-h">
        <h2 id="trust-h">How your data is handled</h2>
        <p>
          Snippets are stored on the SnapType server so they can sync, and the extension talks to that server over the network.
          Matching of what you type happens locally in your browser; keystrokes are not sent to the server.
          The extension skips password fields and other sensitive inputs. Read the full <button className="lp-link" onClick={() => onNavigate('privacy')}>privacy policy</button>.
        </p>
      </section>

      <section className="lp-final">
        <h2>Write it once. Reuse it everywhere.</h2>
        <button className="lp-btn lp-btn-primary" onClick={onOpenAuth}>Create an account <ArrowRight size={18} aria-hidden="true" /></button>
      </section>
    </div>
  );
};
