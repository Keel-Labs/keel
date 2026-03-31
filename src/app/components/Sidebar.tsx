import React, { useEffect, useState } from 'react';

interface Session {
  id: string;
  title: string;
  updatedAt: number;
}

interface Props {
  currentSessionId: string;
  onSelectSession: (id: string) => void;
  onNewChat: () => void;
  refreshSignal: number;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function Sidebar({ currentSessionId, onSelectSession, onNewChat, refreshSignal }: Props) {
  const [sessions, setSessions] = useState<Session[]>([]);

  useEffect(() => {
    window.keel.listSessions().then(setSessions).catch(() => {});
  }, [refreshSignal, currentSessionId]);

  // Group sessions by date label
  const grouped = new Map<string, Session[]>();
  for (const s of sessions) {
    const label = formatDate(s.updatedAt);
    const list = grouped.get(label) || [];
    list.push(s);
    grouped.set(label, list);
  }

  return (
    <div style={{
      width: 240, height: '100%', borderRight: '1px solid rgba(255,255,255,0.08)',
      background: '#151515', display: 'flex', flexDirection: 'column',
      flexShrink: 0, overflow: 'hidden',
    }}>
      {/* New Chat button */}
      <div style={{ padding: '16px 14px 8px' }}>
        <button
          onClick={onNewChat}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 12px', borderRadius: 10,
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)',
            color: 'rgba(255,255,255,0.7)', fontSize: 13, cursor: 'pointer',
            transition: 'all 0.15s', fontWeight: 500,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
            e.currentTarget.style.color = 'rgba(255,255,255,0.9)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
            e.currentTarget.style.color = 'rgba(255,255,255,0.7)';
          }}
        >
          <span style={{ fontSize: 16, lineHeight: 1 }}>+</span>
          <span>New Chat</span>
        </button>
      </div>

      {/* Session list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 8px 16px' }}>
        {Array.from(grouped.entries()).map(([label, items]) => (
          <div key={label}>
            <div style={{
              fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.3)',
              padding: '12px 8px 4px', textTransform: 'uppercase', letterSpacing: '0.05em',
            }}>
              {label}
            </div>
            {items.map((s) => {
              const isActive = s.id === currentSessionId;
              return (
                <button
                  key={s.id}
                  onClick={() => onSelectSession(s.id)}
                  style={{
                    width: '100%', textAlign: 'left', display: 'block',
                    padding: '8px 10px', borderRadius: 8, border: 'none',
                    background: isActive ? 'rgba(255,255,255,0.1)' : 'transparent',
                    color: isActive ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.5)',
                    fontSize: 13, cursor: 'pointer', transition: 'all 0.12s',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    marginBottom: 2,
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
                      e.currentTarget.style.color = 'rgba(255,255,255,0.5)';
                    }
                  }}
                >
                  {s.title}
                </button>
              );
            })}
          </div>
        ))}

        {sessions.length === 0 && (
          <div style={{ padding: '20px 8px', color: 'rgba(255,255,255,0.2)', fontSize: 12, textAlign: 'center' }}>
            No conversations yet
          </div>
        )}
      </div>
    </div>
  );
}
