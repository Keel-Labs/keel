import React, { useEffect, useMemo, useState } from 'react';
import type { SessionIndicatorState } from '../sessionState';
import SessionStatusIndicator from './SessionStatusIndicator';
interface Session {
  id: string;
  title: string;
  updatedAt: number;
}

export type DesktopView = 'dashboard' | 'chat' | 'search' | 'chats' | 'wiki' | 'inbox' | 'meetings' | 'settings';
// Note: 'dashboard' is routed via the top mode-switcher, not the sidebar nav
export type WikiNavId = 'home' | 'synthesis';

export interface WikiSidebarBranch {
  id: string;
  label: string;
  path?: string;
  children?: Array<{ path: string; label: string }>;
}

export interface WikiSidebarState {
  activeNav: WikiNavId;
  selectedPagePath: string | null;
  branches: WikiSidebarBranch[];
}

interface Props {
  collapsed: boolean;
  currentSessionId: string;
  activeView: DesktopView;
  onNavigate: (view: DesktopView) => void;
  onNewChat: () => void;
  onSelectSession: (id: string) => void;
  refreshSignal: number;
  sessionIndicators?: Record<string, SessionIndicatorState>;
  wikiState?: WikiSidebarState | null;
  onWikiNavigate?: (nav: WikiNavId) => void;
  onWikiOpenPage?: (path: string) => void;
  onWikiCreateBase?: () => void;
}

function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function TeamIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="8.5" cy="7" r="4" />
      <path d="M20 8v6" />
      <path d="M23 11h-6" />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function InboxIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 12h-6l-2 3H10l-2-3H2" />
      <path d="M5 5h14l3 7v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8Z" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2" width="6" height="11" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="19" x2="12" y2="22" />
      <line x1="9" y1="22" x2="15" y2="22" />
    </svg>
  );
}

const PRIMARY_ITEMS: Array<{
  id: DesktopView;
  label: string;
  icon: React.ReactNode;
}> = [
  { id: 'search', label: 'Search', icon: <SearchIcon /> },
  { id: 'inbox', label: 'Tasks', icon: <InboxIcon /> },
  { id: 'meetings', label: 'Meetings', icon: <MicIcon /> },
];

const WIKI_ITEMS: Array<{ id: WikiNavId; label: string; icon: React.ReactNode }> = [
  { id: 'home', label: 'All Bases', icon: <BookIcon /> },
];

function NavRow({
  active,
  collapsed,
  icon,
  label,
  onClick,
}: {
  active?: boolean;
  collapsed: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={active ? 'desktop-sidebar__nav is-active' : 'desktop-sidebar__nav'}
      style={{ justifyContent: collapsed ? 'center' : 'flex-start' }}
    >
      <span className="desktop-sidebar__nav-icon">{icon}</span>
      {!collapsed && <span>{label}</span>}
    </button>
  );
}

function WikiBranch({
  branch,
  selectedPagePath,
  onOpenPage,
}: {
  branch: WikiSidebarBranch;
  selectedPagePath: string | null;
  onOpenPage?: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isLeaf = !branch.children || branch.children.length === 0;
  const childIsActive = branch.children?.some((child) => child.path === selectedPagePath) || false;
  const branchIsActive = branch.path === selectedPagePath || childIsActive;

  useEffect(() => {
    if (childIsActive) {
      setExpanded(true);
    }
  }, [childIsActive]);

  return (
    <div className="desktop-sidebar__wiki-branch">
      <button
        className={branchIsActive ? 'desktop-sidebar__wiki-parent is-active' : 'desktop-sidebar__wiki-parent'}
        onClick={() => {
          if (isLeaf && branch.path && onOpenPage) {
            onOpenPage(branch.path);
            return;
          }
          setExpanded((value) => !value);
        }}
      >
        {!isLeaf && (
          <span className="desktop-sidebar__wiki-parent-icon">
            {expanded ? '▾' : '▸'}
          </span>
        )}
        <span>{branch.label}</span>
      </button>

      {!isLeaf && expanded && (
        <div className="desktop-sidebar__wiki-children">
          {branch.children?.slice(0, 12).map((child) => {
            const active = child.path === selectedPagePath;
            return (
              <button
                key={child.path}
                className={active ? 'desktop-sidebar__wiki-child is-active' : 'desktop-sidebar__wiki-child'}
                onClick={() => onOpenPage?.(child.path)}
              >
                {child.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function Sidebar({
  collapsed,
  currentSessionId,
  activeView,
  onNavigate,
  onNewChat,
  onSelectSession,
  refreshSignal,
  sessionIndicators,
  wikiState,
  onWikiNavigate,
  onWikiOpenPage,
  onWikiCreateBase,
}: Props) {
  const [sessions, setSessions] = useState<Session[]>([]);

  useEffect(() => {
    window.keel.listSessions().then(setSessions).catch(() => {});
  }, [refreshSignal, currentSessionId]);

  const recentSessions = sessions;
  const isWikiMode = activeView === 'wiki';

  return (
    <div className={collapsed ? 'desktop-sidebar is-collapsed' : 'desktop-sidebar'}>
      <div className="desktop-sidebar__section">
        <button
          onClick={isWikiMode ? onWikiCreateBase : onNewChat}
          title={collapsed ? (isWikiMode ? 'New base' : 'New chat') : undefined}
          className="desktop-sidebar__new-chat desktop-sidebar__nav"
          style={{ justifyContent: collapsed ? 'center' : 'flex-start' }}
        >
          <span className="desktop-sidebar__nav-icon">
            <PlusIcon />
          </span>
          {!collapsed && <span>{isWikiMode ? 'New Base' : 'New Chat'}</span>}
        </button>
      </div>

      <div className="desktop-sidebar__section" style={{ gap: 4 }}>
        {isWikiMode
          ? WIKI_ITEMS.map((item) => (
            <NavRow
              key={item.id}
              active={wikiState?.activeNav === item.id}
              collapsed={collapsed}
              icon={item.icon}
              label={item.label}
              onClick={() => onWikiNavigate?.(item.id)}
            />
          ))
          : PRIMARY_ITEMS.map((item) => (
            <NavRow
              key={item.id}
              active={activeView === item.id}
              collapsed={collapsed}
              icon={item.icon}
              label={item.label}
              onClick={() => onNavigate(item.id)}
            />
          ))}
      </div>

      {!collapsed && isWikiMode && wikiState?.branches && wikiState.branches.length > 0 && (
        <div className="desktop-sidebar__history">
          <div className="desktop-sidebar__label">Bases</div>
          {wikiState.branches.map((branch) => (
            <WikiBranch
              key={branch.id}
              branch={branch}
              selectedPagePath={wikiState.selectedPagePath}
              onOpenPage={onWikiOpenPage}
            />
          ))}
        </div>
      )}

      {!collapsed && !isWikiMode && (
        <div className="desktop-sidebar__history">
          <div className="desktop-sidebar__label">Recents</div>
          {recentSessions.map((session) => {
            const active = activeView === 'chat' && session.id === currentSessionId;
            const indicator = sessionIndicators?.[session.id];
            return (
              <button
                key={session.id}
                onClick={() => onSelectSession(session.id)}
                className={active ? 'desktop-sidebar__session is-active' : 'desktop-sidebar__session'}
              >
                <SessionStatusIndicator
                  indicator={indicator}
                  className="desktop-sidebar__session-indicator"
                />
                <span className="desktop-sidebar__session-title">{session.title}</span>
              </button>
            );
          })}

          {recentSessions.length === 0 && (
            <div className="desktop-sidebar__empty">
              No conversations yet.
            </div>
          )}
        </div>
      )}

      <div className="desktop-sidebar__footer">
        <NavRow
          active={activeView === 'settings'}
          collapsed={collapsed}
          icon={<SettingsIcon />}
          label="Settings"
          onClick={() => onNavigate('settings')}
        />
      </div>
    </div>
  );
}
