import React from 'react';

export function KeelIcon({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
      <rect x="5" y="5" width="110" height="110" rx="22" fill="#0F2040" />
      {/* Simple sailboat — hull + sail in coral/terracotta */}
      {/* Hull */}
      <path d="M 30 78 Q 60 90 90 78 L 85 72 Q 60 82 35 72 Z" fill="#d4845e" />
      {/* Main sail */}
      <path d="M 58 30 L 58 72 L 82 68 Z" fill="#d4845e" opacity="0.9" />
      {/* Jib sail */}
      <path d="M 55 34 L 55 68 L 36 66 Z" fill="#d4845e" opacity="0.55" />
      {/* Mast */}
      <line x1="58" y1="26" x2="58" y2="74" stroke="#d4845e" strokeWidth="2.5" />
    </svg>
  );
}

export function KeelWordmark({ height = 20 }: { height?: number }) {
  const width = height * 3.2;
  return (
    <svg width={width} height={height} viewBox="0 0 160 50" xmlns="http://www.w3.org/2000/svg">
      <text
        x="0"
        y="40"
        fontFamily="'Playfair Display', Georgia, 'Times New Roman', serif"
        fontSize="44"
        fontWeight="400"
        fill="var(--text-primary)"
        letterSpacing="2"
      >Keel</text>
    </svg>
  );
}
