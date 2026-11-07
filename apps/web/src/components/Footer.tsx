import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faGithub } from '@fortawesome/free-brands-svg-icons';
import { LogoMark, Wordmark } from './Logo.js';

export const Footer: React.FC<{ onNavigate: (view: string) => void }> = ({ onNavigate }) => (
  <footer className="site-footer">
    <div className="site-footer-card">
      <div className="footer-brand">
        <div className="footer-logo"><LogoMark size={36} decorative /><Wordmark /></div>
        <p>Text expansion for Chrome and Firefox.</p>
        <a className="footer-gh" href="https://github.com/trencito42/snaptype" rel="noopener noreferrer" aria-label="SnapType on GitHub">
          <FontAwesomeIcon icon={faGithub} /> GitHub
        </a>
      </div>
      <nav aria-label="Product" className="footer-col">
        <h2>Product</h2>
        <button onClick={() => onNavigate('install')}>Install the extension</button>
        <button onClick={() => onNavigate('test-ground')}>Test playground</button>
      </nav>
      <nav aria-label="Legal and support" className="footer-col">
        <h2>Legal &amp; support</h2>
        <button onClick={() => onNavigate('privacy')}>Privacy</button>
        <button onClick={() => onNavigate('terms')}>Terms</button>
        <a href="https://github.com/trencito42/snaptype/issues" rel="noopener noreferrer">Report an issue</a>
      </nav>
    </div>
  </footer>
);
