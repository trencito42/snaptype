import React from 'react';
import { LogoMark, Wordmark } from './Logo.js';

export const Footer: React.FC<{ onNavigate: (view: string) => void }> = ({ onNavigate }) => (
  <footer className="site-footer">
    <div className="site-footer-in">
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <LogoMark size={22} /><Wordmark />
        </div>
        <p>Text expansion for Chrome and Firefox.</p>
      </div>
      <nav aria-label="Footer">
        <button className="fl" onClick={() => onNavigate('install')}>Install the extension</button>
        <button className="fl" onClick={() => onNavigate('test-ground')}>Test playground</button>
        <button className="fl" onClick={() => onNavigate('privacy')}>Privacy</button>
        <button className="fl" onClick={() => onNavigate('terms')}>Terms</button>
        <a href="https://github.com/trencito42/snaptype" rel="noopener noreferrer">Source on GitHub</a>
        <a href="https://github.com/trencito42/snaptype/issues" rel="noopener noreferrer">Report an issue</a>
      </nav>
    </div>
  </footer>
);
