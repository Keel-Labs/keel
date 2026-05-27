/**
 * Launch-time forcing modal for pre-policy installs that have both
 * (a) a non-allowlisted LLM provider (today: OpenRouter) AND
 * (b) Google connected.
 *
 * Renders on top of the app shell and is dismissible only by choosing
 * one of the two paths — keep Google (switch model) or keep model
 * (disconnect Google). After resolution the app proceeds normally
 * and this modal will not fire again (the underlying state condition
 * is no longer true).
 *
 * See src/core/googlePolicy.ts for the policy rationale.
 */

import React, { useState } from 'react';
import type { Settings } from '../../shared/types';
import {
  POLICY_RATIONALE,
  providerLabel,
  suggestCompatibleProvider,
} from '../../core/googlePolicy';

interface Props {
  settings: Settings;
  onResolved: (next: Settings) => void;
}

export function GoogleConflictResolveModal({ settings, onResolved }: Props) {
  const [busy, setBusy] = useState<'switch' | 'disconnect' | null>(null);
  const [error, setError] = useState('');
  const suggested = suggestCompatibleProvider(settings);

  const keepGoogle = async () => {
    setBusy('switch');
    setError('');
    try {
      const next: Settings = { ...settings, provider: suggested };
      await window.keel.saveSettings(next);
      onResolved(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to switch model');
      setBusy(null);
    }
  };

  const keepModel = async () => {
    setBusy('disconnect');
    setError('');
    try {
      await window.keel.googleDisconnect();
      onResolved(settings);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to disconnect Google');
      setBusy(null);
    }
  };

  return (
    <div role="dialog" aria-labelledby="gcr-title" style={overlay}>
      <div style={card}>
        <h2 id="gcr-title" style={{ margin: '0 0 12px', fontSize: 18 }}>
          Action needed: pick one
        </h2>
        <p style={{ margin: '0 0 12px', fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          Your Google account is connected and your model is set to <strong>{providerLabel(settings.provider)}</strong>. {POLICY_RATIONALE}
        </p>
        <p style={{ margin: '0 0 20px', fontSize: 14, lineHeight: 1.5 }}>
          To continue, choose one:
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
          <button style={primary} onClick={keepGoogle} disabled={busy !== null}>
            {busy === 'switch' ? 'Switching…' : `Keep Google — switch to ${providerLabel(suggested)}`}
          </button>
          <button style={secondary} onClick={keepModel} disabled={busy !== null}>
            {busy === 'disconnect' ? 'Disconnecting…' : `Keep ${providerLabel(settings.provider)} — disconnect Google`}
          </button>
        </div>
        {error && (
          <div style={{ fontSize: 13, color: '#fca5a5' }}>{error}</div>
        )}
      </div>
    </div>
  );
}

const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000,
};
const card: React.CSSProperties = {
  background: 'var(--bg-elevated)', borderRadius: 8, padding: 24,
  maxWidth: 480, width: '90%', boxShadow: '0 12px 40px rgba(0,0,0,0.4)',
};
const primary: React.CSSProperties = {
  padding: '10px 16px', borderRadius: 6, border: 'none',
  background: 'var(--accent)', color: '#fff', fontWeight: 600, cursor: 'pointer',
};
const secondary: React.CSSProperties = {
  padding: '10px 16px', borderRadius: 6, border: '1px solid var(--border)',
  background: 'transparent', color: 'var(--text)', cursor: 'pointer',
};
