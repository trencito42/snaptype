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

export const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<'landing' | 'dashboard' | 'test-ground' | 'install' | 'privacy' | 'terms'>('landing');
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => api.isAuthenticated());
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isImportExportOpen, setIsImportExportOpen] = useState(false);
  const [dashboardRefreshKey, setDashboardRefreshKey] = useState(0);

  useEffect(() => {
    // If authenticated on load, default view can be dashboard or landing
    if (api.isAuthenticated()) {
      setIsAuthenticated(true);
      setCurrentView('dashboard');
    }

    const handleUnauthorized = () => {
      setIsAuthenticated(false);
      setCurrentView('landing');
      setIsAuthModalOpen(true);
    };

    window.addEventListener('snaptype:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('snaptype:unauthorized', handleUnauthorized);
  }, []);

  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
    setCurrentView('dashboard');
  };

  const handleLogout = async () => {
    await api.logout();
    setIsAuthenticated(false);
    setCurrentView('landing');
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navbar
        currentView={currentView}
        onNavigate={(view: any) => setCurrentView(view)}
        isAuthenticated={isAuthenticated}
        onOpenAuth={() => setIsAuthModalOpen(true)}
        onLogout={handleLogout}
      />

      <main style={{ flex: 1 }}>
        {currentView === 'landing' && (
          <LandingPage
            onOpenAuth={() => setIsAuthModalOpen(true)}
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
              onOpenAuth={() => setIsAuthModalOpen(true)}
              onNavigate={(view: any) => setCurrentView(view)}
            />
          )
        )}

        {currentView === 'test-ground' && <TestGround />}
        {currentView === 'install' && <InstallGuide />}
        {currentView === 'privacy' && <PrivacyPolicy />}
        {currentView === 'terms' && <TermsOfService />}
      </main>

      {/* Modals */}
      <AuthModal
        isOpen={isAuthModalOpen}
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

