import React, { useEffect, useRef, useState } from 'react';

type DialogRequest =
  | { kind: 'confirm'; message: string; confirmLabel: string; danger: boolean; resolve: (v: boolean) => void }
  | { kind: 'alert'; message: string; resolve: () => void };

let enqueue: ((r: DialogRequest) => void) | null = null;

/** In-app replacement for window.confirm: resolves true on confirm, false on cancel/Escape. */
export function confirmDialog(message: string, opts: { confirmLabel?: string; danger?: boolean } = {}): Promise<boolean> {
  return new Promise((resolve) => {
    if (!enqueue) { resolve(false); return; } // host not mounted: fail safe (never confirm destructive actions implicitly)
    enqueue({ kind: 'confirm', message, confirmLabel: opts.confirmLabel ?? 'Confirm', danger: opts.danger ?? false, resolve });
  });
}

/** In-app replacement for window.alert. */
export function alertDialog(message: string): Promise<void> {
  return new Promise((resolve) => {
    if (!enqueue) { resolve(); return; }
    enqueue({ kind: 'alert', message, resolve });
  });
}

export const DialogHost: React.FC = () => {
  const [queue, setQueue] = useState<DialogRequest[]>([]);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const current = queue[0];

  useEffect(() => {
    enqueue = (r) => setQueue((q) => [...q, r]);
    return () => { enqueue = null; };
  }, []);

  useEffect(() => { if (current) primaryRef.current?.focus(); }, [current]);

  if (!current) return null;

  const close = (value: boolean) => {
    if (current.kind === 'confirm') current.resolve(value); else current.resolve();
    setQueue((q) => q.slice(1));
  };

  return (
    <div
      role="presentation"
      onKeyDown={(e) => { if (e.key === 'Escape') close(false); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(16,17,16,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 1000 }}
    >
      <div
        role={current.kind === 'confirm' ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-describedby="app-dialog-msg"
        style={{ background: 'var(--surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', padding: 20, width: 'min(420px, 100%)' }}
      >
        <p id="app-dialog-msg" style={{ fontSize: 15, lineHeight: 1.5, marginBottom: 18, whiteSpace: 'pre-wrap' }}>{current.message}</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          {current.kind === 'confirm' && (
            <button className="btn btn-secondary" onClick={() => close(false)}>Cancel</button>
          )}
          <button
            ref={primaryRef}
            className={current.kind === 'confirm' && current.danger ? 'btn btn-danger' : 'btn btn-primary'}
            onClick={() => close(true)}
          >
            {current.kind === 'confirm' ? current.confirmLabel : 'OK'}
          </button>
        </div>
      </div>
    </div>
  );
};
