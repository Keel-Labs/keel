import React, { useEffect, useState } from 'react';
import type { SessionIndicatorState } from '../sessionState';
import SessionStatusIndicator from './SessionStatusIndicator';

interface Session {
  id: string;
  title: string;
  updatedAt: number;
}

interface Props {
  onSelectSession: (id: string) => void;
  refreshSignal: number;
  sessionIndicators?: Record<string, SessionIndicatorState>;
}

export default function MobileHistory({ onSelectSession, refreshSignal, sessionIndicators }: Props) {
  const [sessions, setSessions] = useState<Session[]>([]);

  useEffect(() => {
    window.keel.listSessions().then(setSessions).catch(() => {});
  }, [refreshSignal]);

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      minHeight: 0,
      paddingTop: 'env(safe-area-inset-top, 0px)',
    }}>
      <div style={{
        padding: '16px 20px 12px',
        borderBottom: '1px solid var(--border-default)',
      }}>
        <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
          History
        </h2>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
        {sessions.length === 0 && (
          <div style={{ padding: 24, color: 'var(--text-disabled)', fontSize: 'var(--text-base)', textAlign: 'center' }}>
            No conversations yet
          </div>
        )}
        {sessions.map((s) => (
          <button
            key={s.id}
            onClick={() => onSelectSession(s.id)}
            style={{
              width: '100%',
              textAlign: 'left',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              padding: '12px 14px',
              borderRadius: 'var(--radius-lg)',
              border: 'none',
              background: 'transparent',
              color: 'var(--text-secondary)',
              fontSize: 'var(--text-base)',
              cursor: 'pointer',
              marginBottom: 2,
              transition: 'var(--transition-fast)',
              fontFamily: 'inherit',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-muted)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            <SessionStatusIndicator indicator={sessionIndicators?.[s.id]} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-disabled)', marginTop: 2 }}>
                {new Date(s.updatedAt).toLocaleDateString()}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
