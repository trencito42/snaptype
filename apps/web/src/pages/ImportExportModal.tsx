import React, { useState } from 'react';
import { api } from '../api.js';
import { X, Download, Upload, Check, AlertCircle } from 'lucide-react';

interface ImportExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const ImportExportModal: React.FC<ImportExportModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [activeTab, setActiveTab] = useState<'export' | 'import'>('export');
  const [importFormat, setImportFormat] = useState<'snaptype_json' | 'textblaze_json' | 'csv'>('snaptype_json');
  const [conflictStrategy, setConflictStrategy] = useState<'duplicate' | 'overwrite' | 'skip'>('duplicate');
  const [importText, setImportText] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleExport = async () => {
    try {
      const data = await api.exportWorkspace();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `snaptype-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.message || 'Export failed');
    }
  };

  const handleImport = async () => {
    if (!importText.trim()) {
      setError('Please provide snippets data to import');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      let parsedSnippets: any[] = [];

      if (importFormat === 'csv') {
        // Parse CSV lines
        const lines = importText.split('\n').map((l) => l.trim()).filter(Boolean);
        for (let i = 1; i < lines.length; i++) {
          const parts = lines[i].split(',').map((p) => p.trim());
          if (parts.length >= 3) {
            parsedSnippets.push({
              name: parts[0],
              shortcut: parts[1],
              plainContent: parts[2].replace(/\\n/g, '\n'),
              tags: parts[3] ? parts[3].split(';') : []
            });
          }
        }
      } else {
        // JSON parsing
        const parsed = JSON.parse(importText);
        parsedSnippets = Array.isArray(parsed) ? parsed : parsed.snippets || [];
      }

      const res = await api.importSnippets({
        snippets: parsedSnippets,
        format: importFormat,
        conflictStrategy
      });

      setResult(res);
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Import failed. Check JSON or CSV format.');
    } finally {
      setLoading(false);
    }
  };

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
        width: 540,
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

        <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 14 }}>Library Transfer & Migration</h3>

        <div style={{ display: 'flex', gap: 10, borderBottom: '1px solid var(--border)', paddingBottom: 10, marginBottom: 20 }}>
          <button
            className="btn btn-ghost btn-sm"
            style={{ fontWeight: activeTab === 'export' ? 700 : 500, backgroundColor: activeTab === 'export' ? 'var(--surface-subtle)' : 'transparent' }}
            onClick={() => setActiveTab('export')}
          >
            <Download size={15} /> Export Library
          </button>
          <button
            className="btn btn-ghost btn-sm"
            style={{ fontWeight: activeTab === 'import' ? 700 : 500, backgroundColor: activeTab === 'import' ? 'var(--surface-subtle)' : 'transparent' }}
            onClick={() => setActiveTab('import')}
          >
            <Upload size={15} /> Import / Migrate
          </button>
        </div>

        {activeTab === 'export' ? (
          <div>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 20 }}>
              Download a complete JSON backup of your snippets, organized folders, and tag taxonomies.
            </p>
            <button className="btn btn-primary" onClick={handleExport}>
              <Download size={16} /> Download SnapType JSON Backup
            </button>
          </div>
        ) : (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                  Source Format
                </label>
                <select
                  className="input"
                  value={importFormat}
                  onChange={(e) => setImportFormat(e.target.value as any)}
                >
                  <option value="snaptype_json">SnapType JSON</option>
                  <option value="textblaze_json">Text Blaze Migration (JSON)</option>
                  <option value="csv">CSV (Name, Shortcut, Content, Tags)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                  Conflict Strategy
                </label>
                <select
                  className="input"
                  value={conflictStrategy}
                  onChange={(e) => setConflictStrategy(e.target.value as any)}
                >
                  <option value="duplicate">Keep both (rename duplicate shortcut)</option>
                  <option value="overwrite">Overwrite existing snippet</option>
                  <option value="skip">Skip duplicates</option>
                </select>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                Paste JSON or CSV Data
              </label>
              <textarea
                className="input input-mono"
                style={{ height: 160, fontSize: 12 }}
                placeholder='[{"name":"Greeting","shortcut":"hi","plainContent":"Hello world"}]'
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
              />
            </div>

            {error && (
              <div style={{ padding: '8px 12px', background: 'var(--danger-light)', color: 'var(--danger)', fontSize: 13, marginBottom: 14 }}>
                {error}
              </div>
            )}

            {result && (
              <div style={{ padding: '10px 14px', background: 'var(--accent-light)', color: '#166534', fontSize: 13, marginBottom: 14, borderRadius: 6 }}>
                Successfully imported {result.importedCount} snippets! ({result.skippedCount} skipped)
                {result.warnings?.length > 0 && (
                  <div style={{ marginTop: 6, fontSize: 12 }}>
                    <strong>Warnings:</strong> {result.warnings.join(', ')}
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button className="btn btn-secondary btn-sm" onClick={onClose}>
                Close
              </button>
              <button className="btn btn-primary btn-sm" onClick={handleImport} disabled={loading}>
                {loading ? 'Processing...' : 'Run Import'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
