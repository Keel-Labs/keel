import React from 'react';

/**
 * Small "BETA" pill — used in the top bar, settings header, and welcome screen.
 * Style matches the accent badges in Onboarding's provider step so visual language is consistent.
 */
export function BetaBadge({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const fontSize = size === 'sm' ? 9 : 10;
  const padding = size === 'sm' ? '2px 6px' : '2px 8px';
  return (
    <span
      title="Keel is in beta — features may change. We read every piece of feedback."
      style={{
        display: 'inline-block',
        border: '1px solid var(--accent-border)',
        background: 'var(--accent-bg)',
        color: 'var(--accent)',
        fontSize,
        fontWeight: 700,
        letterSpacing: '0.08em',
        padding,
        borderRadius: 999,
        textTransform: 'uppercase',
        lineHeight: 1.4,
        verticalAlign: 'middle',
        userSelect: 'none',
      }}
    >
      Beta
    </span>
  );
}
