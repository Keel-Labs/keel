import React, { useEffect, useMemo, useState } from 'react';

interface Session {
  id: string;
  title: string;
  updatedAt: number;
}

interface Props {
  currentSessionId: string;
  refreshSignal: number;
  onOpenSession: (id: string) => void;
}

export default function ChatsIndex({ currentSessionId, refreshSignal, onOpenSession }: Props) {
  const [query, setQuery] = useState('');
  const [sessions, setSessions] = useState<Session[]>([]);

  useEffect(() => {
    window.keel.listSessions().then(setSessions).catch(() => {});
  }, [refreshSignal, currentSessionId]);

  const filteredSessions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return sessions;
    return sessions.filter((session) => session.title.toLowerCase().includes(normalized));
  }, [query, sessions]);

  return (
    <div className="workspace-scroll">
      <div className="workspace-section">
        <div className="workspace-header">
          <div>
            <div className="workspace-pane__eyebrow">Chat Workspace</div>
            <h1 className="workspace-page-title">Chats</h1>
            <p className="workspace-page-description">
              Browse recent conversations, reopen an active thread, or jump back into work without hunting through the rail.
            </p>
          </div>
        </div>

        <div className="shell-searchbar">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chat history..."
          />
        </div>

        <div className="session-grid">
          {filteredSessions.map((session) => {
            const active = session.id === currentSessionId;
            return (
              <button
                key={session.id}
                onClick={() => onOpenSession(session.id)}
                className={active ? 'session-card is-active' : 'session-card'}
              >
                <div className="session-card__meta">
                  <span>{new Date(session.updatedAt).toLocaleDateString()}</span>
                  {active && <span className="session-card__badge">Open</span>}
                </div>
                <div className="session-card__title">{session.title}</div>
                <div className="session-card__description">
                  Reopen this thread and continue where you left off.
                </div>
              </button>
            );
          })}

          {filteredSessions.length === 0 && (
            <div className="session-empty-state">
              No chats match this search yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
