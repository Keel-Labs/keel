import React, { useEffect, useState } from 'react';
import type { UpdateState } from '../../shared/types';

interface Props {
  collapsed: boolean;
}

export default function UpdatePill({ collapsed }: Props) {
  const [state, setState] = useState<UpdateState | null>(null);

  useEffect(() => {
    let active = true;
    window.keel.getUpdateState?.().then((s) => { if (active) setState(s); }).catch(() => {});
    const unsub = window.keel.onUpdateState?.((s) => { if (active) setState(s); });
    return () => {
      active = false;
      unsub?.();
    };
  }, []);

  if (!state || state.status !== 'downloaded') return null;

  const handleRestart = () => {
    window.keel.restartForUpdate?.().catch(() => {});
  };

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={handleRestart}
        title={`Update ready${state.version ? ` (v${state.version})` : ''} — click to restart`}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 36, height: 36, margin: '6px auto', borderRadius: 8,
          background: 'var(--accent-soft, #1f6feb22)',
          border: '1px solid var(--accent, #1f6feb)',
          color: 'var(--accent, #1f6feb)', cursor: 'pointer',
        }}
        aria-label="Restart to install update"
      >
        ↻
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleRestart}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        width: '100%', padding: '8px 12px', margin: '6px 0',
        borderRadius: 8, background: 'var(--accent-soft, #1f6feb22)',
        border: '1px solid var(--accent, #1f6feb)',
        color: 'var(--accent, #1f6feb)', cursor: 'pointer',
        fontSize: 12, fontFamily: 'inherit', textAlign: 'left',
      }}
    >
      <span>
        <strong>Update ready{state.version ? ` · v${state.version}` : ''}</strong>
        <div style={{ fontSize: 11, opacity: 0.8 }}>Click to restart</div>
      </span>
      <span aria-hidden>↻</span>
    </button>
  );
}
