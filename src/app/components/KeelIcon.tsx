import React from 'react';

export function KeelIcon({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
      <rect x="5" y="5" width="110" height="110" rx="22" fill="#0F2040" />
      <text
        x="60"
        y="82"
        fontFamily="'Playfair Display', Georgia, serif"
        fontSize="72"
        fontWeight="500"
        fill="white"
        textAnchor="middle"
        letterSpacing="-2"
      >K</text>
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
