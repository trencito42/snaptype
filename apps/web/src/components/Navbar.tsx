import React from 'react';
import { Download, LogIn, LayoutDashboard } from 'lucide-react';
import { LogoMark, Wordmark } from './Logo.js';

interface NavbarProps {
  currentView: string;
  onNavigate: (view: string) => void;
  isAuthenticated: boolean;
  onOpenAuth: () => void;
  onLogout: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentView, onNavigate, isAuthenticated, onOpenAuth, onLogout }) => (
  <header className="site-header">
    <button className="brand" onClick={() => onNavigate('landing')} aria-label="SnapType home">
      <LogoMark size={30} />
      <Wordmark />
    </button>

    <nav className="site-nav" aria-label="Main">
      <button className="btn btn-ghost btn-sm hide-sm" onClick={() => onNavigate('install')}
        aria-current={currentView === 'install' ? 'page' : undefined}>
        <Download size={15} aria-hidden="true" /> Install
      </button>
      <button className="btn btn-ghost btn-sm hide-sm" onClick={() => onNavigate('test-ground')}
        aria-current={currentView === 'test-ground' ? 'page' : undefined}>
        Test playground
      </button>
      {isAuthenticated ? (
        <>
          <button className="btn btn-secondary btn-sm" onClick={() => onNavigate('dashboard')}>
            <LayoutDashboard size={15} aria-hidden="true" /> Dashboard
          </button>
          <button className="btn btn-ghost btn-sm" onClick={onLogout}>Sign out</button>
        </>
      ) : (
        <button className="btn btn-primary btn-sm" onClick={onOpenAuth}>
          <LogIn size={15} aria-hidden="true" /> Sign in
        </button>
      )}
    </nav>
  </header>
);
