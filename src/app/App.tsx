import React from 'react';
import Chat from './components/Chat';

export default function App() {
  return (
    <div className="h-screen flex flex-col bg-[#1a1a1a]">
      <header className="flex items-center px-5 py-3 border-b border-white/[0.08] bg-[#1a1a1a]" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-teal-400 flex items-center justify-center text-xs font-bold text-white mr-2.5">
          K
        </div>
        <h1 className="text-sm font-semibold text-white/80 tracking-wide">Keel</h1>
      </header>
      <Chat />
    </div>
  );
}
