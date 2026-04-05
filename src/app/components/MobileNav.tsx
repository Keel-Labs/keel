import React from 'react';

type ActiveView = 'chat' | 'settings' | 'knowledge' | 'history';

interface Props {
  activeView: ActiveView;
  onNavigate: (view: ActiveView) => void;
  onNewChat: () => void;
}

function ChatIcon({ color }: { color: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function HistoryIcon({ color }: { color: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function BrainIcon({ color }: { color: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function SettingsIcon({ color }: { color: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

const NAV_ITEMS: Array<{ view: ActiveView; icon: (color: string) => React.ReactNode; label: string }> = [
  { view: 'chat', icon: (c) => <ChatIcon color={c} />, label: 'Chat' },
  { view: 'history', icon: (c) => <HistoryIcon color={c} />, label: 'History' },
  { view: 'knowledge', icon: (c) => <BrainIcon color={c} />, label: 'Brain' },
  { view: 'settings', icon: (c) => <SettingsIcon color={c} />, label: 'Settings' },
];

export default function MobileNav({ activeView, onNavigate, onNewChat }: Props) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-around',
      borderTop: '1px solid var(--border-default)',
      background: 'var(--bg-sidebar)',
      paddingBottom: 'env(safe-area-inset-bottom, 0px)',
    }}>
      {NAV_ITEMS.map((item) => {
        const isActive = activeView === item.view;
        const color = isActive ? 'var(--accent)' : 'var(--text-subtle)';
        return (
          <button
            key={item.view}
            onClick={() => {
              if (item.view === 'chat') {
                onNewChat();
                onNavigate('chat');
              } else {
                onNavigate(item.view);
              }
            }}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 'var(--space-xs)',
              padding: '8px 0 6px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color,
              fontSize: 10,
              fontFamily: 'inherit',
              transition: 'var(--transition-base)',
            }}
          >
            {item.icon(isActive ? 'var(--accent-link)' : 'var(--text-subtle)')}
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
