import React, { useEffect, useState } from 'react';

interface Session {
  id: string;
  title: string;
  updatedAt: number;
}

interface Props {
  onSelectSession: (id: string) => void;
  refreshSignal: number;
}

export default function MobileHistory({ onSelectSession, refreshSignal }: Props) {
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
        borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: 'rgba(255,255,255,0.9)', margin: 0 }}>
          History
        </h2>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
        {sessions.length === 0 && (
          <div style={{ padding: 24, color: 'rgba(255,255,255,0.3)', fontSize: 14, textAlign: 'center' }}>
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
              display: 'block',
              padding: '12px 14px',
              borderRadius: 10,
              border: 'none',
              background: 'transparent',
              color: 'rgba(255,255,255,0.7)',
              fontSize: 14,
              cursor: 'pointer',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              marginBottom: 2,
              transition: 'background 0.12s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            <div>{s.title}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>
              {new Date(s.updatedAt).toLocaleDateString()}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
