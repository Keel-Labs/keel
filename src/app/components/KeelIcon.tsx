import React from 'react';

export function KeelIcon({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
      <rect x="5" y="5" width="110" height="110" rx="22" fill="#0F2040" />
      <rect x="30" y="25" width="13" height="70" rx="6.5" fill="white" />
      <path d="M 42 58 L 88 25" stroke="white" strokeWidth="13" strokeLinecap="round" />
      <path d="M 42 58 L 90 93" stroke="#CF7A5C" strokeWidth="13" strokeLinecap="round" />
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
        fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif"
        fontSize="50"
        fontWeight="700"
        fill="rgba(255,255,255,0.85)"
        letterSpacing="-1"
      >Keel</text>
    </svg>
  );
}
