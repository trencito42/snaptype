import React, { useState, useEffect } from 'react';
import { api } from './api.js';
import { Navbar } from './components/Navbar.js';
import { LandingPage } from './pages/LandingPage.js';
import { Dashboard } from './pages/Dashboard.js';
import { AuthModal } from './pages/AuthModal.js';
import { SettingsModal } from './pages/SettingsModal.js';
import { ImportExportModal } from './pages/ImportExportModal.js';
import { TestGround } from './pages/TestGround.js';
import { InstallGuide } from './pages/InstallGuide.js';
import { PrivacyPolicy } from './pages/PrivacyPolicy.js';
import { TermsOfService } from './pages/TermsOfService.js';
import { AcceptInvitationPage } from './pages/AcceptInvitationPage.js';

export const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<'landing' | 'dashboard' | 'test-ground' | 'install' | 'privacy' | 'terms'>('landing');
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => api.isAuthenticated());
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authPrefilledEmail, setAuthPrefilledEmail] = useState<string | undefined>(undefined);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isImportExportOpen, setIsImportExportOpen] = useState(false);
  const [dashboardRefreshKey, setDashboardRefreshKey] = useState(0);
  const [inviteToken, setInviteToken] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('token');
    }
    return null;
  });

  useEffect(() => {
    // If authenticated on load, default view can be dashboard or landing
    if (api.isAuthenticated()) {
      setIsAuthenticated(true);
      if (!inviteToken) {
        setCurrentView('dashboard');
      }
    }

    const handleUnauthorized = () => {
      setIsAuthenticated(false);
      setCurrentView('landing');
      setIsAuthModalOpen(true);
    };

    window.addEventListener('snaptype:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('snaptype:unauthorized', handleUnauthorized);
  }, [inviteToken]);

  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
    setIsAuthModalOpen(false);
    if (!inviteToken) {
      setCurrentView('dashboard');
    }
  };

  const handleLogout = async () => {
    await api.logout();
    setIsAuthenticated(false);
    setCurrentView('landing');
  };

  const handleOpenAuth = (prefilledEmail?: string) => {
    setAuthPrefilledEmail(prefilledEmail);
    setIsAuthModalOpen(true);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navbar
        currentView={currentView}
        onNavigate={(view: any) => {
          if (inviteToken) {
            setInviteToken(null);
            window.history.replaceState({}, '', '/');
          }
          setCurrentView(view);
        }}
        isAuthenticated={isAuthenticated}
        onOpenAuth={() => handleOpenAuth()}
        onLogout={handleLogout}
      />

      <main style={{ flex: 1 }}>
        {inviteToken ? (
          <AcceptInvitationPage
            token={inviteToken}
            isAuthenticated={isAuthenticated}
            onOpenAuth={(email) => handleOpenAuth(email)}
            onAccepted={(workspaceId) => {
              setInviteToken(null);
              window.history.replaceState({}, '', '/');
              setIsAuthenticated(true);
              setCurrentView('dashboard');
              setDashboardRefreshKey((k) => k + 1);
            }}
            onCancel={() => {
              setInviteToken(null);
              window.history.replaceState({}, '', '/');
              setCurrentView(isAuthenticated ? 'dashboard' : 'landing');
            }}
          />
        ) : (
          <>
            {currentView === 'landing' && (
              <LandingPage
                onOpenAuth={() => handleOpenAuth()}
                onNavigate={(view: any) => setCurrentView(view)}
              />
            )}

            {currentView === 'dashboard' && (
              isAuthenticated ? (
                <Dashboard
                  key={dashboardRefreshKey}
                  onOpenSettings={() => setIsSettingsOpen(true)}
                  onOpenImportExport={() => setIsImportExportOpen(true)}
                  onLogout={handleLogout}
                />
              ) : (
                <LandingPage
                  onOpenAuth={() => handleOpenAuth()}
                  onNavigate={(view: any) => setCurrentView(view)}
                />
              )
            )}

            {currentView === 'test-ground' && <TestGround />}
            {currentView === 'install' && <InstallGuide />}
            {currentView === 'privacy' && <PrivacyPolicy />}
            {currentView === 'terms' && <TermsOfService />}
          </>
        )}
      </main>

      {/* Modals */}
      <AuthModal
        isOpen={isAuthModalOpen}
        initialEmail={authPrefilledEmail}
        onClose={() => setIsAuthModalOpen(false)}
        onSuccess={handleLoginSuccess}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

      <ImportExportModal
        isOpen={isImportExportOpen}
        onClose={() => setIsImportExportOpen(false)}
        onSuccess={() => setDashboardRefreshKey((k) => k + 1)}
      />
    </div>
  );
};

