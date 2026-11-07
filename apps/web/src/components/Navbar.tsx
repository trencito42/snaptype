import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faGrip, faRightToBracket } from '@fortawesome/free-solid-svg-icons';
import { LogoMark, Wordmark } from './Logo.js';

interface NavbarProps {
  currentView: string;
  onNavigate: (view: string) => void;
  isAuthenticated: boolean;
  onOpenAuth: () => void;
  onLogout: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentView, onNavigate, isAuthenticated, onOpenAuth, onLogout }) => (
  <header className={`site-header${isAuthenticated && currentView === 'dashboard' ? ' site-header-app' : ''}`}>
    <div className="site-header-bar">
      <button className="brand" onClick={() => onNavigate('landing')} aria-label="SnapType home">
        <LogoMark size={34} decorative />
        <Wordmark />
      </button>

      <nav className="site-nav" aria-label="Main">
        <button className="nav-link hide-sm hide-app" onClick={() => onNavigate('install')} aria-current={currentView === 'install' ? 'page' : undefined}>
          Install
        </button>
        <button className="nav-link hide-sm hide-app" onClick={() => onNavigate('test-ground')} aria-current={currentView === 'test-ground' ? 'page' : undefined}>
          Playground
        </button>
        {isAuthenticated ? (
          <>
            <button className="nav-link hide-xs" onClick={onLogout}>Sign out</button>
            <button className="pill pill-lime" onClick={() => onNavigate('dashboard')}>
              <FontAwesomeIcon icon={faGrip} aria-hidden="true" /> Dashboard
            </button>
          </>
        ) : (
          <>
            <button className="pill pill-lime" onClick={onOpenAuth}>
              <FontAwesomeIcon icon={faRightToBracket} aria-hidden="true" /> Sign in
            </button>
          </>
        )}
      </nav>
    </div>
  </header>
);
