import React from 'react';
import { Zap, Download, Shield, Sliders, LogIn, LayoutDashboard } from 'lucide-react';

interface NavbarProps {
  currentView: string;
  onNavigate: (view: string) => void;
  isAuthenticated: boolean;
  onOpenAuth: () => void;
  onLogout: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentView,
  onNavigate,
  isAuthenticated,
  onOpenAuth,
  onLogout
}) => {
  return (
    <header style={{
      borderBottom: '1px solid var(--border)',
      backgroundColor: 'var(--surface)',
      position: 'sticky',
      top: 0,
      zIndex: 50,
      height: 60,
      display: 'flex',
      alignItems: 'center',
      padding: '0 24px',
      justifyContent: 'space-between'
    }}>
      {/* Brand */}
      <div 
        style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
        onClick={() => onNavigate('landing')}
      >
        <div style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          backgroundColor: 'var(--accent)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 800,
          color: 'var(--accent-ink)',
          fontSize: 18
        }}>
          ⚡
        </div>
        <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: -0.5 }}>
          Snap<span style={{ color: '#1c5211', backgroundColor: 'var(--accent-light)', padding: '1px 5px', borderRadius: 4 }}>Type</span>
        </div>
      </div>

      {/* Nav Links */}
      <nav style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => onNavigate('landing')}
          style={{ color: currentView === 'landing' ? 'var(--ink)' : 'var(--text-secondary)' }}
        >
          Features
        </button>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => onNavigate('install')}
          style={{ color: currentView === 'install' ? 'var(--ink)' : 'var(--text-secondary)' }}
        >
          <Download size={15} /> Extension Install
        </button>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => onNavigate('test-ground')}
          style={{ color: currentView === 'test-ground' ? 'var(--ink)' : 'var(--text-secondary)' }}
        >
          <Zap size={15} /> Test Playground
        </button>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => onNavigate('privacy')}
          style={{ color: currentView === 'privacy' ? 'var(--ink)' : 'var(--text-secondary)' }}
        >
          <Shield size={15} /> Privacy
        </button>
      </nav>

      {/* Action CTA */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {isAuthenticated ? (
          <>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => onNavigate('dashboard')}
            >
              <LayoutDashboard size={15} /> Dashboard
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={onLogout}
            >
              Sign out
            </button>
          </>
        ) : (
          <button
            className="btn btn-primary btn-sm"
            onClick={onOpenAuth}
          >
            <LogIn size={15} /> Sign in / Register
          </button>
        )}
      </div>
    </header>
  );
};

