import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Chat from './components/Chat';
import Sidebar, { type DesktopView, type WikiNavId, type WikiSidebarState } from './components/Sidebar';
import Settings, { type SettingsNavigationState } from './components/Settings';
import WikiWorkspace, { type WikiCommand } from './components/WikiWorkspace';
import Onboarding from './components/Onboarding';
import DesktopTopBar from './components/DesktopTopBar';
import PlaceholderPane from './components/PlaceholderPane';
import Inbox from './components/Inbox';
import Dashboard from './components/Dashboard';
import ChatsIndex from './components/ChatsIndex';
import type { Settings as SettingsType } from '../shared/types';
import { applyTheme } from './theme';
import {
  CHAT_UNREAD_STORAGE_KEY,
  addUnreadSessionId,
  loadUnreadSessionIds,
  removeUnreadSessionId,
  type SessionIndicatorState,
} from './sessionState';
import {
  consumeForceOnboardingFlag,
  FORCE_ONBOARDING_ONCE_KEY,
  shouldShowOnboarding,
} from './onboarding';

type DesktopMode = 'chat' | 'wiki' | 'home';

function clampSidebarWidth(value: number): number {
  return Math.min(360, Math.max(228, value));
}

function SearchStub() {
  return (
    <PlaceholderPane
      eyebrow="Global Search"
      title="Search across chats, context, and team memory"
      description="Search is wired into navigation now. The result canvas is still a shell, but the layout is ready for ranked hits, source previews, and command-style jump actions."
      secondary={(
        <>
          <div className="shell-searchbar is-disabled">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input value="" readOnly placeholder="Search Keel..." />
          </div>

          <div className="stub-grid">
            <div className="stub-card">
              <div className="stub-card__label">Planned</div>
              <div className="stub-card__title">Unified results</div>
              <div className="stub-card__text">Chats, notes, project docs, and team updates in one ranked stream.</div>
            </div>
            <div className="stub-card">
              <div className="stub-card__label">Planned</div>
              <div className="stub-card__title">Keyboard-first flow</div>
              <div className="stub-card__text">Fast jump targets, recent queries, and scoped search by source.</div>
            </div>
          </div>
        </>
      )}
    />
  );
}

export default function App() {
  const [newChatSignal, setNewChatSignal] = useState(0);
  const [loadSessionId, setLoadSessionId] = useState<string | null>(null);
  const [chatDraft, setChatDraft] = useState<string | undefined>(undefined);
  const [currentSessionId, setCurrentSessionId] = useState('');
  const [refreshSidebar, setRefreshSidebar] = useState(0);
  const [desktopView, setDesktopView] = useState<DesktopView>('dashboard');
  const [desktopMode, setDesktopMode] = useState<DesktopMode>('home');
  const [wikiContextOpen, setWikiContextOpen] = useState(false);
  const [wikiSidebarState, setWikiSidebarState] = useState<WikiSidebarState | null>(null);
  const [wikiCommand, setWikiCommand] = useState<WikiCommand | null>(null);
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);
  const [initialSettings, setInitialSettings] = useState<SettingsType | null>(null);
  const [settingsNavigation, setSettingsNavigation] = useState<SettingsNavigationState>({});
  const [autoSidebarCollapsed, setAutoSidebarCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 1120;
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('keel.sidebar.collapsed') === '1';
  });
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return 272;
    const stored = Number(window.localStorage.getItem('keel.sidebar.width'));
    return Number.isFinite(stored) ? clampSidebarWidth(stored) : 272;
  });
  const [desktopHistory, setDesktopHistory] = useState<{ entries: DesktopView[]; index: number }>({
    entries: ['dashboard'],
    index: 0,
  });
  const [unreadSessionIds, setUnreadSessionIds] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    return loadUnreadSessionIds(window.localStorage);
  });
  const [streamingSessionIds, setStreamingSessionIds] = useState<Record<string, boolean>>({});
  const sidebarWidthRef = useRef(sidebarWidth);
  const expandedSidebarWidthRef = useRef(sidebarWidth);
  const desktopHistoryRef = useRef(desktopHistory);
  const currentSessionIdRef = useRef(currentSessionId);
  const streamingSessionIdsRef = useRef(streamingSessionIds);
  const effectiveSidebarCollapsed = sidebarCollapsed || autoSidebarCollapsed;
  const chatVisible = desktopView === 'chat';

  useEffect(() => {
    sidebarWidthRef.current = sidebarWidth;
    if (!effectiveSidebarCollapsed) {
      expandedSidebarWidthRef.current = sidebarWidth;
    }
  }, [effectiveSidebarCollapsed, sidebarWidth]);

  useEffect(() => {
    desktopHistoryRef.current = desktopHistory;
  }, [desktopHistory]);

  useEffect(() => {
    currentSessionIdRef.current = currentSessionId;
  }, [currentSessionId]);

  useEffect(() => {
    streamingSessionIdsRef.current = streamingSessionIds;
  }, [streamingSessionIds]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('keel.sidebar.collapsed', sidebarCollapsed ? '1' : '0');
  }, [sidebarCollapsed]);

  useEffect(() => {
    if (typeof window === 'undefined' || effectiveSidebarCollapsed) return;
    window.localStorage.setItem('keel.sidebar.width', String(sidebarWidth));
  }, [effectiveSidebarCollapsed, sidebarWidth]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(CHAT_UNREAD_STORAGE_KEY, JSON.stringify(unreadSessionIds));
  }, [unreadSessionIds]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onResize = () => setAutoSidebarCollapsed(window.innerWidth < 1120);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !import.meta.env.DEV) return;

    (window as any).keelDebug = {
      forceOnboardingOnce: () => {
        window.localStorage.setItem(FORCE_ONBOARDING_ONCE_KEY, '1');
        window.location.reload();
      },
    };
  }, []);

  useEffect(() => {
    window.keel.getSettings().then((settings) => {
      applyTheme(settings.theme);
      setInitialSettings(settings);
      const forceOnboarding = import.meta.env.DEV
        ? consumeForceOnboardingFlag(window.localStorage)
        : false;
      setShowOnboarding(shouldShowOnboarding(settings, { forceOnboarding }));
    }).catch(() => {
      setShowOnboarding(true);
    });
  }, []);

  useEffect(() => {
    const syncThemeFromSettings = () => {
      window.keel.getSettings().then((settings) => {
        applyTheme(settings.theme);
      }).catch(() => {});
    };

    const mediaQuery = typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)')
      : null;

    syncThemeFromSettings();
    window.addEventListener('focus', syncThemeFromSettings);
    mediaQuery?.addEventListener?.('change', syncThemeFromSettings);

    return () => {
      window.removeEventListener('focus', syncThemeFromSettings);
      mediaQuery?.removeEventListener?.('change', syncThemeFromSettings);
    };
  }, []);

  const navigateDesktop = useCallback((
    nextView: DesktopView,
    options: { mode?: DesktopMode; pushHistory?: boolean } = {},
  ) => {
    const { mode, pushHistory = true } = options;
    setDesktopView(nextView);
    if (mode) {
      setDesktopMode(mode);
    }
    if (!pushHistory) return;

    const currentHistory = desktopHistoryRef.current;
    const baseEntries = currentHistory.entries.slice(0, currentHistory.index + 1);
    if (baseEntries[baseEntries.length - 1] === nextView) return;

    const entries = [...baseEntries, nextView].slice(-40);
    const nextHistory = { entries, index: entries.length - 1 };
    desktopHistoryRef.current = nextHistory;
    setDesktopHistory(nextHistory);
  }, []);

  const handleOnboardingComplete = (settings: SettingsType) => {
    setInitialSettings(settings);
    setShowOnboarding(false);
  };

  const markSessionUnread = useCallback((sessionId: string) => {
    setUnreadSessionIds((ids) => addUnreadSessionId(ids, sessionId));
  }, []);

  const markSessionRead = useCallback((sessionId: string) => {
    setUnreadSessionIds((ids) => removeUnreadSessionId(ids, sessionId));
  }, []);

  const markCurrentSessionUnreadIfStreaming = useCallback((nextSessionId?: string) => {
    const activeSessionId = currentSessionIdRef.current;
    if (!activeSessionId || activeSessionId === nextSessionId) return;
    if (!streamingSessionIdsRef.current[activeSessionId]) return;
    markSessionUnread(activeSessionId);
  }, [markSessionUnread]);

  const handleSessionStreamStateChange = useCallback((sessionId: string, isStreaming: boolean) => {
    if (isStreaming) {
      streamingSessionIdsRef.current = { ...streamingSessionIdsRef.current, [sessionId]: true };
    } else if (streamingSessionIdsRef.current[sessionId]) {
      const next = { ...streamingSessionIdsRef.current };
      delete next[sessionId];
      streamingSessionIdsRef.current = next;
    }

    setStreamingSessionIds((previous) => {
      if (isStreaming) {
        if (previous[sessionId]) return previous;
        return { ...previous, [sessionId]: true };
      }

      if (!previous[sessionId]) return previous;
      const next = { ...previous };
      delete next[sessionId];
      return next;
    });
    setRefreshSidebar((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!chatVisible || !currentSessionId) return;
    markSessionRead(currentSessionId);
  }, [chatVisible, currentSessionId, markSessionRead]);

  const handleNewChat = () => {
    markCurrentSessionUnreadIfStreaming();
    setLoadSessionId(null);
    setCurrentSessionId('');
    currentSessionIdRef.current = '';
    setChatDraft(undefined);
    setNewChatSignal((value) => value + 1);
    navigateDesktop('chat', { mode: 'chat' });
  };

  const handleNewChatWithDraft = (draft: string) => {
    markCurrentSessionUnreadIfStreaming();
    setLoadSessionId(null);
    setCurrentSessionId('');
    currentSessionIdRef.current = '';
    setChatDraft(draft);
    setNewChatSignal((value) => value + 1);
    navigateDesktop('chat', { mode: 'chat' });
  };

  const handleSelectSession = (id: string) => {
    markCurrentSessionUnreadIfStreaming(id);
    setLoadSessionId(id);
    navigateDesktop('chat', { mode: 'chat' });
  };

  const handleSessionChange = (id: string) => {
    currentSessionIdRef.current = id;
    setCurrentSessionId(id);
    setRefreshSidebar((value) => value + 1);
  };

  const stepDesktopHistory = useCallback((direction: -1 | 1) => {
    const currentHistory = desktopHistoryRef.current;
    const nextIndex = currentHistory.index + direction;
    if (nextIndex < 0 || nextIndex >= currentHistory.entries.length) return;

    const nextView = currentHistory.entries[nextIndex];
    if (nextView !== 'chat') {
      markCurrentSessionUnreadIfStreaming();
    }
    const nextHistory = { ...currentHistory, index: nextIndex };
    desktopHistoryRef.current = nextHistory;
    setDesktopHistory(nextHistory);
    setDesktopView(nextView);

    if (nextView === 'dashboard') {
      setDesktopMode('home');
    } else if (nextView === 'chat' || nextView === 'chats') {
      setDesktopMode('chat');
    } else if (nextView === 'wiki') {
      setDesktopMode('wiki');
    }
  }, [markCurrentSessionUnreadIfStreaming]);

  const openWikiLanding = useCallback(() => {
    setWikiCommand({ type: 'nav', target: 'home', nonce: Date.now() });
  }, []);

  const handleDesktopModeChange = (mode: DesktopMode) => {
    // Always navigate to the mode's default view, even if already active.
    // This lets users click the active tab to return from overlay views
    // (e.g. Tasks, Search, Settings) back to the mode's main content.
    if (mode === 'home') {
      markCurrentSessionUnreadIfStreaming();
      navigateDesktop('dashboard', { mode: 'home' });
      return;
    }
    if (mode === 'chat') {
      navigateDesktop('chat', { mode: 'chat' });
      return;
    }
    markCurrentSessionUnreadIfStreaming();
    openWikiLanding();
    navigateDesktop('wiki', { mode: 'wiki' });
  };

  const openSettings = useCallback((navigation: SettingsNavigationState = {}) => {
    markCurrentSessionUnreadIfStreaming();
    setSettingsNavigation(navigation);
    navigateDesktop('settings');
  }, [markCurrentSessionUnreadIfStreaming, navigateDesktop]);

  const handleDesktopNavigation = (view: DesktopView) => {
    if (view === 'settings') {
      openSettings();
      return;
    }

    if (view !== 'chat') {
      markCurrentSessionUnreadIfStreaming();
    }

    // Only update the top mode tab for views that belong to a mode.
    // Sidebar-only views (inbox, search, etc.) overlay the current mode
    // so the user can click the active top tab to return.
    const modeViews: Record<string, DesktopMode> = {
      wiki: 'wiki',
      chat: 'chat',
      chats: 'chat',
      dashboard: 'home',
    };
    const mode = modeViews[view];

    if (view === 'wiki') {
      openWikiLanding();
    }
    navigateDesktop(view, { mode });
  };

  const handleSettingsBack = useCallback(() => {
    if (desktopHistoryRef.current.index > 0) {
      stepDesktopHistory(-1);
      return;
    }

    navigateDesktop('chat', { mode: 'chat', pushHistory: false });
  }, [navigateDesktop, stepDesktopHistory]);

  const handleWikiNavigate = (nav: WikiNavId) => {
    setWikiCommand({ type: 'nav', target: nav, nonce: Date.now() });
  };

  const handleWikiCreateBase = () => {
    setWikiCommand({ type: 'create-base', target: '', nonce: Date.now() });
  };

  const handleWikiOpenPage = (path: string) => {
    setWikiCommand({ type: 'page', target: path, nonce: Date.now() });
  };

  const handleOpenWikiCitation = useCallback((path: string) => {
    markCurrentSessionUnreadIfStreaming();
    setWikiCommand({ type: 'page', target: path, nonce: Date.now() });
    navigateDesktop('wiki', { mode: 'wiki' });
  }, [markCurrentSessionUnreadIfStreaming, navigateDesktop]);

  const handleToggleSidebar = () => {
    setSidebarCollapsed((previous) => {
      if (previous) {
        setSidebarWidth(expandedSidebarWidthRef.current);
        return false;
      }
      expandedSidebarWidthRef.current = sidebarWidthRef.current;
      return true;
    });
  };

  const startSidebarResize = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (effectiveSidebarCollapsed) return;
    event.preventDefault();

    const startX = event.clientX;
    const startingWidth = sidebarWidthRef.current;

    const onMouseMove = (moveEvent: MouseEvent) => {
      setSidebarWidth(clampSidebarWidth(startingWidth + moveEvent.clientX - startX));
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [effectiveSidebarCollapsed]);

  const sessionIndicators = useMemo<Record<string, SessionIndicatorState>>(() => {
    const unread = new Set(unreadSessionIds);
    const ids = new Set([...Object.keys(streamingSessionIds), ...unread]);

    return Array.from(ids).reduce<Record<string, SessionIndicatorState>>((accumulator, id) => {
      accumulator[id] = {
        isStreaming: Boolean(streamingSessionIds[id]),
        unread: unread.has(id),
      };
      return accumulator;
    }, {});
  }, [streamingSessionIds, unreadSessionIds]);

  const renderDesktopView = () => {
    switch (desktopView) {
      case 'dashboard':
        return (
          <Dashboard
            onNavigateToTasks={() => handleDesktopNavigation('inbox')}
            onNavigateToChat={(sessionId) => handleSelectSession(sessionId)}
            onNewChatWithDraft={handleNewChatWithDraft}
          />
        );
      case 'chat':
        return null;
      case 'search':
        return (
          <ChatsIndex
            currentSessionId={currentSessionId}
            refreshSignal={refreshSidebar}
            onOpenSession={handleSelectSession}
            sessionIndicators={sessionIndicators}
          />
        );
      case 'wiki':
        return (
          <div className="wiki-surface">
            <WikiWorkspace
              showBack={false}
              contextOpen={wikiContextOpen}
              command={wikiCommand}
              onSidebarStateChange={setWikiSidebarState}
            />
          </div>
        );
      case 'inbox':
        return <Inbox />;
      case 'settings':
        return <Settings onBack={handleSettingsBack} navigation={settingsNavigation} />;
      default:
        return null;
    }
  };

  if (showOnboarding === null) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-base)' }} />
    );
  }

  if (showOnboarding && initialSettings) {
    return <Onboarding initialSettings={initialSettings} onComplete={handleOnboardingComplete} />;
  }

  return (
    <div className="desktop-shell">
      <DesktopTopBar
        activeMode={desktopMode}
        canGoBack={desktopHistory.index > 0}
        canGoForward={desktopHistory.index < desktopHistory.entries.length - 1}
        isSidebarCollapsed={effectiveSidebarCollapsed}
        isContextOpen={wikiContextOpen}
        sidebarWidth={effectiveSidebarCollapsed ? 72 : sidebarWidth}
        onGoBack={() => stepDesktopHistory(-1)}
        onGoForward={() => stepDesktopHistory(1)}
        onSetMode={handleDesktopModeChange}
        onToggleSidebar={handleToggleSidebar}
        onToggleContext={() => setWikiContextOpen((value) => !value)}
      />

      <div className="desktop-shell__body">
        <div
          className="desktop-shell__sidebar"
          style={{ width: effectiveSidebarCollapsed ? 'var(--sidebar-collapsed-width)' : sidebarWidth }}
        >
          <Sidebar
            collapsed={effectiveSidebarCollapsed}
            currentSessionId={currentSessionId}
            activeView={desktopView}
            onNavigate={handleDesktopNavigation}
            onNewChat={handleNewChat}
            onSelectSession={handleSelectSession}
            refreshSignal={refreshSidebar}
            sessionIndicators={sessionIndicators}
            wikiState={wikiSidebarState}
            onWikiNavigate={handleWikiNavigate}
            onWikiOpenPage={handleWikiOpenPage}
            onWikiCreateBase={handleWikiCreateBase}
          />
          {!effectiveSidebarCollapsed && (
            <div
              className="desktop-sidebar__resize-handle"
              onMouseDown={startSidebarResize}
            />
          )}
        </div>

        <div className="desktop-shell__content">
          <div className={desktopView === 'chat' ? 'app-view' : 'app-view is-hidden'}>
            <Chat
              newChatSignal={newChatSignal}
              loadSessionId={loadSessionId}
              initialDraft={chatDraft}
              onSessionChange={handleSessionChange}
              onSessionStreamStateChange={handleSessionStreamStateChange}
              onOpenWikiPage={handleOpenWikiCitation}
            />
          </div>
          {desktopView !== 'chat' && renderDesktopView()}
        </div>
      </div>
    </div>
  );
}
