import React, { useState } from 'react';
import Chat from './components/Chat';
import Sidebar from './components/Sidebar';

export default function App() {
  const [newChatSignal, setNewChatSignal] = useState(0);
  const [loadSessionId, setLoadSessionId] = useState<string | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState('');
  const [refreshSidebar, setRefreshSidebar] = useState(0);

  const handleNewChat = () => {
    setLoadSessionId(null);
    setNewChatSignal((n) => n + 1);
  };

  const handleSelectSession = (id: string) => {
    setLoadSessionId(id);
  };

  const handleSessionChange = (id: string) => {
    setCurrentSessionId(id);
    setRefreshSidebar((n) => n + 1);
  };

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'row', background: '#1a1a1a' }}>
      <Sidebar
        currentSessionId={currentSessionId}
        onSelectSession={handleSelectSession}
        onNewChat={handleNewChat}
        refreshSignal={refreshSidebar}
      />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <header style={{
          display: 'flex', alignItems: 'center', padding: '12px 24px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          background: '#1a1a1a',
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: 'linear-gradient(135deg, #3b82f6, #2dd4bf)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 700, color: 'white', marginRight: 10,
          }}>K</div>
          <h1 style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.8)', letterSpacing: '0.02em', flex: 1 }}>Keel</h1>
        </header>
        <Chat
          newChatSignal={newChatSignal}
          loadSessionId={loadSessionId}
          onSessionChange={handleSessionChange}
        />
      </div>
    </div>
  );
}
