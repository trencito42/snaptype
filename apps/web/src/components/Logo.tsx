import React from 'react';
import logoUrl from '../assets/logo.svg';

/** The approved SnapType mark (rounded app-icon form of the supplied artwork). */
export const LogoMark: React.FC<{ size?: number }> = ({ size = 32 }) => (
  <img src={logoUrl} width={size} height={size} alt="SnapType" decoding="async" style={{ display: 'block', borderRadius: size * 0.227 }} />
);

export const Wordmark: React.FC = () => <span className="wordmark">snap<b>type</b></span>;
