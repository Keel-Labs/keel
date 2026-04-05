import React, { useEffect, useState } from 'react';
interface Session {
  id: string;
  title: string;
  updatedAt: number;
}

export type DesktopView = 'chat' | 'search' | 'chats' | 'teams' | 'inbox' | 'settings';

interface Props {
  collapsed: boolean;
  currentSessionId: string;
  activeView: DesktopView;
  onNavigate: (view: DesktopView) => void;
  onNewChat: () => void;
  onSelectSession: (id: string) => void;
  refreshSignal: number;
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
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06A2 2 0 1 1 7.04 4.3l.06.06A1.65 1.65 0 0 0 8.92 4a1.65 1.65 0 0 0 1-1.51V2a2 2 0 0 1 4 0v.09A1.65 1.65 0 0 0 14.92 3.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.56.23.96.77.96 1.39V12c0 .62-.4 1.16-.96 1.39Z" />
    </svg>
  );
}

const PRIMARY_ITEMS: Array<{
  id: DesktopView;
  label: string;
  icon: React.ReactNode;
}> = [
  { id: 'search', label: 'Search', icon: <SearchIcon /> },
  { id: 'chats', label: 'Chats', icon: <ChatIcon /> },
  { id: 'teams', label: 'Teams', icon: <TeamIcon /> },
  { id: 'inbox', label: 'Inbox', icon: <InboxIcon /> },
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

export default function Sidebar({
  collapsed,
  currentSessionId,
  activeView,
  onNavigate,
  onNewChat,
  onSelectSession,
  refreshSignal,
}: Props) {
  const [sessions, setSessions] = useState<Session[]>([]);

  useEffect(() => {
    window.keel.listSessions().then(setSessions).catch(() => {});
  }, [refreshSignal, currentSessionId]);

  return (
    <div className={collapsed ? 'desktop-sidebar is-collapsed' : 'desktop-sidebar'}>
      <div className="desktop-sidebar__section">
        <button
          onClick={onNewChat}
          title={collapsed ? 'New chat' : undefined}
          className="desktop-sidebar__new-chat desktop-sidebar__nav"
          style={{ justifyContent: collapsed ? 'center' : 'flex-start' }}
        >
          <span className="desktop-sidebar__nav-icon">
            <PlusIcon />
          </span>
          {!collapsed && <span>New chat</span>}
        </button>
      </div>

      <div className="desktop-sidebar__section" style={{ gap: 4 }}>
        {PRIMARY_ITEMS.map((item) => {
          const active = activeView === item.id;
          return (
            <NavRow
              key={item.id}
              active={active}
              collapsed={collapsed}
              icon={item.icon}
              label={item.label}
              onClick={() => onNavigate(item.id)}
            />
          );
        })}
      </div>

      {!collapsed && (
        <div className="desktop-sidebar__history">
	          <div className="desktop-sidebar__label">Recents</div>

          {sessions.slice(0, 14).map((session) => {
            const active = activeView === 'chat' && session.id === currentSessionId;
            return (
              <button
                key={session.id}
                onClick={() => onSelectSession(session.id)}
                className={active ? 'desktop-sidebar__session is-active' : 'desktop-sidebar__session'}
              >
                <span className="desktop-sidebar__session-title">{session.title}</span>
              </button>
            );
          })}

          {sessions.length === 0 && (
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
