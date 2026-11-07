import React from 'react';
import { FileText } from 'lucide-react';

export const TermsOfService: React.FC = () => {
  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '40px 24px 100px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <FileText size={28} color="#166534" />
        <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: -0.5 }}>
          Terms of Service
        </h1>
      </div>
      <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 32 }}>
        Effective Date: November 2026. Self-hosted and managed operations for SnapType.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 24, fontSize: 14, lineHeight: 1.7, color: 'var(--text-secondary)' }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>
            1. Purpose and Scope
          </h2>
          <p>
            SnapType provides a high-performance text expansion and templating engine designed for customer support representatives, operations teams, and professionals. By accessing or using SnapType (including the self-hosted platform, web application, and browser extensions), you agree to be bound by these terms.
          </p>
        </div>

        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>
            2. Permitted Use and Self-Hosting
          </h2>
          <p>
            SnapType is provided as free, open-source-friendly software. You are permitted to deploy, configure, and self-host the software within your own infrastructure without artificial subscription tiers or artificial seat limits. You are responsible for securing your database credentials, server certificates, and access tokens.
          </p>
        </div>

        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>
            3. Account Authentication & Security
          </h2>
          <p>
            Authentication is conducted using email one-time passcodes (OTP). You are responsible for maintaining the confidentiality of your email inbox and for all activities that occur under your account sessions. If you suspect unauthorized access to your account, you must terminate active sessions and notify your administrator.
          </p>
        </div>

        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>
            4. User-Generated Snippets and Data
          </h2>
          <p>
            You retain full ownership of all text snippets, templates, folder hierarchies, and lookup tables created in SnapType. We do not claim any intellectual property rights over the responses you compose or insert through the software.
          </p>
        </div>

        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>
            5. Limitation of Liability
          </h2>
          <p>
            SnapType is provided &ldquo;as is&rdquo;, without warranty of any kind, express or implied. Under no circumstances shall the authors or copyright holders be liable for any direct, indirect, incidental, or consequential damages arising from the use of or inability to use the platform.
          </p>
        </div>
      </div>
    </div>
  );
};

