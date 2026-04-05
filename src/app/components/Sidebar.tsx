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

function NavItem({ icon, label, active, onClick }: {
  icon: string; label: string; active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 10,
        padding: '7px 12px', borderRadius: 'var(--radius-base)', border: 'none',
        background: active ? '#2a2a2a' : 'transparent',
        color: active ? '#ececec' : 'var(--text-muted)',
        fontSize: 'var(--text-sm)', cursor: 'pointer', transition: 'var(--transition-fast)',
        textAlign: 'left', fontFamily: 'inherit', fontWeight: active ? 500 : 400,
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.background = '#232323';
          e.currentTarget.style.color = '#d1d1d1';
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = 'var(--text-muted)';
        }
      }}
    >
      <span style={{ fontSize: 14, width: 20, textAlign: 'center', flexShrink: 0 }}>{icon}</span>
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
        display: 'flex', alignItems: 'center', padding: '20px 18px 16px',
        borderBottom: '1px solid var(--border-subtle)',
      }}>
        <div style={{ marginRight: 10, flexShrink: 0 }}><KeelIcon size={28} /></div>
        <KeelWordmark height={16} />
      </div>

      {/* Top nav */}
      <div style={{ padding: '14px 10px 0', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <button
          onClick={onNewChat}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 10,
            padding: '7px 12px', borderRadius: 'var(--radius-base)',
            background: 'transparent', border: 'none',
            color: 'var(--text-muted)', fontSize: 'var(--text-sm)', cursor: 'pointer',
            transition: 'var(--transition-fast)', textAlign: 'left', fontFamily: 'inherit',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#232323';
            e.currentTarget.style.color = '#d1d1d1';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'var(--text-muted)';
          }}
        >
          <span style={{ fontSize: 14, width: 20, textAlign: 'center', flexShrink: 0 }}>+</span>
          <span>New session</span>
        </button>
        <NavItem
          icon="📁"
          label="Knowledge Browser"
          active={activeView === 'knowledge'}
          onClick={() => onNavigate('knowledge')}
        />
        <NavItem
          icon="⚙"
          label="Settings"
          active={activeView === 'settings'}
          onClick={() => onNavigate('settings')}
        />
      </div>

      {/* Session list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 10px 16px' }}>
        {sessions.length > 0 && (
          <div style={{
            fontSize: 10, fontWeight: 600, color: 'var(--text-disabled)',
            padding: '16px 10px 6px', textTransform: 'uppercase', letterSpacing: '0.06em',
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
                padding: '8px 12px', borderRadius: 'var(--radius-base)', border: 'none',
                background: isActive ? '#2a2a2a' : 'transparent',
                color: isActive ? '#ececec' : 'var(--text-subtle)',
                fontSize: 'var(--text-sm)', cursor: 'pointer', transition: 'var(--transition-fast)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                marginBottom: 1, lineHeight: 1.4, fontFamily: 'inherit',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = '#232323';
                  e.currentTarget.style.color = '#d1d1d1';
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
          <div style={{ padding: '28px 10px', color: 'var(--text-ghost)', fontSize: 12, textAlign: 'center' }}>
            No conversations yet
          </div>
        )}
      </div>

    </div>
  );
}
