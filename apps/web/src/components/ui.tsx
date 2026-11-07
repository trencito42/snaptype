import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheck, faChevronDown } from '@fortawesome/free-solid-svg-icons';
import { comboFromEvent, RESERVED_COMBOS } from '../utils/hotkey.js';
import './ui.css';

/* ───────── Select (custom listbox, fully keyboard accessible) ───────── */

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  hint?: string;
}

interface SelectProps<T extends string = string> {
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  id?: string;
  ariaLabel?: string;
  placeholder?: string;
  disabled?: boolean;
  size?: 'md' | 'sm';
  className?: string;
  style?: React.CSSProperties;
}

export function Select<T extends string = string>({
  value, options, onChange, id, ariaLabel, placeholder = 'Select…', disabled, size = 'md', className = '', style
}: SelectProps<T>) {
  const uid = useId();
  const listId = `${uid}-list`;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [rect, setRect] = useState<{ left: number; top: number; width: number; maxHeight: number; up: boolean } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typeahead = useRef({ text: '', t: 0 });

  const selectedIndex = useMemo(() => options.findIndex((o) => o.value === value), [options, value]);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null;

  const place = useCallback(() => {
    const b = btnRef.current?.getBoundingClientRect();
    if (!b) return;
    const below = window.innerHeight - b.bottom - 12;
    const above = b.top - 12;
    const up = below < 180 && above > below;
    setRect({ left: b.left, top: up ? b.top - 6 : b.bottom + 6, width: b.width, maxHeight: Math.max(120, Math.min(320, up ? above : below)), up });
  }, []);

  const openList = () => {
    if (disabled) return;
    setActive(selectedIndex >= 0 ? selectedIndex : 0);
    place();
    setOpen(true);
  };
  const close = (refocus = true) => { setOpen(false); if (refocus) btnRef.current?.focus(); };
  const choose = (i: number) => { const o = options[i]; if (o) onChange(o.value); close(); };

  useLayoutEffect(() => { if (open) place(); }, [open, place]);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || listRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onScroll = (e: Event) => { if (!listRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', onScroll, true);
    return () => { document.removeEventListener('mousedown', onDoc); window.removeEventListener('resize', place); window.removeEventListener('scroll', onScroll, true); };
  }, [open, place]);
  useEffect(() => { if (open) listRef.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' }); }, [open, active]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); openList(); }
      return;
    }
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); setActive((a) => Math.min(options.length - 1, a + 1)); break;
      case 'ArrowUp': e.preventDefault(); setActive((a) => Math.max(0, a - 1)); break;
      case 'Home': e.preventDefault(); setActive(0); break;
      case 'End': e.preventDefault(); setActive(options.length - 1); break;
      case 'Enter': case ' ': e.preventDefault(); choose(active); break;
      case 'Escape': e.preventDefault(); e.stopPropagation(); close(); break;
      case 'Tab': setOpen(false); break;
      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
          const now = Date.now();
          const ta = typeahead.current;
          ta.text = now - ta.t > 700 ? e.key.toLowerCase() : ta.text + e.key.toLowerCase();
          ta.t = now;
          const idx = options.findIndex((o) => o.label.toLowerCase().startsWith(ta.text));
          if (idx >= 0) setActive(idx);
        }
    }
  };

  return (
    <>
      <button
        ref={btnRef}
        id={id}
        type="button"
        className={`ui-select ui-select-${size} ${open ? 'is-open' : ''} ${className}`}
        style={style}
        disabled={disabled}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        aria-activedescendant={open ? `${uid}-opt-${active}` : undefined}
        onClick={() => (open ? close(false) : openList())}
        onKeyDown={onKeyDown}
      >
        <span className={selected ? 'ui-select-value' : 'ui-select-value ui-placeholder'}>{selected ? selected.label : placeholder}</span>
        <FontAwesomeIcon icon={faChevronDown} className="ui-select-caret" aria-hidden="true" />
      </button>
      {open && rect && createPortal(
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          className="ui-listbox"
          style={{ left: rect.left, width: Math.max(rect.width, 160), maxHeight: rect.maxHeight, ...(rect.up ? { bottom: window.innerHeight - rect.top } : { top: rect.top }) }}
          onKeyDown={onKeyDown}
        >
          {options.map((o, i) => (
            <li
              key={o.value}
              id={`${uid}-opt-${i}`}
              data-i={i}
              role="option"
              aria-selected={o.value === value}
              className={`ui-option ${i === active ? 'is-active' : ''} ${o.value === value ? 'is-selected' : ''}`}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(i)}
            >
              <span className="ui-option-text">
                <span>{o.label}</span>
                {o.hint && <small>{o.hint}</small>}
              </span>
              {o.value === value && <FontAwesomeIcon icon={faCheck} aria-hidden="true" />}
            </li>
          ))}
        </ul>,
        document.body
      )}
    </>
  );
}

/* ───────── Switch (accessible toggle) ───────── */

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: React.ReactNode;
  description?: React.ReactNode;
  disabled?: boolean;
}

export const Switch: React.FC<SwitchProps> = ({ checked, onChange, label, description, disabled }) => {
  const uid = useId();
  return (
    <div className="ui-switch-row">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${uid}-l`}
        aria-describedby={description ? `${uid}-d` : undefined}
        disabled={disabled}
        className={`ui-switch ${checked ? 'is-on' : ''}`}
        onClick={() => onChange(!checked)}
      >
        <span className="ui-switch-knob" />
      </button>
      <span className="ui-switch-text">
        <span id={`${uid}-l`} className="ui-switch-label" onClick={() => !disabled && onChange(!checked)}>{label}</span>
        {description && <span id={`${uid}-d`} className="ui-switch-desc">{description}</span>}
      </span>
    </div>
  );
};

/* ───────── File picker (replaces the native file input look) ───────── */

interface FilePickerProps {
  accept?: string;
  onFile: (file: File) => void;
  label?: string;
}

export const FilePicker: React.FC<FilePickerProps> = ({ accept, onFile, label = 'Choose file' }) => {
  const ref = useRef<HTMLInputElement>(null);
  const [name, setName] = useState<string>('');
  return (
    <span className="ui-file">
      <input
        ref={ref}
        type="file"
        accept={accept}
        tabIndex={-1}
        aria-hidden="true"
        className="ui-file-input"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) { setName(f.name); onFile(f); } e.target.value = ''; }}
      />
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => ref.current?.click()}>{label}</button>
      {name && <span className="ui-file-name" title={name}>{name}</span>}
    </span>
  );
};

/* ───────── Hotkey recorder (captures a key combination, never typed as text) ───────── */

interface HotkeyRecorderProps {
  value: string;
  onChange: (value: string) => void;
  defaultValue?: string;
  ariaLabel?: string;
}

export const HotkeyRecorder: React.FC<HotkeyRecorderProps> = ({ value, onChange, defaultValue = 'Ctrl+Shift+Space', ariaLabel = 'Keyboard shortcut' }) => {
  const [recording, setRecording] = useState(false);
  const [live, setLive] = useState('');
  const [hint, setHint] = useState<string | null>(null);
  const ref = useRef<HTMLButtonElement>(null);
  const hintId = useId();

  const stop = () => { setRecording(false); setLive(''); };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!recording) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setHint(null); setRecording(true); }
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape') { stop(); setHint(null); return; }
    const { combo, complete } = comboFromEvent(e.nativeEvent);
    if (!complete) { setLive(combo); return; }
    const hasStrongModifier = e.ctrlKey || e.altKey || e.metaKey;
    if (!hasStrongModifier) { setHint('Include Ctrl, Alt or Cmd so normal typing never triggers it.'); setLive(combo); return; }
    if (RESERVED_COMBOS.has(combo)) { setHint(`${combo} is used by the browser. Choose another combination.`); setLive(combo); return; }
    setHint(null);
    onChange(combo);
    stop();
  };

  const parts = (recording ? live : value).split('+').filter(Boolean);
  return (
    <div className="ui-hotkey-wrap">
      <button
        ref={ref}
        type="button"
        className={`ui-hotkey ${recording ? 'is-recording' : ''}`}
        aria-label={`${ariaLabel}: ${value}. Press Enter to record a new one.`}
        aria-describedby={hint ? hintId : undefined}
        onClick={() => { setHint(null); setRecording(true); setLive(''); ref.current?.focus(); }}
        onKeyDown={onKeyDown}
        onBlur={stop}
      >
        {parts.length === 0 && <span className="ui-hotkey-empty">{recording ? 'Press your shortcut…' : 'Click to record'}</span>}
        {parts.map((p, i) => <kbd key={i}>{p === 'Meta' ? 'Cmd' : p}</kbd>)}
        {recording && parts.length > 0 && <span className="ui-hotkey-empty">…</span>}
      </button>
      <button type="button" className="ui-hotkey-reset" onClick={() => { setHint(null); onChange(defaultValue); }} disabled={value === defaultValue}>Reset</button>
      {hint && <p id={hintId} role="alert" className="ui-hotkey-hint">{hint}</p>}
    </div>
  );
};
