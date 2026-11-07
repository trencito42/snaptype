import React, { useState } from 'react';
import { api } from '../api.js';
import { parseCSV, serializeCSV } from '@snaptype/shared';
import { X, Download, Upload, Check, AlertCircle, FileSpreadsheet, FileCode } from 'lucide-react';

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

  const handleExportJSON = async () => {
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

  const handleExportCSV = async () => {
    try {
      const data = await api.exportWorkspace();
      const snippets = data.snippets || [];
      const headers = ['name', 'shortcut', 'plainContent', 'tags', 'description'];
      const rows = snippets.map((s: any) => [
        s.name || '',
        s.shortcut || '',
        s.plainContent || '',
        Array.isArray(s.tags) ? s.tags.join(';') : (s.tags || ''),
        s.description || ''
      ]);
      const csvContent = serializeCSV([headers, ...rows]);
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `snaptype-export-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.message || 'CSV Export failed');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.name.endsWith('.csv')) {
      setImportFormat('csv');
    } else if (file.name.endsWith('.json')) {
      setImportFormat('snaptype_json');
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setImportText(content || '');
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!importText.trim()) {
      setError('Please provide snippets data to import or select a file');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      let parsedSnippets: any[] = [];
      let parsedFolders: any[] = [];

      if (importFormat === 'csv') {
        const rows = parseCSV(importText);
        if (rows.length < 2) {
          throw new Error('CSV must contain a header row and at least one data row');
        }

        const headers = rows[0].map(h => h.trim().toLowerCase());
        const nameIdx = headers.indexOf('name');
        const shortcutIdx = headers.indexOf('shortcut');
        const contentIdx = headers.findIndex(h => h === 'plaincontent' || h === 'content' || h === 'text' || h === 'snippet');
        const tagsIdx = headers.indexOf('tags');
        const descIdx = headers.indexOf('description');

        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (row.length === 0 || (row.length === 1 && !row[0].trim())) continue;

          const name = nameIdx !== -1 ? row[nameIdx] : (row[0] || 'Imported Snippet');
          const shortcut = shortcutIdx !== -1 ? row[shortcutIdx] : (row[1] || `imp_${i}`);
          const plainContent = contentIdx !== -1 ? row[contentIdx] : (row[2] || '');
          const tags = tagsIdx !== -1 && row[tagsIdx] ? row[tagsIdx].split(';').map(t => t.trim()) : [];
          const description = descIdx !== -1 ? row[descIdx] : '';

          parsedSnippets.push({
            name,
            shortcut,
            plainContent,
            tags,
            description
          });
        }
      } else {
        const parsed = JSON.parse(importText);
        parsedSnippets = Array.isArray(parsed) ? parsed : (parsed.snippets || []);
        parsedFolders = Array.isArray(parsed) ? [] : (parsed.folders || []);
      }

      const res = await api.importSnippets({
        snippets: parsedSnippets,
        folders: parsedFolders,
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
        width: 580,
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
              Export your snippets, organized folders, and shortcuts. Choose standard JSON backup or RFC-4180 CSV spreadsheet format.
            </p>
            <div style={{ display: 'flex', gap: 14 }}>
              <button className="btn btn-primary" onClick={handleExportJSON}>
                <FileCode size={16} /> Export SnapType JSON
              </button>
              <button className="btn btn-secondary" onClick={handleExportCSV}>
                <FileSpreadsheet size={16} /> Export RFC-4180 CSV
              </button>
            </div>
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
                  <option value="csv">RFC-4180 CSV (name, shortcut, plainContent, tags)</option>
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <label style={{ fontSize: 12, fontWeight: 700 }}>
                  Upload File or Paste Data
                </label>
                <input
                  type="file"
                  accept=".csv,.json"
                  onChange={handleFileUpload}
                  style={{ fontSize: 12 }}
                />
              </div>
              <textarea
                className="input input-mono"
                style={{ height: 160, fontSize: 12 }}
                placeholder={importFormat === 'csv' ? 'name,shortcut,plainContent,tags\nGreeting,hi,"Hello there!",general' : '[{"name":"Greeting","shortcut":"hi","plainContent":"Hello world"}]'}
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
              <div role="status" style={{ padding: '10px 14px', background: result.failedCount > 0 ? '#fff7e6' : 'var(--accent-light)', color: result.failedCount > 0 ? '#7a4b00' : '#166534', fontSize: 13, marginBottom: 14, borderRadius: 6 }}>
                Imported {result.importedCount} snippet(s). {result.skippedCount} skipped, {result.failedCount ?? 0} failed.
                {result.failedCount > 0 && (
                  <ul style={{ marginTop: 6, paddingLeft: 18, fontSize: 12 }}>
                    {result.failed.slice(0, 20).map((f: { shortcut: string; reason: string }, i: number) => (
                      <li key={i}><code>{f.shortcut}</code>: {f.reason}</li>
                    ))}
                    {result.failed.length > 20 && <li>…and {result.failed.length - 20} more</li>}
                  </ul>
                )}
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
