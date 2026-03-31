import React from 'react';
import Chat from './components/Chat';

export default function App() {
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
        <h1 style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.8)', letterSpacing: '0.02em' }}>Keel</h1>
      </header>
      <Chat />
    </div>
  );
}
