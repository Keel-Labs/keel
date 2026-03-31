import React, { useState } from 'react';
import Chat from './components/Chat';
import Sidebar from './components/Sidebar';
import Settings from './components/Settings';
import KnowledgeBrowser from './components/KnowledgeBrowser';

type ActiveView = 'chat' | 'settings' | 'knowledge';

export default function App() {
  const [newChatSignal, setNewChatSignal] = useState(0);
  const [loadSessionId, setLoadSessionId] = useState<string | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState('');
  const [refreshSidebar, setRefreshSidebar] = useState(0);
  const [activeView, setActiveView] = useState<ActiveView>('chat');

  const handleNewChat = () => {
    setLoadSessionId(null);
    setNewChatSignal((n) => n + 1);
    setActiveView('chat');
  };

  const handleSelectSession = (id: string) => {
    setLoadSessionId(id);
    setActiveView('chat');
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
        activeView={activeView}
        onNavigate={setActiveView}
      />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {activeView === 'chat' && (
          <Chat
            newChatSignal={newChatSignal}
            loadSessionId={loadSessionId}
            onSessionChange={handleSessionChange}
          />
        )}
        {activeView === 'settings' && (
          <Settings onBack={() => setActiveView('chat')} />
        )}
        {activeView === 'knowledge' && (
          <KnowledgeBrowser onBack={() => setActiveView('chat')} />
        )}
      </div>
    </div>
  );
}
