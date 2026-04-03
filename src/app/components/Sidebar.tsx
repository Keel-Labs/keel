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
        padding: '8px 10px', borderRadius: 8, border: 'none',
        background: active ? 'rgba(207,122,92,0.12)' : 'transparent',
        color: active ? '#CF7A5C' : 'rgba(255,255,255,0.55)',
        fontSize: 13, cursor: 'pointer', transition: 'all 0.12s',
        textAlign: 'left',
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
          e.currentTarget.style.color = 'rgba(255,255,255,0.8)';
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = 'rgba(255,255,255,0.55)';
        }
      }}
    >
      <span style={{ fontSize: 15, width: 20, textAlign: 'center', flexShrink: 0 }}>{icon}</span>
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
      width: 260, height: '100%', borderRight: '1px solid rgba(255,255,255,0.08)',
      background: '#151515', display: 'flex', flexDirection: 'column',
      flexShrink: 0, overflow: 'hidden',
    }}>
      {/* Logo */}
      <div style={{
        display: 'flex', alignItems: 'center', padding: '16px 16px 12px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{ marginRight: 10, flexShrink: 0 }}><KeelIcon size={30} /></div>
        <KeelWordmark height={18} />
      </div>

      {/* Top nav */}
      <div style={{ padding: '12px 8px 0', display: 'flex', flexDirection: 'column', gap: 1 }}>
        <button
          onClick={onNewChat}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 10,
            padding: '8px 10px', borderRadius: 8,
            background: 'transparent', border: 'none',
            color: 'rgba(255,255,255,0.55)', fontSize: 13, cursor: 'pointer',
            transition: 'all 0.12s', textAlign: 'left',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
            e.currentTarget.style.color = 'rgba(255,255,255,0.8)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'rgba(255,255,255,0.55)';
          }}
        >
          <span style={{ fontSize: 15, width: 20, textAlign: 'center', flexShrink: 0 }}>+</span>
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
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 8px 16px' }}>
        {sessions.length > 0 && (
          <div style={{
            fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.3)',
            padding: '14px 8px 6px', textTransform: 'uppercase', letterSpacing: '0.05em',
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
                padding: '9px 10px', borderRadius: 8, border: 'none',
                background: isActive ? 'rgba(255,255,255,0.1)' : 'transparent',
                color: isActive ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.45)',
                fontSize: 13, cursor: 'pointer', transition: 'all 0.12s',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                marginBottom: 1, lineHeight: 1.4,
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                  e.currentTarget.style.color = 'rgba(255,255,255,0.7)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'rgba(255,255,255,0.45)';
                }
              }}
            >
              {s.title}
            </button>
          );
        })}

        {sessions.length === 0 && (
          <div style={{ padding: '24px 8px', color: 'rgba(255,255,255,0.2)', fontSize: 12, textAlign: 'center' }}>
            No conversations yet
          </div>
        )}
      </div>

    </div>
  );
}
