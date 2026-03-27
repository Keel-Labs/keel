import React from 'react';
import Chat from './components/Chat';

export default function App() {
  return (
    <div className="h-screen flex flex-col bg-[#1a1a1a]">
      <header className="flex items-center px-4 py-3 border-b border-white/10">
        <span className="text-lg mr-2">⚓</span>
        <h1 className="text-base font-semibold text-white/90">Keel</h1>
      </header>
      <Chat />
    </div>
  );
}
