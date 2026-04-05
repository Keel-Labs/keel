import React, { useEffect, useState } from 'react';
import { KeelIcon, KeelWordmark } from './KeelIcon';

interface Session {
  id: string;
  title: string;
  updatedAt: number;
}

type ActiveView = 'chat' | 'settings' | 'knowledge' | 'history';

interface Props {
  currentSessionId: string;
  onSelectSession: (id: string) => void;
  onNewChat: () => void;
  refreshSignal: number;
  activeView: ActiveView;
  onNavigate: (view: ActiveView) => void;
}

function NavIcon({ type, color }: { type: string; color: string }) {
  const props = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (type) {
    case 'plus':
      return <svg {...props}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>;
    case 'folder':
      return <svg {...props}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>;
    case 'settings':
      return <svg {...props}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>;
    default:
      return null;
  }
}

function NavItem({ iconType, label, active, onClick }: {
  iconType: string; label: string; active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 12,
        padding: '9px 16px', borderRadius: 'var(--radius-base)', border: 'none',
        background: active ? 'var(--bg-surface)' : 'transparent',
        color: active ? 'var(--text-primary)' : 'var(--text-muted)',
        fontSize: 'var(--text-sm)', cursor: 'pointer', transition: 'var(--transition-fast)',
        textAlign: 'left', fontFamily: 'inherit', fontWeight: 400,
        letterSpacing: '-0.01em',
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.background = 'var(--bg-surface)';
          e.currentTarget.style.color = 'var(--text-secondary)';
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = 'var(--text-muted)';
        }
      }}
    >
      <NavIcon type={iconType} color={active ? 'var(--text-primary)' : 'var(--text-disabled)'} />
      <span>{label}</span>
    </button>
  );
}

export default function Sidebar({ currentSessionId, onSelectSession, onNewChat, refreshSignal, activeView, onNavigate }: Props) {
  const [sessions, setSessions] = useState<Session[]>([]);

  useEffect(() => {
    window.keel.listSessions().then(setSessions).catch(() => {});
  }, [refreshSignal, currentSessionId]);

  return (
    <div style={{
      width: 'var(--sidebar-width)', height: '100%', borderRight: '1px solid var(--border-default)',
      background: 'var(--bg-sidebar)', display: 'flex', flexDirection: 'column',
      flexShrink: 0, overflow: 'hidden',
    }}>
      {/* Logo */}
      <div style={{
        display: 'flex', alignItems: 'center', padding: '24px 20px 20px',
      }}>
        <div style={{ marginRight: 10, flexShrink: 0 }}><KeelIcon size={24} /></div>
        <KeelWordmark height={14} />
      </div>

      {/* Nav */}
      <div style={{ padding: '0 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <NavItem iconType="plus" label="New session" active={false} onClick={onNewChat} />
        <NavItem iconType="folder" label="Knowledge" active={activeView === 'knowledge'} onClick={() => onNavigate('knowledge')} />
        <NavItem iconType="settings" label="Settings" active={activeView === 'settings'} onClick={() => onNavigate('settings')} />
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: 'var(--border-default)', margin: '16px 16px 8px' }} />

      {/* Session list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 16px' }}>
        {sessions.length > 0 && (
          <div style={{
            fontSize: 10, fontWeight: 500, color: 'var(--text-disabled)',
            padding: '8px 14px 6px', textTransform: 'uppercase', letterSpacing: '0.08em',
          }}>
            History
          </div>
        )}

        {sessions.map((s) => {
          const isActive = s.id === currentSessionId && activeView === 'chat';
          return (
            <button
              key={s.id}
              onClick={() => onSelectSession(s.id)}
              style={{
                width: '100%', textAlign: 'left', display: 'block',
                padding: '8px 14px', borderRadius: 'var(--radius-md)', border: 'none',
                background: isActive ? 'var(--bg-surface)' : 'transparent',
                color: isActive ? 'var(--text-primary)' : 'var(--text-subtle)',
                fontSize: 12, cursor: 'pointer', transition: 'var(--transition-fast)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                marginBottom: 1, lineHeight: 1.5, fontFamily: 'inherit',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'var(--bg-surface)';
                  e.currentTarget.style.color = 'var(--text-secondary)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'var(--text-subtle)';
                }
              }}
            >
              {s.title}
            </button>
          );
        })}

        {sessions.length === 0 && (
          <div style={{ padding: '32px 14px', color: 'var(--text-ghost)', fontSize: 12, textAlign: 'center' }}>
            No conversations yet
          </div>
        )}
      </div>
    </div>
  );
}
