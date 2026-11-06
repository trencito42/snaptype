import React, { useState, useEffect } from 'react';
import { api } from '../api.js';
import { X, UserPlus, Trash2, Shield, User as UserIcon } from 'lucide-react';

interface WorkspaceMembersModalProps {
  isOpen: boolean;
  workspaceId: string;
  workspaceName: string;
  currentUserRole: string;
  onClose: () => void;
}

export const WorkspaceMembersModal: React.FC<WorkspaceMembersModalProps> = ({
  isOpen,
  workspaceId,
  workspaceName,
  currentUserRole,
  onClose
}) => {
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'editor' | 'viewer'>('editor');
  const [error, setError] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);

  useEffect(() => {
    if (isOpen && workspaceId) {
      loadMembers();
    }
  }, [isOpen, workspaceId]);

  const loadMembers = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getWorkspaceMembers(workspaceId);
      setMembers(res.members || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load members');
    } finally {
      setLoading(false);
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim()) return;

    setInviting(true);
    setError(null);
    try {
      await api.addWorkspaceMember(workspaceId, newEmail.trim(), newRole);
      setNewEmail('');
      await loadMembers();
    } catch (err: any) {
      setError(err.message || 'Failed to add member');
    } finally {
      setInviting(false);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!confirm('Are you sure you want to remove this member?')) return;

    try {
      await api.removeWorkspaceMember(workspaceId, userId);
      await loadMembers();
    } catch (err: any) {
      setError(err.message || 'Failed to remove member');
    }
  };

  if (!isOpen) return null;

  const canManage = currentUserRole === 'owner' || currentUserRole === 'admin';

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
        maxHeight: '85vh',
        overflowY: 'auto',
        padding: 24,
        position: 'relative'
      }}>
        <button
          onClick={onClose}
          style={{ position: 'absolute', top: 18, right: 18, background: 'none', border: 'none', cursor: 'pointer' }}
        >
          <X size={18} />
        </button>

        <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Workspace Members</h3>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
          Manage access and roles for <strong>{workspaceName}</strong>.
        </p>

        {canManage && (
          <form onSubmit={handleAddMember} style={{ marginBottom: 24, padding: 14, background: 'var(--surface-subtle)', borderRadius: 8 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
              Invite or Add Teammate
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="email"
                className="input"
                style={{ flex: 1, fontSize: 13 }}
                placeholder="colleague@company.com"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                required
              />
              <select
                className="input"
                style={{ width: 110, fontSize: 13 }}
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as any)}
              >
                <option value="editor">Editor</option>
                <option value="admin">Admin</option>
                <option value="viewer">Viewer</option>
              </select>
              <button type="submit" className="btn btn-primary btn-sm" disabled={inviting}>
                <UserPlus size={14} /> Add
              </button>
            </div>
          </form>
        )}

        {error && (
          <div style={{ padding: '8px 12px', background: 'var(--danger-light)', color: 'var(--danger)', fontSize: 13, marginBottom: 14, borderRadius: 6 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-secondary)', fontSize: 13 }}>
              Loading members...
            </div>
          ) : (
            members.map(member => (
              <div
                key={member.userId}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  border: '1px solid var(--border)',
                  borderRadius: 6
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 16,
                    background: 'var(--surface-subtle)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    <UserIcon size={16} color="var(--text-secondary)" />
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{member.userId}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'capitalize' }}>
                      Role: {member.role}
                    </div>
                  </div>
                </div>

                {canManage && member.role !== 'owner' && (
                  <button
                    onClick={() => handleRemoveMember(member.userId)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: 6 }}
                    title="Remove member"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            ))
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

