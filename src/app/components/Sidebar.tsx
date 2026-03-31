import React, { useEffect, useState } from 'react';
import { KeelIcon, KeelWordmark } from './KeelIcon';

interface Session {
  id: string;
  title: string;
  updatedAt: number;
}

type ActiveView = 'chat' | 'settings' | 'knowledge';

interface Props {
  currentSessionId: string;
  onSelectSession: (id: string) => void;
  onNewChat: () => void;
  refreshSignal: number;
  activeView: ActiveView;
  onNavigate: (view: ActiveView) => void;
}

function NavButton({ icon, label, active, onClick }: {
  icon: string; label: string; active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      style={{
        width: 36, height: 36, borderRadius: 8, border: 'none',
        background: active ? 'rgba(207,122,92,0.15)' : 'transparent',
        color: active ? '#CF7A5C' : 'rgba(255,255,255,0.4)',
        fontSize: 16, cursor: 'pointer', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.15s',
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
          e.currentTarget.style.color = 'rgba(255,255,255,0.7)';
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = 'rgba(255,255,255,0.4)';
        }
      }}
    >
      {icon}
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

      {/* New Chat button */}
      <div style={{ padding: '12px 12px 4px' }}>
        <button
          onClick={onNewChat}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 10,
            padding: '11px 14px', borderRadius: 10,
            background: 'transparent', border: '1px solid rgba(255,255,255,0.12)',
            color: 'rgba(255,255,255,0.7)', fontSize: 14, cursor: 'pointer',
            transition: 'all 0.15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
            e.currentTarget.style.color = 'rgba(255,255,255,0.9)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'rgba(255,255,255,0.7)';
          }}
        >
          <span style={{
            width: 22, height: 22, borderRadius: '50%',
            border: '1.5px solid rgba(255,255,255,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 15, lineHeight: 1, flexShrink: 0,
          }}>+</span>
          <span>New session</span>
        </button>
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

      {/* Bottom nav: Knowledge + Settings */}
      <div style={{
        padding: '8px 12px 12px',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', gap: 4,
      }}>
        <NavButton
          icon="📁"
          label="Knowledge Browser"
          active={activeView === 'knowledge'}
          onClick={() => onNavigate('knowledge')}
        />
        <NavButton
          icon="⚙"
          label="Settings"
          active={activeView === 'settings'}
          onClick={() => onNavigate('settings')}
        />
      </div>
    </div>
  );
}
