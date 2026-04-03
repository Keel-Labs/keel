import React from 'react';

type ActiveView = 'chat' | 'settings' | 'knowledge' | 'history';

interface Props {
  activeView: ActiveView;
  onNavigate: (view: ActiveView) => void;
  onNewChat: () => void;
}

const NAV_ITEMS: Array<{ view: ActiveView; icon: string; label: string }> = [
  { view: 'chat', icon: '💬', label: 'Chat' },
  { view: 'history', icon: '📋', label: 'History' },
  { view: 'knowledge', icon: '📁', label: 'Brain' },
  { view: 'settings', icon: '⚙', label: 'Settings' },
];

export default function MobileNav({ activeView, onNavigate, onNewChat }: Props) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-around',
      borderTop: '1px solid rgba(255,255,255,0.08)',
      background: '#151515',
      paddingBottom: 'env(safe-area-inset-bottom, 0px)',
    }}>
      {NAV_ITEMS.map((item) => {
        const active = item.view === activeView
          || (item.view === 'chat' && activeView === 'history'); // history is a sub-view of chat area
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
              gap: 2,
              padding: '8px 0 6px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: activeView === item.view ? '#CF7A5C' : 'rgba(255,255,255,0.4)',
              fontSize: 10,
              transition: 'color 0.15s',
            }}
          >
            <span style={{ fontSize: 18 }}>{item.icon}</span>
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
