import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ReverseShortcutMatcher, renderSnippet, extractFormFields } from '@snaptype/snippet-engine';
import type { Snippet, DynamicFormField } from '@snaptype/shared';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowRight, faWandMagicSparkles, faFolderTree, faRotate, faUserGroup, faShieldHalved,
  faKeyboard, faCircleCheck, faPuzzlePiece
} from '@fortawesome/free-solid-svg-icons';
import { faChrome, faFirefoxBrowser } from '@fortawesome/free-brands-svg-icons';
import { Select } from '../components/ui.js';
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

/** Rendered by the SAME engine the extension uses. */
const DEMO_SNIPPETS: Snippet[] = [
  demoSnippet('d1', 'Order delay apology', '/late',
    'Hi {{input:customer|label=Customer name|default=there}},\n\nI am sorry your order is late. I checked with our warehouse and it will ship within {{dropdown:days|label=Ships within|options=1 business day,2 business days,3 business days}}.\n\nIf anything changes, I will let you know right away.\n\n{{cursor}}'),
  demoSnippet('d2', 'Thanks + close', '/thx',
    'Thanks for getting in touch. If there is anything else I can help with, just reply to this message.'),
  demoSnippet('d3', 'Request details', '/info',
    'To look into this, could you please send me your order number and the email address used at checkout?')
];
const EXAMPLES = ['/late', '/thx', '/info'];

/** Command tiles: the output shown is computed live by the real renderer, not typed by hand. */
const COMMAND_TILES: { code: string; note: string }[] = [
  { code: '{{date}}', note: 'Today' },
  { code: '{{date:+7d}}', note: 'A week from now' },
  { code: '{{time}}', note: 'Current time' },
  { code: '{{clipboard}}', note: 'Whatever you copied' },
  { code: '{{selection}}', note: 'Text you highlighted' },
  { code: '{{calc: 19.99 * 3}}', note: 'Arithmetic' },
  { code: '{{#if vip}}Priority{{else}}Standard{{/if}}', note: 'Conditions' },
  { code: '{{include:signature}}', note: 'Reuse another snippet' },
  { code: '{{table:customers|lookup=email|value=ana@example.com|column=name}}', note: 'Data Table lookup' },
  { code: '{{site:hostname}}', note: 'The site you are on' }
];

function useTileOutputs() {
  return useMemo(() => {
    const ctx = {
      variables: { vip: true },
      clipboardText: 'ORDER-4821',
      selectedText: 'late delivery',
      siteContext: { hostname: 'help.example.com', url: 'https://help.example.com/tickets/4821' },
      snippetResolver: (s: string) => (s === 'signature' ? 'Kind regards, Support Team' : null),
      tableResolver: (t: string, _k: string, v: string, col: string) => (t === 'customers' && v === 'ana@example.com' && col === 'name' ? 'Ana Pop' : null)
    };
    return COMMAND_TILES.map((t) => {
      const out = renderSnippet(t.code, ctx);
      return { ...t, out: (out.errors && out.errors.length) ? '—' : out.text };
    });
  }, []);
}

const BENEFITS = [
  { icon: faWandMagicSparkles, title: 'Dynamic snippets', body: 'Fill-in fields, dropdowns, dates, clipboard, conditions and simple formulas, so one snippet fits many replies.' },
  { icon: faFolderTree, title: 'Organised library', body: 'Folders, tags, search, favourites and per-site rules. Import and export whenever you need.' },
  { icon: faRotate, title: 'Synced across browsers', body: 'Snippets live in your account and are fetched by the extension when you sign in.' },
  { icon: faUserGroup, title: 'Shared workspaces', body: 'Invite teammates as owner, admin, editor or viewer and keep one library for the whole team.' }
];

const STEPS = [
  { n: '01', title: 'Create an account', body: 'Sign in with a one-time code sent to your email. No password to remember.' },
  { n: '02', title: 'Install the extension', body: 'Add SnapType to Chrome or Firefox and sign in once.' },
  { n: '03', title: 'Write a snippet', body: 'Give it a name and a short shortcut in the dashboard.' },
  { n: '04', title: 'Type the shortcut', body: 'In any text field the shortcut turns into the full text.' }
];

export const LandingPage: React.FC<LandingPageProps> = ({ onOpenAuth, onNavigate }) => {
  const matcher = useMemo(() => new ReverseShortcutMatcher(DEMO_SNIPPETS, false), []);
  const tiles = useTileOutputs();
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

  const onChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => handleValue(e.target.value);
  const handleValue = (val: string) => {
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

  const submitForm = () => { if (!form) return; expand(text, form.snippet, form.matchLength, values); setForm(null); };
  const cancelForm = () => { setForm(null); areaRef.current?.focus(); };
  useEffect(() => { dialogRef.current?.querySelector<HTMLElement>('input,select')?.focus(); }, [form]);
  const insertExample = (s: string) => { setText(''); setForm(null); handleValue(s); };

  return (
    <div className="lp">
      <section className="lp-hero">
        <p className="lp-eyebrow"><FontAwesomeIcon icon={faKeyboard} aria-hidden="true" /> Text expansion for your browser</p>
        <h1>Type a short code.<br />Send the whole reply.</h1>
        <p className="lp-lede">
          SnapType turns shortcuts like <code>/late</code> into complete, consistent messages in any web text field,
          in Chrome and Firefox.
        </p>
        <div className="lp-cta">
          <button className="pill pill-lime pill-lg" onClick={onOpenAuth}>Create an account <FontAwesomeIcon icon={faArrowRight} aria-hidden="true" /></button>
          <button className="pill pill-white pill-lg" onClick={() => onNavigate('install')}>Install the extension</button>
        </div>
        <p className="lp-note">Chrome, Edge, Brave and Firefox. Store listings are not published yet, see the install steps.</p>
      </section>

      <section className="lp-stage" aria-labelledby="demo-h">
        <div className="lp-float lp-float-1" aria-hidden="true">{'{{date}}'}</div>
        <div className="lp-float lp-float-2" aria-hidden="true">{'{{cursor}}'}</div>
        <div className="lp-device">
          <div className="lp-device-bar">
            <span className="lp-dots" aria-hidden="true"><i /><i /><i /></span>
            <h2 id="demo-h">Try it here. Nothing to install.</h2>
          </div>
          <div className="lp-device-body">
            <div className="lp-chips" role="group" aria-label="Example shortcuts">
              <span className="lp-chip-label">Type or tap:</span>
              {EXAMPLES.map((s) => (
                <button key={s} className="lp-chip" onClick={() => insertExample(s)}>{s}</button>
              ))}
            </div>
            <label htmlFor="demo-area" className="lp-sr">Demo message field</label>
            <textarea
              id="demo-area" ref={areaRef} className="lp-area" rows={9}
              placeholder="Reply to customer… try typing /thx"
              value={text} onChange={onChange}
            />
            <div className="lp-device-foot">
              <span>Runs the same engine as the extension.</span>
              {text && <button className="lp-link" onClick={() => setText('')}>Clear</button>}
            </div>
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
                      <Select id={`f-${f.name}`} ariaLabel={f.label} value={String(values[f.name] ?? '')}
                        onChange={(v) => setValues({ ...values, [f.name]: v })}
                        options={(f.options ?? []).map((o) => ({ value: o, label: o }))} />
                    ) : (
                      <input id={`f-${f.name}`} type="text" value={String(values[f.name] ?? '')}
                        onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}
                        onKeyDown={(e) => { if (e.key === 'Enter') submitForm(); }} />
                    )}
                  </div>
                ))}
                <div className="lp-dialog-actions">
                  <button className="pill pill-white" onClick={cancelForm}>Cancel</button>
                  <button className="pill pill-lime" onClick={submitForm}>Insert</button>
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="lp-float lp-float-3" aria-hidden="true">{'{{calc: 19.99 * 3}}'}</div>
      </section>

      <section className="lp-split" aria-labelledby="ben-h">
        <div className="lp-split-lead">
          <p className="lp-kicker">Benefits</p>
          <h2 id="ben-h">Everything a support team reuses, in one place.</h2>
          <p>Write each answer once, keep it up to date, and let everyone send it with a few keystrokes.</p>
          <button className="pill pill-lime" onClick={onOpenAuth}>Get started</button>
        </div>
        <ul className="lp-cards">
          {BENEFITS.map((b) => (
            <li key={b.title} className="lp-card">
              <span className="lp-icon"><FontAwesomeIcon icon={b.icon} aria-hidden="true" /></span>
              <h3>{b.title}</h3>
              <p>{b.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="lp-block" aria-labelledby="cmd-h">
        <p className="lp-kicker">Commands</p>
        <h2 id="cmd-h">Snippets that adapt to the moment.</h2>
        <p className="lp-sub">Each result below is produced live by the real renderer.</p>
        <ul className="lp-tiles">
          {tiles.map((t) => (
            <li key={t.code} className="lp-tile">
              <code>{t.code}</code>
              <span className="lp-tile-out">{t.out}</span>
              <span className="lp-tile-note">{t.note}</span>
            </li>
          ))}
          <li className="lp-tile lp-tile-form">
            <code>{'{{form:name}}'}</code>
            <span className="lp-tile-out">Opens a small fill-in form</span>
            <span className="lp-tile-note">Text, paragraph, dropdown, toggle, date</span>
          </li>
        </ul>
      </section>

      <section className="lp-block" aria-labelledby="how-h">
        <p className="lp-kicker">How it works</p>
        <h2 id="how-h">Up and running in four steps.</h2>
        <ol className="lp-steps">
          {STEPS.map((s) => (
            <li key={s.n}><span className="lp-step-n">{s.n}</span><h3>{s.title}</h3><p>{s.body}</p></li>
          ))}
        </ol>
      </section>

      <section className="lp-block" aria-labelledby="br-h">
        <p className="lp-kicker">Browsers</p>
        <h2 id="br-h">Chrome and Firefox.</h2>
        <div className="lp-browsers">
          <article className="lp-card lp-browser">
            <FontAwesomeIcon icon={faChrome} className="lp-browser-icon" aria-hidden="true" />
            <h3>Chrome, Edge, Brave</h3>
            <p>Manifest V3 extension. Not in the Chrome Web Store yet.</p>
            <button className="pill pill-white" onClick={() => onNavigate('install')}>Install steps</button>
          </article>
          <article className="lp-card lp-browser">
            <FontAwesomeIcon icon={faFirefoxBrowser} className="lp-browser-icon" aria-hidden="true" />
            <h3>Firefox</h3>
            <p>Manifest V3 add-on. Not on Mozilla Add-ons yet.</p>
            <button className="pill pill-white" onClick={() => onNavigate('install')}>Install steps</button>
          </article>
        </div>
      </section>

      <section className="lp-trust" aria-labelledby="trust-h">
        <span className="lp-icon lp-icon-lg"><FontAwesomeIcon icon={faShieldHalved} aria-hidden="true" /></span>
        <div>
          <h2 id="trust-h">How your data is handled</h2>
          <ul>
            <li><FontAwesomeIcon icon={faCircleCheck} aria-hidden="true" /> Snippets are stored on the SnapType server so they can sync to your browsers.</li>
            <li><FontAwesomeIcon icon={faCircleCheck} aria-hidden="true" /> Matching of what you type happens locally. Keystrokes are not sent to the server.</li>
            <li><FontAwesomeIcon icon={faCircleCheck} aria-hidden="true" /> Password fields and other sensitive inputs are skipped.</li>
          </ul>
          <button className="lp-link" onClick={() => onNavigate('privacy')}>Read the privacy policy</button>
        </div>
      </section>

      <section className="lp-final">
        <FontAwesomeIcon icon={faPuzzlePiece} aria-hidden="true" className="lp-final-icon" />
        <h2>Write it once. Reuse it everywhere.</h2>
        <button className="pill pill-dark pill-lg" onClick={onOpenAuth}>Create an account <FontAwesomeIcon icon={faArrowRight} aria-hidden="true" /></button>
      </section>
    </div>
  );
};
