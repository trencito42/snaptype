import React, { useState, useEffect } from 'react';
import { api } from '../api.js';
import { Check, X, Mail, Shield, AlertCircle } from 'lucide-react';

interface AcceptInvitationPageProps {
  token: string;
  isAuthenticated: boolean;
  onOpenAuth: (prefilledEmail?: string) => void;
  onAccepted: (workspaceId: string) => void;
  onCancel: () => void;
}

export const AcceptInvitationPage: React.FC<AcceptInvitationPageProps> = ({
  token,
  isAuthenticated,
  onOpenAuth,
  onAccepted,
  onCancel
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invitation, setInvitation] = useState<any>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);

  useEffect(() => {
    loadDetails();
  }, [token, isAuthenticated]);

  const loadDetails = async () => {
    setLoading(true);
    setError(null);
    try {
      if (isAuthenticated) {
        try {
          const me = await api.getMe();
          setCurrentUserEmail(me.user.email);
        } catch {
          // Ignore
        }
      }

      const res = await api.getInvitationDetails(token);
      setInvitation(res.invitation);
    } catch (err: any) {
      setError(err.message || 'Invitation is invalid, expired, or has been revoked.');
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async () => {
    setActionLoading(true);
    setError(null);
    try {
      const res = await api.acceptInvitation(token);
      if (res && res.member) {
        onAccepted(res.member.workspaceId);
      } else {
        onAccepted(invitation.workspaceId);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to accept invitation');
      setActionLoading(false);
    }
  };

  const handleDecline = async () => {
    if (!confirm('Are you sure you want to decline this invitation?')) return;
    setActionLoading(true);
    try {
      await api.rejectInvitation(token);
      onCancel();
    } catch (err: any) {
      setError(err.message || 'Failed to decline invitation');
      setActionLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '80vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20
    }}>
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        maxWidth: 480,
        width: '100%',
        padding: 32,
        boxShadow: '0 4px 16px rgba(0,0,0,0.06)'
      }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)' }}>
            Validating invitation...
          </div>
        ) : error ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: 48, height: 48, borderRadius: 24,
              background: 'var(--danger-light)', color: 'var(--danger)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px'
            }}>
              <AlertCircle size={24} />
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Unable to Accept Invitation</h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.5 }}>
              {error}
            </p>
            <button className="btn btn-secondary btn-sm" onClick={onCancel}>
              Go to Home
            </button>
          </div>
        ) : invitation ? (
          <div>
            <div style={{
              width: 48, height: 48, borderRadius: 24,
              background: '#eefde9', color: '#166534',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px'
            }}>
              <Mail size={24} />
            </div>

            <h3 style={{ fontSize: 20, fontWeight: 800, textAlign: 'center', marginBottom: 6 }}>
              Workspace Invitation
            </h3>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', textAlign: 'center', marginBottom: 24 }}>
              <strong>{invitation.inviterName}</strong> invited you to collaborate in <strong>{invitation.workspaceName}</strong>.
            </p>

            <div style={{
              background: 'var(--surface-subtle)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: 16,
              marginBottom: 24,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              fontSize: 13
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Invited Email:</span>
                <strong>{invitation.email}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Assigned Role:</span>
                <strong style={{ textTransform: 'capitalize' }}>{invitation.role}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Expires:</span>
                <span>{new Date(invitation.expiresAt).toLocaleDateString()}</span>
              </div>
            </div>

            {!isAuthenticated ? (
              <div>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center', marginBottom: 16 }}>
                  Please sign in with <strong>{invitation.email}</strong> to accept this invitation.
                </p>
                <button
                  className="btn btn-primary"
                  style={{ width: '100%', justifyContent: 'center' }}
                  onClick={() => onOpenAuth(invitation.email)}
                >
                  Sign in or Register to Accept
                </button>
              </div>
            ) : currentUserEmail && currentUserEmail.toLowerCase().trim() !== invitation.email.toLowerCase().trim() ? (
              <div>
                <div style={{
                  padding: '10px 12px',
                  background: 'var(--danger-light)',
                  color: 'var(--danger)',
                  fontSize: 12,
                  borderRadius: 6,
                  marginBottom: 16
                }}>
                  You are currently signed in as <strong>{currentUserEmail}</strong>, but this invitation was sent to <strong>{invitation.email}</strong>.
                </div>
                <button
                  className="btn btn-secondary"
                  style={{ width: '100%', justifyContent: 'center' }}
                  onClick={() => onOpenAuth(invitation.email)}
                >
                  Switch Account
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  className="btn btn-secondary"
                  style={{ flex: 1, justifyContent: 'center' }}
                  onClick={handleDecline}
                  disabled={actionLoading}
                >
                  Decline
                </button>
                <button
                  className="btn btn-primary"
                  style={{ flex: 1, justifyContent: 'center' }}
                  onClick={handleAccept}
                  disabled={actionLoading}
                >
                  <Check size={16} /> Accept Invitation
                </button>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
};

