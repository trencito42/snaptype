import React, { useState, useEffect } from 'react';
import { api } from '../api.js';
import { X, UserPlus, Trash2, Shield, User as UserIcon, Mail, Copy, Check, Clock } from 'lucide-react';

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
  const [invitations, setInvitations] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'editor' | 'viewer'>('editor');
  const [error, setError] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [lastInviteLink, setLastInviteLink] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  const canManage = currentUserRole === 'owner' || currentUserRole === 'admin';

  useEffect(() => {
    if (isOpen && workspaceId) {
      setLastInviteLink(null);
      loadData();
    }
  }, [isOpen, workspaceId]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const promises: [Promise<any>, Promise<any>?] = [api.getWorkspaceMembers(workspaceId)];
      if (canManage) {
        promises.push(api.getWorkspaceInvitations(workspaceId));
      }
      const [membersRes, invitesRes] = await Promise.all(promises);
      setMembers(membersRes.members || []);
      if (invitesRes) {
        setInvitations(invitesRes.invitations || []);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load workspace members and invitations');
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
      const res = await api.addWorkspaceMember(workspaceId, newEmail.trim(), newRole);
      if (res.inviteLink) {
        setLastInviteLink(res.inviteLink);
      }
      setNewEmail('');
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to issue invitation');
    } finally {
      setInviting(false);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!confirm('Are you sure you want to remove this member?')) return;

    try {
      await api.removeWorkspaceMember(workspaceId, userId);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to remove member');
    }
  };

  const handleRevokeInvitation = async (invitationId: string) => {
    if (!confirm('Are you sure you want to revoke this pending invitation?')) return;

    try {
      await api.revokeWorkspaceInvitation(workspaceId, invitationId);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to revoke invitation');
    }
  };

  const handleCopyInviteLink = () => {
    if (!lastInviteLink) return;
    navigator.clipboard.writeText(lastInviteLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
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
        width: 580,
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
          Manage access, roles, and pending invitations for <strong>{workspaceName}</strong>.
        </p>

        {canManage && (
          <form onSubmit={handleAddMember} style={{ marginBottom: 20, padding: 14, background: 'var(--surface-subtle)', borderRadius: 8 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
              Invite Teammate via Email
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
                <UserPlus size={14} /> Invite
              </button>
            </div>
          </form>
        )}

        {lastInviteLink && (
          <div style={{
            marginBottom: 20,
            padding: 12,
            background: '#f0fdf4',
            border: '1px solid #bbf7d0',
            borderRadius: 8
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#166534', marginBottom: 6 }}>
              Invitation sent! You can also share this direct invite link:
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                readOnly
                className="input"
                style={{ flex: 1, fontSize: 12, background: '#fff' }}
                value={lastInviteLink}
              />
              <button
                type="button"
                className="btn btn-sm"
                style={{ background: '#166534', color: '#fff', border: 'none' }}
                onClick={handleCopyInviteLink}
              >
                {copiedLink ? <Check size={14} /> : <Copy size={14} />} {copiedLink ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        )}

        {error && (
          <div style={{ padding: '8px 12px', background: 'var(--danger-light)', color: 'var(--danger)', fontSize: 13, marginBottom: 14, borderRadius: 6 }}>
            {error}
          </div>
        )}

        {/* Active Members */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: 'var(--text-secondary)' }}>
            Active Members ({members.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {loading && members.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 16, color: 'var(--text-secondary)', fontSize: 13 }}>
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
        </div>

        {/* Pending Invitations */}
        {canManage && invitations.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: 'var(--text-secondary)' }}>
              Pending Invitations ({invitations.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {invitations.map((inv) => (
                <div
                  key={inv.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    border: '1px dashed var(--border)',
                    borderRadius: 6,
                    background: 'var(--surface-subtle)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: 16,
                      background: 'var(--surface)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                      <Mail size={15} color="var(--text-secondary)" />
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{inv.email}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                        Role: <span style={{ textTransform: 'capitalize' }}>{inv.role}</span> &bull; Expires: {new Date(inv.expiresAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => handleRevokeInvitation(inv.id)}
                    className="btn btn-ghost btn-sm"
                    style={{ color: 'var(--danger)', fontSize: 12 }}
                    title="Revoke invitation"
                  >
                    Revoke
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

