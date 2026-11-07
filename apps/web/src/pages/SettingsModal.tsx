import { confirmDialog, alertDialog } from '../components/Dialogs.js';
import React, { useState, useEffect } from 'react';
import { api } from '../api.js';
import { UserPreferences, DEFAULT_PREFERENCES } from '@snaptype/shared';
import { X, Check } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const [prefs, setPrefs] = useState<UserPreferences>({ ...DEFAULT_PREFERENCES });
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [newDomain, setNewDomain] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadPrefs();
    }
  }, [isOpen]);

  const loadPrefs = async () => {
    setLoading(true);
    try {
      const res = await api.getPreferences();
      setPrefs(res.preferences);
    } catch (err) {
      console.error('Failed to load preferences', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      await api.updatePreferences(prefs);
      setSaved(true);
      setTimeout(() => {
        setSaved(false);
        onClose();
      }, 1000);
    } catch (err) {
      void alertDialog('Failed to save settings');
    } finally {
      setLoading(false);
    }
  };

  const handleAddDomain = () => {
    const d = newDomain.toLowerCase().trim();
    if (!d || prefs.excludedDomains.includes(d)) return;
    setPrefs({ ...prefs, excludedDomains: [...prefs.excludedDomains, d] });
    setNewDomain('');
  };

  const handleRemoveDomain = (domain: string) => {
    setPrefs({ ...prefs, excludedDomains: prefs.excludedDomains.filter((d) => d !== domain) });
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.4)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        width: 'min(520px, calc(100vw - 24px))',
        maxHeight: '90vh',
        overflowY: 'auto',
        padding: 28,
        position: 'relative'
      }}>
        <button
          onClick={onClose}
          style={{ position: 'absolute', top: 18, right: 18, background: 'none', border: 'none', cursor: 'pointer' }}
        >
          <X size={18} />
        </button>

        <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 18 }}>Extension & Platform Settings</h3>

        {/* Trigger mode */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
            Shortcut Trigger Mode
          </label>
          <select
            className="input"
            value={prefs.triggerMode}
            onChange={(e) => setPrefs({ ...prefs, triggerMode: e.target.value as any })}
          >
            <option value="immediate">Immediate (expands as soon as shortcut is typed)</option>
            <option value="space">After Space / Tab (expands after pressing spacebar)</option>
            <option value="delimiter">Delimiter prefix only (e.g. /shortcut)</option>
            <option value="manual">Manual only (via assistant hotkey or popup)</option>
          </select>
        </div>

        {/* Assistant Shortcut */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
            Keyboard Assistant Hotkey
          </label>
          <input
            type="text"
            className="input input-mono"
            value={prefs.assistantShortcut}
            onChange={(e) => setPrefs({ ...prefs, assistantShortcut: e.target.value })}
            placeholder="Ctrl+Shift+Space"
          />
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Opens quick search assistant on any webpage to insert snippets without remembering shortcuts.
          </span>
        </div>

        {/* Case sensitivity */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={prefs.caseSensitive}
              onChange={(e) => setPrefs({ ...prefs, caseSensitive: e.target.checked })}
            />
            Case-sensitive shortcut matching
          </label>
        </div>

        {/* Sensitive field exclusion */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={prefs.disabledInSensitiveFields}
              onChange={(e) => setPrefs({ ...prefs, disabledInSensitiveFields: e.target.checked })}
            />
            Strict security: Disable expansion in password and sensitive credit-card inputs
          </label>
        </div>

        {/* Excluded Domains */}
        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
            Excluded Website Domains
          </label>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <input
              type="text"
              className="input input-mono"
              placeholder="e.g. internal.bank.com"
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddDomain()}
            />
            <button className="btn btn-secondary btn-sm" type="button" onClick={handleAddDomain}>
              Add
            </button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {prefs.excludedDomains.map((domain) => (
              <span key={domain} className="badge badge-mono" style={{ padding: '4px 8px' }}>
                {domain}
                <button
                  style={{ background: 'none', border: 'none', marginLeft: 6, cursor: 'pointer', color: 'var(--text-secondary)' }}
                  onClick={() => handleRemoveDomain(domain)}
                >
                  &times;
                </button>
              </span>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={loading}>
            {saved ? <><Check size={14} /> Saved!</> : 'Save Preferences'}
          </button>
        </div>
      </div>
    </div>
  );
};

