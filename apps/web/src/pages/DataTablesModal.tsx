import { Select, Switch, FilePicker } from '../components/ui.js';
import { confirmDialog, alertDialog } from '../components/Dialogs.js';
import React, { useState, useEffect } from 'react';
import { api } from '../api.js';
import { X, Table, Plus, Trash2, Edit2, Save, AlertCircle } from 'lucide-react';

interface DataTablesModalProps {
  isOpen: boolean;
  workspaceId: string;
  onClose: () => void;
}

export const DataTablesModal: React.FC<DataTablesModalProps> = ({
  isOpen,
  workspaceId,
  onClose
}) => {
  const [tables, setTables] = useState<any[]>([]);
  const [activeTableId, setActiveTableId] = useState<string | null>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New Table Form
  const [showNewTable, setShowNewTable] = useState(false);
  const [newTableName, setNewTableName] = useState('');
  const [newTableDesc, setNewTableDesc] = useState('');
  const [newColumns, setNewColumns] = useState<Array<{ name: string; key: string; type: 'text' | 'number' }>>([
    { name: 'Key', key: 'key', type: 'text' },
    { name: 'Value', key: 'value', type: 'text' }
  ]);

  // New Row Form
  const [newRowData, setNewRowData] = useState<Record<string, any>>({});

  useEffect(() => {
    if (isOpen && workspaceId) {
      loadTables();
    }
  }, [isOpen, workspaceId]);

  useEffect(() => {
    if (activeTableId) {
      loadRows(activeTableId);
    } else {
      setRows([]);
    }
  }, [activeTableId]);

  const loadTables = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getTables(workspaceId);
      setTables(res.tables || []);
      if (res.tables && res.tables.length > 0 && !activeTableId) {
        setActiveTableId(res.tables[0].id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load tables');
    } finally {
      setLoading(false);
    }
  };

  const loadRows = async (tableId: string) => {
    try {
      const res = await api.getTableRows(tableId);
      setRows(res.rows || []);
    } catch (err: any) {
      console.error('Failed to load table rows', err);
    }
  };

  const handleCreateTable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTableName.trim()) return;

    try {
      const cols = newColumns.map((c, i) => ({
        id: String(i + 1),
        name: c.name.trim(),
        key: c.key.trim().toLowerCase(),
        type: c.type
      }));

      const res = await api.createTable({
        workspaceId,
        name: newTableName.trim(),
        description: newTableDesc.trim() || null,
        columns: cols
      });

      setNewTableName('');
      setNewTableDesc('');
      setShowNewTable(false);
      await loadTables();
      if (res.table?.id) {
        setActiveTableId(res.table.id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create table');
    }
  };

  const handleDeleteTable = async (tableId: string) => {
    if (!await confirmDialog('Delete this table? All its rows will be permanently deleted.', { confirmLabel: 'Delete table', danger: true })) return;
    try {
      await api.deleteTable(tableId);
      if (activeTableId === tableId) setActiveTableId(null);
      await loadTables();
    } catch (err: any) {
      setError(err.message || 'Failed to delete table');
    }
  };

  const handleAddRow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTableId) return;

    try {
      await api.createTableRow(activeTableId, newRowData);
      setNewRowData({});
      await loadRows(activeTableId);
      await loadTables();
    } catch (err: any) {
      setError(err.message || 'Failed to add row');
    }
  };

  const handleDeleteRow = async (rowId: string) => {
    if (!activeTableId) return;
    try {
      await api.deleteTableRow(activeTableId, rowId);
      await loadRows(activeTableId);
      await loadTables();
    } catch (err: any) {
      setError(err.message || 'Failed to delete row');
    }
  };

  if (!isOpen) return null;

  const currentTable = tables.find(t => t.id === activeTableId);

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
        width: 'min(820px, calc(100vw - 24px))',
        height: 'min(560px, calc(100dvh - 24px))',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 20px',
          borderBottom: '1px solid var(--border)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Table size={18} style={{ color: 'var(--accent-ink)' }} />
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Data Tables (Lookup Tables)</h3>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
          >
            <X size={18} />
          </button>
        </div>

        {error && (
          <div style={{ padding: '8px 16px', background: 'var(--danger-light)', color: 'var(--danger)', fontSize: 13 }}>
            {error}
          </div>
        )}

        <div className="stack-sm" style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Sidebar */}
          <div className="stack-sm-side" style={{ width: 220, borderRight: '1px solid var(--border)', padding: 12, overflowY: 'auto', background: 'var(--surface)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Tables</span>
              <button
                className="btn btn-ghost btn-sm"
                style={{ padding: '2px 6px', fontSize: 11 }}
                onClick={() => setShowNewTable(true)}
              >
                <Plus size={12} /> New
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {tables.map(table => (
                <div
                  key={table.id}
                  onClick={() => { setActiveTableId(table.id); setShowNewTable(false); }}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 6,
                    background: activeTableId === table.id && !showNewTable ? 'var(--surface-subtle)' : 'transparent',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: activeTableId === table.id ? 700 : 500 }}>
                      {table.name}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                      {table.rowCount || 0} rows
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteTable(table.id); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 4 }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
              {tables.length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '10px 0' }}>
                  No tables created yet.
                </div>
              )}
            </div>
          </div>

          {/* Main content area */}
          <div style={{ flex: 1, padding: 20, overflowY: 'auto' }}>
            {showNewTable ? (
              <form onSubmit={handleCreateTable}>
                <h4 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Create New Data Table</h4>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Table Name</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="e.g. customers or pricing"
                    value={newTableName}
                    onChange={(e) => setNewTableName(e.target.value)}
                    required
                  />
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Description</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="Optional description"
                    value={newTableDesc}
                    onChange={(e) => setNewTableDesc(e.target.value)}
                  />
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Columns</label>
                  {newColumns.map((col, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                      <input
                        type="text"
                        className="input"
                        placeholder="Column Name"
                        value={col.name}
                        onChange={(e) => {
                          const updated = [...newColumns];
                          updated[idx].name = e.target.value;
                          updated[idx].key = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_');
                          setNewColumns(updated);
                        }}
                        required
                      />
                      <input
                        type="text"
                        className="input"
                        placeholder="Key"
                        value={col.key}
                        onChange={(e) => {
                          const updated = [...newColumns];
                          updated[idx].key = e.target.value;
                          setNewColumns(updated);
                        }}
                        required
                      />
                      <Select
                        ariaLabel="Column type"
                        style={{ width: 120 }}
                        value={col.type}
                        onChange={(v) => {
                          const updated = [...newColumns];
                          updated[idx].type = v as any;
                          setNewColumns(updated);
                        }}
                        options={[{ value: 'text', label: 'Text' }, { value: 'number', label: 'Number' }]}
                      />
                      {newColumns.length > 1 && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => setNewColumns(newColumns.filter((_, i) => i !== idx))}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    style={{ marginTop: 6 }}
                    onClick={() => setNewColumns([...newColumns, { name: '', key: '', type: 'text' }])}
                  >
                    <Plus size={13} /> Add Column
                  </button>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="submit" className="btn btn-primary btn-sm">Save Table</button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowNewTable(false)}>Cancel</button>
                </div>
              </form>
            ) : currentTable ? (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div>
                    <h4 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{currentTable.name}</h4>
                    {currentTable.description && (
                      <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>{currentTable.description}</p>
                    )}
                  </div>
                  <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
                    lookup syntax: &#123;&#123;table:{currentTable.name}|lookup={currentTable.columns?.[0]?.key || 'key'}|value=...|column=...&#125;&#125;
                  </div>
                </div>

                {/* Add Row Form */}
                <form onSubmit={handleAddRow} style={{ display: 'flex', gap: 6, marginBottom: 16, padding: 10, background: 'var(--surface-subtle)', borderRadius: 6 }}>
                  {currentTable.columns?.map((col: any) => (
                    <input
                      key={col.key}
                      type={col.type === 'number' ? 'number' : 'text'}
                      className="input"
                      style={{ fontSize: 12 }}
                      placeholder={col.name}
                      value={newRowData[col.key] || ''}
                      onChange={(e) => setNewRowData({ ...newRowData, [col.key]: e.target.value })}
                    />
                  ))}
                  <button type="submit" className="btn btn-primary btn-sm" style={{ flexShrink: 0 }}>
                    <Plus size={14} /> Add Row
                  </button>
                </form>

                {/* Table Data Rows */}
                <div style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: 'var(--surface-subtle)', borderBottom: '1px solid var(--border)' }}>
                        {currentTable.columns?.map((col: any) => (
                          <th key={col.key} style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 700, fontSize: 12 }}>
                            {col.name} <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}>({col.key})</span>
                          </th>
                        ))}
                        <th style={{ width: 40 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(row => (
                        <tr key={row.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          {currentTable.columns?.map((col: any) => (
                            <td key={col.key} style={{ padding: '8px 12px' }}>
                              {String(row.data?.[col.key] ?? '')}
                            </td>
                          ))}
                          <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                            <button
                              onClick={() => handleDeleteRow(row.id)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: 2 }}
                            >
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      ))}
                      {rows.length === 0 && (
                        <tr>
                          <td colSpan={currentTable.columns?.length + 1} style={{ textAlign: 'center', padding: 20, color: 'var(--text-secondary)' }}>
                            No rows in this table yet. Add the first row above!
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-secondary)' }}>
                Select a table from the sidebar or create a new one.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

