import React, { useState, useEffect } from 'react';
import Chat from './components/Chat';
import Sidebar from './components/Sidebar';
import Settings from './components/Settings';
import KnowledgeBrowser from './components/KnowledgeBrowser';
import Onboarding from './components/Onboarding';
import AuthScreen from './components/AuthScreen';
import MobileNav from './components/MobileNav';
import MobileHistory from './components/MobileHistory';
import type { Settings as SettingsType } from '../shared/types';
import { getKeelAPI, loadTokens, isAuthenticated, setOnAuthExpired, logout } from '../lib/api-client';
import { useIsMobile } from '../lib/useIsMobile';

type ActiveView = 'chat' | 'settings' | 'knowledge' | 'history';

// Determine if we're running in Electron (IPC bridge) or web/Capacitor mode
const isElectron = typeof window !== 'undefined' && !!(window as any).keel;

// In web/Capacitor mode, set window.keel to the HTTP API client so all
// existing components work without modification.
if (!isElectron) {
  (window as any).keel = getKeelAPI();
}

export default function App() {
  const [newChatSignal, setNewChatSignal] = useState(0);
  const [loadSessionId, setLoadSessionId] = useState<string | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState('');
  const [refreshSidebar, setRefreshSidebar] = useState(0);
  const [activeView, setActiveView] = useState<ActiveView>('chat');
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);
  const [initialSettings, setInitialSettings] = useState<SettingsType | null>(null);
  const [needsAuth, setNeedsAuth] = useState<boolean | null>(null);
  const isMobile = useIsMobile();

  // In web mode, check if user is authenticated
  useEffect(() => {
    if (isElectron) {
      setNeedsAuth(false);
      return;
    }
    loadTokens();
    setNeedsAuth(!isAuthenticated());

    // Listen for auth expiry (e.g. refresh token expired)
    setOnAuthExpired(() => {
      setNeedsAuth(true);
    });
  }, []);

  // Check if onboarding is needed (no API key configured for any provider)
  useEffect(() => {
    if (needsAuth !== false) return; // Wait until auth is resolved
    window.keel.getSettings().then((s) => {
      setInitialSettings(s);
      const hasKey = s.anthropicApiKey || s.openaiApiKey || s.openrouterApiKey;
      const isOllama = s.provider === 'ollama';
      setShowOnboarding(!hasKey && !isOllama);
    }).catch(() => {
      setShowOnboarding(true);
    });
  }, [needsAuth]);

  const handleOnboardingComplete = () => {
    setShowOnboarding(false);
  };

  const handleNewChat = () => {
    setLoadSessionId(null);
    setNewChatSignal((n) => n + 1);
    setActiveView('chat');
  };

  const handleSelectSession = (id: string) => {
    setLoadSessionId(id);
    setActiveView('chat');
  };

  const handleSessionChange = (id: string) => {
    setCurrentSessionId(id);
    setRefreshSidebar((n) => n + 1);
  };

  // Loading state
  if (needsAuth === null || (needsAuth === false && showOnboarding === null)) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1a1a1a' }} />
    );
  }

  // Auth screen (web/Capacitor mode only)
  if (needsAuth) {
    return (
      <AuthScreen
        onAuthenticated={() => {
          setNeedsAuth(false);
        }}
      />
    );
  }

  // Onboarding
  if (showOnboarding && initialSettings) {
    return <Onboarding initialSettings={initialSettings} onComplete={handleOnboardingComplete} />;
  }

  // Mobile layout: vertical with bottom nav
  if (isMobile) {
    return (
      <div style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: '#1a1a1a',
      }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {activeView === 'chat' && (
            <Chat
              newChatSignal={newChatSignal}
              loadSessionId={loadSessionId}
              onSessionChange={handleSessionChange}
            />
          )}
          {activeView === 'history' && (
            <MobileHistory
              onSelectSession={(id) => {
                handleSelectSession(id);
                setActiveView('chat');
              }}
              refreshSignal={refreshSidebar}
            />
          )}
          {activeView === 'settings' && (
            <Settings onBack={() => setActiveView('chat')} />
          )}
          {activeView === 'knowledge' && (
            <KnowledgeBrowser onBack={() => setActiveView('chat')} />
          )}
        </div>
        <MobileNav
          activeView={activeView}
          onNavigate={setActiveView}
          onNewChat={handleNewChat}
        />
      </div>
    );
  }

  // Desktop layout: sidebar + main content
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'row', background: '#1a1a1a' }}>
      <Sidebar
        currentSessionId={currentSessionId}
        onSelectSession={handleSelectSession}
        onNewChat={handleNewChat}
        refreshSignal={refreshSidebar}
        activeView={activeView}
        onNavigate={setActiveView}
      />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {activeView === 'chat' && (
          <Chat
            newChatSignal={newChatSignal}
            loadSessionId={loadSessionId}
            onSessionChange={handleSessionChange}
          />
        )}
        {activeView === 'settings' && (
          <Settings onBack={() => setActiveView('chat')} />
        )}
        {activeView === 'knowledge' && (
          <KnowledgeBrowser onBack={() => setActiveView('chat')} />
        )}
      </div>
    </div>
  );
}
