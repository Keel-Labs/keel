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

interface State {
  isLoading: boolean;
  status: ProStatus | null;
  licenseKey: string;
  activating: boolean;
  error: string | null;
}

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
        // Status will be updated via onProStatusChanged
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
        // Status will be updated via onProStatusChanged
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
    return <div className="settings-section__loading">Loading Pro status...</div>;
  }

  const { status } = state;
  const isPro = status?.isPro ?? false;

  return (
    <div className="keel-pro-panel">
      {/* Free state */}
      {!isPro && (
        <div className="pro-state free">
          <div className="pro-header">
            <h3>Keel Pro</h3>
            <p className="pro-tagline">Daily briefings + AI that learns who you are</p>
          </div>

          <div className="pro-content">
            <p className="pro-description">
              Upgrade to Pro for daily morning briefings on your priorities, plus an AI that learns your working style.
            </p>

            {status?.reason === 'no-active-entitlement' && (
              <button
                className="button button--primary button--large"
                onClick={() => window.open('https://keel-labs.org/pro', '_blank')}
              >
                Upgrade to Pro
              </button>
            )}
          </div>
        </div>
      )}

      {/* Activation state (no key cached) */}
      {!isPro && status?.reason === 'no-active-entitlement' && (
        <div className="pro-state activation">
          <div className="pro-activation">
            <label htmlFor="license-key" className="pro-label">
              License Key
            </label>
            <input
              id="license-key"
              type="text"
              placeholder="KEEL-XXXX-XXXX-XXXX-XXXX-XXXX"
              value={state.licenseKey}
              onChange={(e) =>
                setState((prev) => ({ ...prev, licenseKey: e.target.value, error: null }))
              }
              disabled={state.activating}
              className="input input--text"
            />

            {state.error && <div className="error-message">{state.error}</div>}

            <button
              className="button button--primary"
              onClick={handleActivate}
              disabled={state.activating || !state.licenseKey.trim()}
            >
              {state.activating ? 'Verifying...' : 'Verify & Activate'}
            </button>
          </div>
        </div>
      )}

      {/* Pro active state */}
      {isPro && status?.subscription && (
        <div className="pro-state active">
          <div className="pro-header">
            <h3>Keel Pro</h3>
            <span className="pro-badge">Active</span>
          </div>

          <div className="pro-details">
            <div className="pro-detail">
              <label>Email</label>
              <p>{status.subscription.email || 'Unknown'}</p>
            </div>

            {status.subscription.expiresAt && (
              <div className="pro-detail">
                <label>Expires</label>
                <p>{new Date(status.subscription.expiresAt).toLocaleDateString()}</p>
              </div>
            )}

            <div className="pro-actions">
              <a href="https://lemonsqueezy.com/my-purchases" target="_blank" rel="noopener noreferrer" className="button button--secondary">
                Manage Subscription
              </a>

              <button
                className="button button--tertiary"
                onClick={handleCancel}
                disabled={state.activating}
              >
                {state.activating ? 'Cancelling...' : 'Sign Out'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Offline-grace warning */}
      {isPro && status?.reason === 'offline-grace' && (
        <div className="pro-warning">
          <p>⚠️ Couldn't verify your Pro status — connect to the internet to maintain Pro features.</p>
        </div>
      )}
    </div>
  );
}
