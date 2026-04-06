import React from 'react';

export function KeelIcon({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="keel-icon-bg" x1="18" y1="12" x2="102" y2="108" gradientUnits="userSpaceOnUse">
          <stop stopColor="#17345C" />
          <stop offset="0.56" stopColor="#0E2344" />
          <stop offset="1" stopColor="#09172D" />
        </linearGradient>
        <radialGradient
          id="keel-icon-glow"
          cx="0"
          cy="0"
          r="1"
          gradientUnits="userSpaceOnUse"
          gradientTransform="translate(84 30) rotate(131) scale(42 48)"
        >
          <stop stopColor="#E9A184" stopOpacity="0.45" />
          <stop offset="1" stopColor="#E9A184" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="keel-icon-accent" x1="48" y1="60" x2="89" y2="90" gradientUnits="userSpaceOnUse">
          <stop stopColor="#E4A287" />
          <stop offset="1" stopColor="#C96C4C" />
        </linearGradient>
      </defs>
      <rect x="5" y="5" width="110" height="110" rx="22" fill="url(#keel-icon-bg)" />
      <rect x="5" y="5" width="110" height="110" rx="22" fill="url(#keel-icon-glow)" />
      <rect x="30" y="23" width="15" height="72" rx="7.5" fill="#F8F5F0" />
      <path d="M 43 58 L 89 24" stroke="#F8F5F0" strokeWidth="14" strokeLinecap="round" />
      <path d="M 47 60 L 84 89" stroke="url(#keel-icon-accent)" strokeWidth="14" strokeLinecap="round" />
      <path d="M 24 97 C 37 104, 53 107, 71 107 C 88 107, 101 101, 106 95" stroke="#FFFFFF" strokeOpacity="0.08" strokeWidth="3" strokeLinecap="round" />
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
