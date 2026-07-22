// Settings → Keel Pro panel.
//
// User journey:
//   1. Free state — "Upgrade to Pro" button → opens keel-labs.org/pro
//   2. Activation state — paste license key + "Verify & Activate" button
//   3. Pro state — show email, expiry date, "Manage subscription" link, "Sign out"
//   4. Offline-grace state — warning banner if can't verify for 7+ days
//
// Pro activation happens in main via window.keel.proActivate(key).
// Main broadcasts `keel:pro-status-changed` events on activation/refresh/cancel.

import { useEffect, useState } from 'react';
import type { ProStatus } from '../../shared/types';
import { openProCheckout } from '../proCheckout';

interface State {
  isLoading: boolean;
  status: ProStatus | null;
  licenseKey: string;
  activating: boolean;
  error: string | null;
}

const inputStyle: React.CSSProperties = {
  padding: '8px 12px',
  border: '1px solid var(--border-subtle)',
  borderRadius: 6,
  background: 'var(--bg-tertiary)',
  color: 'var(--text-primary)',
  fontSize: 14,
};

const buttonPrimary: React.CSSProperties = {
  padding: '8px 16px',
  background: 'var(--accent)',
  color: 'white',
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 14,
  fontWeight: 500,
};

const buttonSecondary: React.CSSProperties = {
  padding: '8px 16px',
  background: 'var(--bg-secondary)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 14,
  fontWeight: 500,
};

const errorStyle: React.CSSProperties = {
  padding: '10px 12px',
  background: 'rgba(220, 38, 38, 0.1)',
  color: '#dc2626',
  borderRadius: 4,
  fontSize: 13,
  marginTop: 8,
};

export default function KeelProPanel() {
  const [state, setState] = useState<State>({
    isLoading: true,
    status: null,
    licenseKey: '',
    activating: false,
    error: null,
  });

  // Fetch initial Pro status
  useEffect(() => {
    let cancelled = false;

    const fetchStatus = async () => {
      try {
        const status = await window.keel.proStatus();
        if (!cancelled) {
          setState((prev) => ({ ...prev, status, isLoading: false }));
        }
        if (status.isPro) {
          const validation = await window.keel.proValidate();
          if (!cancelled && validation.revoked) {
            setState((prev) => ({
              ...prev,
              status: { isPro: false, reason: 'license-revoked' },
              error: validation.error || 'Your Keel Pro license is no longer active.',
            }));
          }
        }
      } catch (err) {
        if (!cancelled) {
          setState((prev) => ({ ...prev, isLoading: false }));
        }
      }
    };

    void fetchStatus();

    // Subscribe to Pro status changes
    const unsubscribe = window.keel.onProStatusChanged((status) => {
      setState((prev) => ({ ...prev, status }));
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const handleActivate = async () => {
    if (!state.licenseKey.trim()) {
      setState((prev) => ({ ...prev, error: 'License key is required' }));
      return;
    }

    setState((prev) => ({ ...prev, activating: true, error: null }));

    try {
      const result = await window.keel.proActivate(state.licenseKey.trim());

      if (result.ok) {
        setState((prev) => ({
          ...prev,
          licenseKey: '',
          activating: false,
          error: null,
        }));
      } else {
        setState((prev) => ({
          ...prev,
          activating: false,
          error: result.error || 'Activation failed. Check your license key.',
        }));
      }
    } catch (err) {
      setState((prev) => ({
        ...prev,
        activating: false,
        error: `Activation failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      }));
    }
  };

  const handleCancel = async () => {
    setState((prev) => ({ ...prev, activating: true, error: null }));

    try {
      const result = await window.keel.proCancel();

      if (result.ok) {
        // Revert to Ollama/Mistral — Pro providers (Claude, OpenAI, OpenRouter)
        // require an active license, so switch back to the free local model.
        try {
          const s = await window.keel.getSettings();
          if (s.provider !== 'ollama') {
            await window.keel.saveSettings({ ...s, provider: 'ollama', ollamaModel: s.ollamaModel || 'mistral' });
          }
        } catch { /* best-effort */ }

        setState((prev) => ({
          ...prev,
          activating: false,
          error: null,
        }));
      } else {
        setState((prev) => ({
          ...prev,
          activating: false,
          error: result.error || 'Cancellation failed.',
        }));
      }
    } catch (err) {
      setState((prev) => ({
        ...prev,
        activating: false,
        error: `Cancellation failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      }));
    }
  };

  if (state.isLoading) {
    return <div style={{ padding: 16, color: 'var(--text-secondary)' }}>Loading Pro status...</div>;
  }

  const { status } = state;
  const isPro = status?.isPro ?? false;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Free state — show whenever not Pro, regardless of the specific reason */}
      {!isPro && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <button
            onClick={openProCheckout}
            style={buttonPrimary}
          >
            Get Keel Pro
          </button>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Already have a license key?</label>
            <input
              type="text"
              placeholder="KEEL-XXXX-XXXX-XXXX-XXXX-XXXX"
              value={state.licenseKey}
              onChange={(e) =>
                setState((prev) => ({ ...prev, licenseKey: e.target.value, error: null }))
              }
              disabled={state.activating}
              style={inputStyle}
            />

            {state.error && <div style={errorStyle}>{state.error}</div>}

            <button
              onClick={handleActivate}
              disabled={state.activating || !state.licenseKey.trim()}
              style={{
                ...buttonSecondary,
                opacity: state.activating || !state.licenseKey.trim() ? 0.5 : 1,
              }}
            >
              {state.activating ? 'Verifying...' : 'Verify & Activate'}
            </button>
          </div>
        </div>
      )}

      {/* Pro active state */}
      {isPro && status?.subscription && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h3 style={{ margin: 0, fontSize: 18 }}>Keel Pro</h3>
            <span style={{
              background: 'var(--accent)',
              color: 'white',
              padding: '2px 8px',
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 500,
            }}>
              Active
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Email</label>
              <p style={{ margin: '4px 0 0 0', fontSize: 14 }}>{status.subscription.email || 'Unknown'}</p>
            </div>

            {status.subscription.expiresAt && (
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Expires</label>
                <p style={{ margin: '4px 0 0 0', fontSize: 14 }}>
                  {new Date(status.subscription.expiresAt).toLocaleDateString()}
                </p>
              </div>
            )}

            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, marginTop: 4 }}>
              Your license key and receipt were sent to your purchase email. Keep them safe — you'll need the key to reactivate on a new machine.
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <button
                onClick={handleCancel}
                disabled={state.activating}
                style={{
                  ...buttonSecondary,
                  opacity: state.activating ? 0.5 : 1,
                }}
              >
                {state.activating ? 'Signing out...' : 'Sign Out'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Offline-grace warning */}
      {isPro && status?.reason === 'offline-grace' && (
        <div style={{
          padding: 12,
          background: 'rgba(245, 158, 11, 0.1)',
          border: '1px solid rgba(245, 158, 11, 0.3)',
          borderRadius: 6,
          fontSize: 14,
          color: '#d97706',
        }}>
          ⚠️ Couldn't verify your Pro status — connect to the internet to maintain Pro features.
        </div>
      )}
    </div>
  );
}
