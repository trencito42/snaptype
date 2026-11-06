import React, { useState, useEffect } from 'react';
import { api } from '../api.js';
import { Mail, ArrowRight, CheckCircle2, RotateCw, X } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    let timer: any;
    if (cooldown > 0) {
      timer = setInterval(() => setCooldown((c) => c - 1), 1000);
    }
    return () => clearInterval(timer);
  }, [cooldown]);

  if (!isOpen) return null;

  const handleRequestOTP = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!email.trim() || !email.includes('@')) {
      setError('Please enter a valid email address');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await api.requestOTP(email);
      setSuccessMsg(res.message);
      setStep('otp');
      setCooldown(60);
    } catch (err: any) {
      setError(err.message || 'Failed to send verification code');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (code.trim().length !== 6) {
      setError('Please enter the 6-digit code');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await api.verifyOTP(email, code);
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.45)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      backdropFilter: 'blur(2px)'
    }}>
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        width: '100%',
        maxWidth: 420,
        padding: '36px 32px',
        position: 'relative',
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.08)'
      }}>
        {/* Close Button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 18,
            right: 18,
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-secondary)'
          }}
        >
          <X size={18} />
        </button>

        {step === 'email' ? (
          <div>
            <div style={{
              display: 'inline-block',
              width: 32,
              height: 32,
              borderRadius: 8,
              backgroundColor: 'var(--accent)',
              textAlign: 'center',
              lineHeight: '32px',
              fontSize: 16,
              fontWeight: 800,
              color: 'var(--accent-ink)',
              marginBottom: 16
            }}>
              ⚡
            </div>

            <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.5, marginBottom: 6 }}>
              Welcome to SnapType
            </h2>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 24 }}>
              Your snippets, everywhere. Enter your email to sign in or create your account in seconds.
            </p>

            {error && (
              <div style={{
                padding: '10px 14px',
                borderRadius: 6,
                backgroundColor: 'var(--danger-light)',
                color: 'var(--danger)',
                fontSize: 13,
                marginBottom: 16
              }}>
                {error}
              </div>
            )}

            <form onSubmit={handleRequestOTP}>
              <div style={{ marginBottom: 18 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                  Email address
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="email"
                    className="input"
                    placeholder="name@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoFocus
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: '100%', padding: '10px 0' }}
                disabled={loading}
              >
                {loading ? 'Sending code...' : 'Continue'} <ArrowRight size={16} />
              </button>
            </form>
          </div>
        ) : (
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.5, marginBottom: 6 }}>
              Check your inbox
            </h2>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 20 }}>
              We've sent a 6-digit verification code to <br />
              <strong style={{ color: 'var(--ink)' }}>{email}</strong>
            </p>

            {error && (
              <div style={{
                padding: '10px 14px',
                borderRadius: 6,
                backgroundColor: 'var(--danger-light)',
                color: 'var(--danger)',
                fontSize: 13,
                marginBottom: 16
              }}>
                {error}
              </div>
            )}

            <form onSubmit={handleVerifyOTP}>
              <div style={{ marginBottom: 20 }}>
                <input
                  type="text"
                  className="input input-mono"
                  placeholder="123456"
                  maxLength={6}
                  style={{
                    fontSize: 26,
                    letterSpacing: 8,
                    textAlign: 'center',
                    padding: '12px 0'
                  }}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  autoFocus
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: '100%', padding: '10px 0', marginBottom: 14 }}
                disabled={loading || code.length !== 6}
              >
                {loading ? 'Verifying...' : 'Verify and enter'}
              </button>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setStep('email')}
                >
                  Change email
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={cooldown > 0}
                  onClick={() => handleRequestOTP()}
                >
                  {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
