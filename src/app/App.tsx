import React, { useState } from 'react';
import Chat from './components/Chat';

export default function App() {
  const [newChatSignal, setNewChatSignal] = useState(0);

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#1a1a1a' }}>
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
        <button
          onClick={() => setNewChatSignal((n) => n + 1)}
          title="New Chat"
          style={{
            background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
            color: 'rgba(255,255,255,0.5)', borderRadius: 8,
            padding: '5px 12px', cursor: 'pointer', fontSize: 12,
            transition: 'all 0.15s', fontWeight: 500,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)';
            e.currentTarget.style.color = 'rgba(255,255,255,0.8)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
            e.currentTarget.style.color = 'rgba(255,255,255,0.5)';
          }}
        >
          New Chat
        </button>
      </header>
      <Chat newChatSignal={newChatSignal} />
    </div>
  );
}
