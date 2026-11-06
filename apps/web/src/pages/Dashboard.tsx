import React, { useState, useEffect } from 'react';
import { api } from '../api.js';
import { Snippet, Folder, User, Workspace, SnippetRevision } from '@snaptype/shared';
import { renderSnippet, extractFormFields } from '@snaptype/snippet-engine';
import {
  Folder as FolderIcon,
  FolderPlus,
  Star,
  Search,
  Plus,
  Copy,
  Trash2,
  Clock,
  Settings,
  Download,
  Upload,
  Check,
  AlertCircle,
  Code,
  Eye,
  Sliders,
  ChevronRight,
  MoreVertical
} from 'lucide-react';

interface DashboardProps {
  onOpenSettings: () => void;
  onOpenImportExport: () => void;
  onLogout: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  onOpenSettings,
  onOpenImportExport,
  onLogout
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [workspaces, setWorkspaces] = useState<{ workspace: Workspace; role: string }[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>('');
  const [folders, setFolders] = useState<Folder[]>([]);
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [selectedSnippetId, setSelectedSnippetId] = useState<string | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null | 'all' | 'favorites'>('all');

  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  // Editor State
  const [editName, setEditName] = useState('');
  const [editShortcut, setEditShortcut] = useState('');
  const [editFolderId, setEditFolderId] = useState<string | null>(null);
  const [editPlainContent, setEditPlainContent] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editTags, setEditTags] = useState<string>('');
  const [editIsFavorite, setEditIsFavorite] = useState(false);
  const [editIsEnabled, setEditIsEnabled] = useState(true);
  const [activeTab, setActiveTab] = useState<'editor' | 'preview'>('editor');

  // Preview State
  const [previewVars, setPreviewVars] = useState<Record<string, any>>({});

  // Save State
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error' | 'conflict'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // History Drawer
  const [revisions, setRevisions] = useState<SnippetRevision[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // Folder creation modal
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  // Initial Data Load
  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      const meRes = await api.getMe();
      setUser(meRes.user);
      setWorkspaces(meRes.workspaces);

      const defaultWsId = meRes.workspaces[0]?.workspace.id || '';
      setActiveWorkspaceId(defaultWsId);

      await refreshData(defaultWsId);
    } catch (err: any) {
      console.error('Failed to load initial dashboard data', err);
    } finally {
      setLoading(false);
    }
  };

  const refreshData = async (workspaceId: string) => {
    try {
      const [foldersRes, snippetsRes] = await Promise.all([
        api.getFolders(workspaceId),
        api.getSnippets({ workspaceId })
      ]);
      setFolders(foldersRes.folders);
      setSnippets(snippetsRes.snippets);

      if (snippetsRes.snippets.length > 0 && !selectedSnippetId) {
        selectSnippet(snippetsRes.snippets[0]);
      }
    } catch (err: any) {
      console.error('Failed to refresh snippets/folders', err);
    }
  };

  const selectSnippet = (snippet: Snippet) => {
    setSelectedSnippetId(snippet.id);
    setEditName(snippet.name);
    setEditShortcut(snippet.shortcut);
    setEditFolderId(snippet.folderId);
    setEditPlainContent(snippet.plainContent);
    setEditDescription(snippet.description || '');
    setEditTags((snippet.tags || []).join(', '));
    setEditIsFavorite(snippet.isFavorite);
    setEditIsEnabled(snippet.isEnabled);
    setSaveStatus('idle');
    setErrorMessage(null);

    // Reset preview vars with defaults
    const fields = extractFormFields(snippet.plainContent);
    const defaults: Record<string, any> = {};
    for (const f of fields) {
      defaults[f.name] = f.defaultValue || '';
    }
    setPreviewVars(defaults);
  };

  const handleCreateSnippet = async () => {
    try {
      const folderId = (selectedFolderId !== 'all' && selectedFolderId !== 'favorites') ? selectedFolderId : null;
      let shortcutBase = 'snip';
      let shortcut = shortcutBase;
      let counter = 1;
      while (snippets.some((s) => s.shortcut === shortcut)) {
        shortcut = `${shortcutBase}${counter++}`;
      }

      const res = await api.createSnippet({
        workspaceId: activeWorkspaceId,
        name: 'New Snippet',
        shortcut,
        plainContent: 'Hello, thank you for reaching out!',
        folderId,
        tags: [],
        isFavorite: false,
        isEnabled: true
      });

      setSnippets([res.snippet, ...snippets]);
      selectSnippet(res.snippet);
    } catch (err: any) {
      alert(err.message || 'Failed to create snippet');
    }
  };

  const handleSaveSnippet = async () => {
    if (!selectedSnippetId) return;

    setSaveStatus('saving');
    setErrorMessage(null);

    const current = snippets.find((s) => s.id === selectedSnippetId);
    if (!current) return;

    const tagsArray = editTags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    try {
      const res = await api.updateSnippet(selectedSnippetId, {
        name: editName,
        shortcut: editShortcut,
        folderId: editFolderId,
        plainContent: editPlainContent,
        description: editDescription,
        tags: tagsArray,
        isFavorite: editIsFavorite,
        isEnabled: editIsEnabled,
        expectedVersion: current.version
      });

      setSaveStatus('saved');
      setSnippets(snippets.map((s) => (s.id === res.snippet.id ? res.snippet : s)));
      setTimeout(() => setSaveStatus('idle'), 2500);
    } catch (err: any) {
      if (err.status === 409) {
        setSaveStatus('conflict');
        setErrorMessage('Conflict: Modified on another device. Please refresh.');
      } else {
        setSaveStatus('error');
        setErrorMessage(err.message || 'Failed to save');
      }
    }
  };

  const handleDeleteSnippet = async () => {
    if (!selectedSnippetId) return;
    if (!confirm('Are you sure you want to delete this snippet?')) return;

    try {
      await api.deleteSnippet(selectedSnippetId);
      const remaining = snippets.filter((s) => s.id !== selectedSnippetId);
      setSnippets(remaining);
      if (remaining.length > 0) {
        selectSnippet(remaining[0]);
      } else {
        setSelectedSnippetId(null);
      }
    } catch (err: any) {
      alert(err.message || 'Failed to delete snippet');
    }
  };

  const handleDuplicateSnippet = async () => {
    if (!selectedSnippetId) return;
    try {
      const res = await api.duplicateSnippet(selectedSnippetId);
      setSnippets([res.snippet, ...snippets]);
      selectSnippet(res.snippet);
    } catch (err: any) {
      alert(err.message || 'Failed to duplicate snippet');
    }
  };

  const handleToggleFavorite = async (snippet: Snippet, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const nextFav = !snippet.isFavorite;
      const res = await api.updateSnippet(snippet.id, { isFavorite: nextFav });
      setSnippets(snippets.map((s) => (s.id === snippet.id ? res.snippet : s)));
      if (selectedSnippetId === snippet.id) {
        setEditIsFavorite(nextFav);
      }
    } catch (err: any) {
      console.error('Failed to toggle favorite', err);
    }
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;

    try {
      const res = await api.createFolder({
        workspaceId: activeWorkspaceId,
        name: newFolderName.trim()
      });
      setFolders([...folders, res.folder]);
      setNewFolderName('');
      setShowNewFolderModal(false);
    } catch (err: any) {
      alert(err.message || 'Failed to create folder');
    }
  };

  const handleDeleteFolder = async (folderId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this folder? Snippets inside will be safely moved to root.')) return;

    try {
      await api.deleteFolder(folderId);
      setFolders(folders.filter((f) => f.id !== folderId));
      if (selectedFolderId === folderId) {
        setSelectedFolderId('all');
      }
      // Refresh snippets to update detached folders
      const sRes = await api.getSnippets({ workspaceId: activeWorkspaceId });
      setSnippets(sRes.snippets);
    } catch (err: any) {
      alert(err.message || 'Failed to delete folder');
    }
  };

  const handleLoadHistory = async () => {
    if (!selectedSnippetId) return;
    try {
      const res = await api.getSnippetRevisions(selectedSnippetId);
      setRevisions(res.revisions);
      setShowHistory(true);
    } catch (err: any) {
      alert('Failed to load revisions');
    }
  };

  const insertCommand = (syntax: string) => {
    setEditPlainContent((prev) => prev + syntax);
  };

  // Filtered snippets for list
  const filteredSnippets = snippets.filter((s) => {
    if (selectedFolderId === 'favorites' && !s.isFavorite) return false;
    if (selectedFolderId !== 'all' && selectedFolderId !== 'favorites') {
      if (s.folderId !== selectedFolderId) return false;
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase().trim();
      return (
        s.name.toLowerCase().includes(q) ||
        s.shortcut.toLowerCase().includes(q) ||
        s.plainContent.toLowerCase().includes(q) ||
        s.tags.some((t) => t.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const selectedSnippet = snippets.find((s) => s.id === selectedSnippetId);
  const dynamicFields = extractFormFields(editPlainContent);
  const previewResult = renderSnippet(editPlainContent, { variables: previewVars });

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 60px)', overflow: 'hidden' }}>
      {/* PANE 1: Folders & Navigation */}
      <div style={{
        width: 260,
        borderRight: '1px solid var(--border)',
        backgroundColor: 'var(--surface-subtle)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        flexShrink: 0
      }}>
        {/* Navigation Top */}
        <div style={{ padding: '16px 12px', overflowY: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Library
            </span>
            <button
              className="btn btn-ghost btn-sm"
              style={{ padding: '2px 6px' }}
              onClick={() => setShowNewFolderModal(true)}
              title="New Folder"
            >
              <FolderPlus size={16} />
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <button
              className="btn btn-ghost btn-sm"
              style={{
                justifyContent: 'space-between',
                width: '100%',
                backgroundColor: selectedFolderId === 'all' ? 'var(--surface)' : 'transparent',
                fontWeight: selectedFolderId === 'all' ? 700 : 500,
                border: selectedFolderId === 'all' ? '1px solid var(--border)' : '1px solid transparent'
              }}
              onClick={() => setSelectedFolderId('all')}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                ⚡ All Snippets
              </span>
              <span className="badge">{snippets.length}</span>
            </button>

            <button
              className="btn btn-ghost btn-sm"
              style={{
                justifyContent: 'space-between',
                width: '100%',
                backgroundColor: selectedFolderId === 'favorites' ? 'var(--surface)' : 'transparent',
                fontWeight: selectedFolderId === 'favorites' ? 700 : 500,
                border: selectedFolderId === 'favorites' ? '1px solid var(--border)' : '1px solid transparent'
              }}
              onClick={() => setSelectedFolderId('favorites')}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Star size={14} color="#f59e0b" fill="#f59e0b" /> Favorites
              </span>
              <span className="badge">{snippets.filter((s) => s.isFavorite).length}</span>
            </button>
          </div>

          {/* Folders List */}
          <div style={{ marginTop: 20 }}>
            <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8, textTransform: 'uppercase' }}>
              Folders
            </span>
            {folders.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '6px 8px' }}>
                No folders created yet
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {folders.map((folder) => (
                  <div
                    key={folder.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '4px 8px',
                      borderRadius: 'var(--radius-sm)',
                      cursor: 'pointer',
                      fontSize: 13,
                      backgroundColor: selectedFolderId === folder.id ? 'var(--surface)' : 'transparent',
                      border: selectedFolderId === folder.id ? '1px solid var(--border)' : '1px solid transparent',
                      fontWeight: selectedFolderId === folder.id ? 700 : 500
                    }}
                    onClick={() => setSelectedFolderId(folder.id)}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <FolderIcon size={14} color="#686b66" />
                      {folder.name}
                    </span>
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ padding: '2px 4px', opacity: 0.6 }}
                      onClick={(e) => handleDeleteFolder(folder.id, e)}
                      title="Delete folder"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Navigation Bottom Footer */}
        <div style={{ padding: 12, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <button className="btn btn-ghost btn-sm" style={{ justifyContent: 'flex-start' }} onClick={onOpenSettings}>
            <Sliders size={15} /> Preferences
          </button>
          <button className="btn btn-ghost btn-sm" style={{ justifyContent: 'flex-start' }} onClick={onOpenImportExport}>
            <Upload size={15} /> Import / Export
          </button>
        </div>
      </div>

      {/* PANE 2: Searchable Snippet List */}
      <div style={{
        width: 320,
        borderRight: '1px solid var(--border)',
        backgroundColor: 'var(--surface)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0
      }}>
        {/* Search header */}
        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ position: 'relative', marginBottom: 10 }}>
            <Search size={15} style={{ position: 'absolute', top: 10, left: 10, color: 'var(--text-muted)' }} />
            <input
              type="text"
              className="input"
              style={{ paddingLeft: 32, fontSize: 13 }}
              placeholder="Search (Ctrl+K)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button
            className="btn btn-primary btn-sm"
            style={{ width: '100%' }}
            onClick={handleCreateSnippet}
          >
            <Plus size={15} /> New Snippet
          </button>
        </div>

        {/* Snippet list items */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {filteredSnippets.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              No snippets found
            </div>
          ) : (
            filteredSnippets.map((s) => (
              <div
                key={s.id}
                style={{
                  padding: '12px 14px',
                  borderBottom: '1px solid var(--border)',
                  cursor: 'pointer',
                  backgroundColor: selectedSnippetId === s.id ? 'var(--surface-subtle)' : 'transparent',
                  borderLeft: selectedSnippetId === s.id ? '3px solid var(--ink)' : '3px solid transparent',
                  transition: 'background-color 0.1s ease'
                }}
                onClick={() => selectSnippet(s)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>
                    {s.name}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="badge badge-mono">{s.shortcut}</span>
                    <button
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}
                      onClick={(e) => handleToggleFavorite(s, e)}
                    >
                      <Star
                        size={14}
                        color={s.isFavorite ? '#f59e0b' : 'var(--text-muted)'}
                        fill={s.isFavorite ? '#f59e0b' : 'none'}
                      />
                    </button>
                  </div>
                </div>
                <div style={{
                  fontSize: 12,
                  color: 'var(--text-secondary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  lineHeight: 1.4
                }}>
                  {s.plainContent}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* PANE 3: Snippet Editor & Live Preview */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: 'var(--surface)', overflow: 'hidden' }}>
        {selectedSnippet ? (
          <>
            {/* Editor Top Bar */}
            <div style={{
              padding: '12px 24px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{
                    backgroundColor: activeTab === 'editor' ? 'var(--surface-subtle)' : 'transparent',
                    fontWeight: activeTab === 'editor' ? 700 : 500
                  }}
                  onClick={() => setActiveTab('editor')}
                >
                  <Code size={15} /> Editor
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{
                    backgroundColor: activeTab === 'preview' ? 'var(--surface-subtle)' : 'transparent',
                    fontWeight: activeTab === 'preview' ? 700 : 500
                  }}
                  onClick={() => setActiveTab('preview')}
                >
                  <Eye size={15} /> Live Preview {dynamicFields.length > 0 && `(${dynamicFields.length} inputs)`}
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {saveStatus === 'saving' && <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Saving...</span>}
                {saveStatus === 'saved' && (
                  <span style={{ fontSize: 13, color: '#166534', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Check size={14} /> Saved
                  </span>
                )}
                {saveStatus === 'conflict' && (
                  <span style={{ fontSize: 13, color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <AlertCircle size={14} /> Conflict!
                  </span>
                )}

                <button className="btn btn-ghost btn-sm" onClick={handleLoadHistory} title="Revisions">
                  <Clock size={15} /> History
                </button>
                <button className="btn btn-ghost btn-sm" onClick={handleDuplicateSnippet} title="Duplicate">
                  <Copy size={15} /> Duplicate
                </button>
                <button className="btn btn-danger btn-sm" onClick={handleDeleteSnippet} title="Delete">
                  <Trash2 size={15} /> Delete
                </button>
                <button className="btn btn-primary btn-sm" onClick={handleSaveSnippet}>
                  Save changes
                </button>
              </div>
            </div>

            {/* Error banner if save error */}
            {errorMessage && (
              <div style={{ padding: '8px 24px', backgroundColor: 'var(--danger-light)', color: 'var(--danger)', fontSize: 13 }}>
                {errorMessage}
              </div>
            )}

            {/* Editor Body */}
            {activeTab === 'editor' ? (
              <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 16, marginBottom: 16 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                      Snippet Name
                    </label>
                    <input
                      type="text"
                      className="input"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                      Shortcut
                    </label>
                    <input
                      type="text"
                      className="input input-mono"
                      value={editShortcut}
                      onChange={(e) => setEditShortcut(e.target.value)}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                      Folder
                    </label>
                    <select
                      className="input"
                      value={editFolderId || ''}
                      onChange={(e) => setEditFolderId(e.target.value || null)}
                    >
                      <option value="">(No Folder)</option>
                      {folders.map((f) => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Command Bar Pills */}
                <div style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 6,
                  padding: '10px 14px',
                  backgroundColor: 'var(--surface-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  marginBottom: 12
                }}>
                  <span style={{ fontSize: 12, fontWeight: 700, alignSelf: 'center', marginRight: 4 }}>
                    Insert:
                  </span>
                  <button className="btn btn-secondary btn-sm" onClick={() => insertCommand('{{date:YYYY-MM-DD}}')}>
                    + Date
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={() => insertCommand('{{time:HH:mm}}')}>
                    + Time
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={() => insertCommand('{{input:customerName|label="Nume client"}}')}>
                    + Input
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={() => insertCommand('{{paragraph:notes|label="Note"}}')}>
                    + Paragraph
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={() => insertCommand('{{dropdown:status|options="În verificare,Aprobat,Respins"}}')}>
                    + Dropdown
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={() => insertCommand('{{cursor}}')}>
                    + Cursor
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={() => insertCommand('{{clipboard}}')}>
                    + Clipboard
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={() => insertCommand('{{formula: 10 * 1.2}}')}>
                    + Formula
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={() => insertCommand('{{note: internal memo}}')}>
                    + Note
                  </button>
                </div>

                {/* Main Content Area */}
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                    Snippet Template Content
                  </label>
                  <textarea
                    className="input input-mono"
                    style={{
                      height: 320,
                      resize: 'vertical',
                      fontSize: 14,
                      lineHeight: 1.6,
                      padding: 16
                    }}
                    value={editPlainContent}
                    onChange={(e) => setEditPlainContent(e.target.value)}
                  />
                </div>

                {/* Tags and Description */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                      Tags (comma separated)
                    </label>
                    <input
                      type="text"
                      className="input"
                      placeholder="suport, bonus, verificare"
                      value={editTags}
                      onChange={(e) => setEditTags(e.target.value)}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                      Description
                    </label>
                    <input
                      type="text"
                      className="input"
                      placeholder="Short note about when to use"
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            ) : (
              /* Tab 2: Live Preview & Interactive Tester */
              <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 24 }}>
                {/* Simulated Form Input parameters */}
                <div style={{
                  background: 'var(--surface-subtle)',
                  borderRadius: 'var(--radius-md)',
                  padding: 20,
                  border: '1px solid var(--border)'
                }}>
                  <h4 style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>
                    Interactive Variables ({dynamicFields.length})
                  </h4>

                  {dynamicFields.length === 0 ? (
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                      This snippet has no interactive fields. It expands immediately with zero user prompt.
                    </p>
                  ) : (
                    dynamicFields.map((field) => (
                      <div key={field.name} style={{ marginBottom: 14 }}>
                        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                          {field.label} ({field.type})
                        </label>
                        {field.type === 'dropdown' ? (
                          <select
                            className="input"
                            value={previewVars[field.name] || ''}
                            onChange={(e) => setPreviewVars({ ...previewVars, [field.name]: e.target.value })}
                          >
                            {(field.options || []).map((opt) => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        ) : field.type === 'paragraph' ? (
                          <textarea
                            className="input"
                            rows={3}
                            value={previewVars[field.name] || ''}
                            onChange={(e) => setPreviewVars({ ...previewVars, [field.name]: e.target.value })}
                          />
                        ) : (
                          <input
                            type="text"
                            className="input"
                            value={previewVars[field.name] || ''}
                            onChange={(e) => setPreviewVars({ ...previewVars, [field.name]: e.target.value })}
                          />
                        )}
                      </div>
                    ))
                  )}
                </div>

                {/* Rendered Preview Result */}
                <div>
                  <h4 style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>
                    Evaluated Output
                  </h4>
                  <div style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)',
                    padding: 20,
                    minHeight: 280,
                    fontFamily: 'var(--font-mono)',
                    fontSize: 14,
                    whiteSpace: 'pre-wrap',
                    lineHeight: 1.6
                  }}>
                    {previewResult.text}
                  </div>
                  {previewResult.cursorOffset >= 0 && (
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8 }}>
                      ⚡ Cursor will automatically position at character index {previewResult.cursorOffset}.
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
            Select or create a snippet to begin editing
          </div>
        )}
      </div>

      {/* History Drawer Modal */}
      {showHistory && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.3)',
          display: 'flex',
          justifyContent: 'flex-end',
          zIndex: 100
        }}>
          <div style={{
            background: 'var(--surface)',
            width: 440,
            height: '100%',
            boxShadow: '-4px 0 20px rgba(0,0,0,0.05)',
            padding: 24,
            display: 'flex',
            flexDirection: 'column'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ fontSize: 18, fontWeight: 700 }}>Version History</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowHistory(false)}>Close</button>
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {revisions.map((rev) => (
                <div key={rev.id} style={{
                  padding: 14,
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  marginBottom: 10
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <strong style={{ fontSize: 13 }}>v{rev.version} — {rev.name}</strong>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{new Date(rev.createdAt).toLocaleDateString()}</span>
                  </div>
                  <pre style={{ fontSize: 12, fontFamily: 'var(--font-mono)', background: 'var(--surface-subtle)', padding: 8, borderRadius: 4, whiteSpace: 'pre-wrap' }}>
                    {rev.plainContent}
                  </pre>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* New Folder Modal */}
      {showNewFolderModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.35)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100
        }}>
          <form
            onSubmit={handleCreateFolder}
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              padding: 24,
              width: 360
            }}
          >
            <h4 style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>Create New Folder</h4>
            <input
              type="text"
              className="input"
              placeholder="e.g. Support Responses, Financial, Refunds"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              autoFocus
              style={{ marginBottom: 16 }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowNewFolderModal(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary btn-sm">
                Create Folder
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
