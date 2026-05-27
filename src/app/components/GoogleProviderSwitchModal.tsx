/**
 * Shown when the user clicks "Connect Google" while on a provider
 * that isn't on the Google-compatibility allowlist (today: OpenRouter).
 *
 * Offers a one-click switch to a compatible provider, then continues
 * the OAuth flow. The reviewer demo video should walk through this
 * modal — it's the visible evidence of the data-segregation
 * architecture Google asked us to implement.
 */

import React from 'react';
import type { Settings } from '../../shared/types';
import {
  POLICY_RATIONALE,
  providerLabel,
  suggestCompatibleProvider,
  GOOGLE_COMPATIBLE_PROVIDERS,
  type Provider,
} from '../../core/googlePolicy';

interface Props {
  settings: Settings;
  onCancel: () => void;
  // Connect-Google flow (default): caller updates provider+persists, then triggers googleConnect.
  // Disconnect-Google flow ('disconnect-google'): caller disconnects Google and applies the
  //   switch to `targetProvider`. Only the "confirm" button is shown.
  mode?: 'switch-and-connect' | 'disconnect-google';
  targetProvider?: Provider;
  onSwitchAndConnect: (next: Provider) => Promise<void>;
}

export function GoogleProviderSwitchModal({
  settings, onCancel, onSwitchAndConnect, mode = 'switch-and-connect', targetProvider,
}: Props) {
  const suggested = suggestCompatibleProvider(settings);
  const alternatives: Provider[] = Array.from(GOOGLE_COMPATIBLE_PROVIDERS).filter(p => p !== suggested) as Provider[];

  if (mode === 'disconnect-google' && targetProvider) {
    return (
      <div role="dialog" aria-labelledby="gps-title" style={overlay}>
        <div style={card}>
          <h2 id="gps-title" style={{ margin: '0 0 12px', fontSize: 18 }}>
            Disconnect Google to switch to {providerLabel(targetProvider)}?
          </h2>
          <p style={{ margin: '0 0 20px', fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            {POLICY_RATIONALE} Switching to {providerLabel(targetProvider)} will disconnect Google Calendar and Docs from Keel.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button style={primary} onClick={() => onSwitchAndConnect(targetProvider)}>
              Disconnect Google and switch
            </button>
            <button style={tertiary} onClick={onCancel}>Keep Google connected</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div role="dialog" aria-labelledby="gps-title" style={overlay}>
      <div style={card}>
        <h2 id="gps-title" style={{ margin: '0 0 12px', fontSize: 18 }}>
          Switch model to connect Google
        </h2>
        <p style={{ margin: '0 0 16px', fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          You're currently using <strong>{providerLabel(settings.provider)}</strong>. {POLICY_RATIONALE}
        </p>
        <p style={{ margin: '0 0 20px', fontSize: 14, lineHeight: 1.5 }}>
          Switch to a compatible model to continue:
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
          <button style={primary} onClick={() => onSwitchAndConnect(suggested)}>
            Switch to {providerLabel(suggested)} and connect Google
          </button>
          {alternatives.map(p => (
            <button key={p} style={secondary} onClick={() => onSwitchAndConnect(p)}>
              Switch to {providerLabel(p)} instead
            </button>
          ))}
        </div>

        <button style={tertiary} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
};
const card: React.CSSProperties = {
  background: 'var(--bg-elevated)', borderRadius: 8, padding: 24,
  maxWidth: 480, width: '90%', boxShadow: '0 12px 40px rgba(0,0,0,0.3)',
};
const primary: React.CSSProperties = {
  padding: '10px 16px', borderRadius: 6, border: 'none',
  background: 'var(--accent)', color: '#fff', fontWeight: 600, cursor: 'pointer',
};
const secondary: React.CSSProperties = {
  padding: '10px 16px', borderRadius: 6, border: '1px solid var(--border)',
  background: 'transparent', color: 'var(--text)', cursor: 'pointer',
};
const tertiary: React.CSSProperties = {
  padding: '8px 12px', borderRadius: 6, border: 'none',
  background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13,
};
