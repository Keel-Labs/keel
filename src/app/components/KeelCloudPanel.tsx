// Settings → Keel Cloud panel.
//
// Three states the user can be in:
//   1. signed out      — explainer + email form
//   2. waiting-link    — "Check your email" with cancel + spinner
//   3. signed in       — email + sign-out + API base override
//
// Auth round-trips happen in main; this component is a thin view.
// Main pushes `keel:cloud-signin-status` events for sent-email →
// signed-in (or error/cancelled), and we react to those.

import { useEffect, useRef, useState } from 'react';
import type { CloudSignInStatusEvent } from '../../shared/types';

type Stage = 'signed-out' | 'waiting-link' | 'signed-in';

interface Status {
  enabled: boolean;
  signedIn: boolean;
  email: string;
  apiBase: string;
}

export default function KeelCloudPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [stage, setStage] = useState<Stage>('signed-out');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'info' | 'error'; text: string } | null>(null);

  // Keep the latest email handy for status-event handlers without
  // re-binding the subscription on every keystroke.
  const emailRef = useRef('');
  useEffect(() => { emailRef.current = email; }, [email]);

  // Initial status fetch + react to background sign-out from main.
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const s = await window.keel.cloudStatus();
        if (cancelled) return;
        setStatus(s);
        setStage(s.signedIn ? 'signed-in' : 'signed-out');
        if (s.email) setEmail(s.email);
      } catch {
        // first render before main is ready, etc.
      }
    };
    void refresh();
    const offSignedOut = window.keel.onCloudSignedOut(() => {
      setStage('signed-out');
      setMessage({ tone: 'info', text: 'Your session expired. Sign in again to keep using Keel Cloud.' });
      void refresh();
    });

    const offStatus = window.keel.onCloudSignInStatus((payload: CloudSignInStatusEvent) => {
      switch (payload.status) {
        case 'sent-email':
          setStage('waiting-link');
          setBusy(false);
          setMessage({ tone: 'info', text: `Open the link we sent to ${payload.email}. We'll sign you in automatically — keep this window open.` });
          break;
        case 'signed-in':
          setStage('signed-in');
          setMessage({ tone: 'info', text: `Signed in as ${payload.email}.` });
          void refresh();
          break;
        case 'cancelled':
          setStage('signed-out');
          setMessage(null);
          break;
        case 'error':
          setStage('signed-out');
          setMessage({ tone: 'error', text: payload.error });
          break;
      }
    });

    return () => { cancelled = true; offSignedOut?.(); offStatus?.(); };
  }, []);

  const requestLink = async () => {
    const trimmed = email.trim();
    if (!trimmed) return;
    setBusy(true);
    setMessage(null);
    try {
      await window.keel.cloudStartSignIn(trimmed);
      // From here, the 'sent-email' status event flips us into
      // waiting-link. We leave `busy` true until that lands so the
      // button doesn't briefly enable.
    } catch (err) {
      setBusy(false);
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Send failed' });
    }
  };

  const cancelSignIn = async () => {
    try {
      await window.keel.cloudCancelSignIn();
    } catch {
      // Even if cancel IPC errors, fall back to the signed-out view.
    }
    setStage('signed-out');
    setBusy(false);
    setMessage(null);
  };

  const signOut = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await window.keel.cloudSignOut();
      setStage('signed-out');
      setMessage({ tone: 'info', text: 'Signed out. Captures stay local until you sign in again.' });
      const s = await window.keel.cloudStatus();
      setStatus(s);
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Sign-out failed' });
    } finally {
      setBusy(false);
    }
  };

  // Silence unused-warning while keeping emailRef wired for future
  // handlers that want it.
  void emailRef;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <SectionCard
        title="Your account"
        description="Keel Cloud is the optional paid tier. The free local app works without an account."
      >
        {stage === 'signed-out' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              style={inputStyle}
              disabled={busy}
              onKeyDown={(e) => { if (e.key === 'Enter') void requestLink(); }}
            />
            <div>
              <button onClick={requestLink} disabled={busy || !email.trim()} style={buttonPrimary}>
                {busy ? 'Sending…' : 'Send sign-in link'}
              </button>
            </div>
          </div>
        )}

        {stage === 'waiting-link' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Spinner />
              <div style={{ fontSize: 14 }}>
                Check your email — we sent a sign-in link to <strong>{email.trim()}</strong>.
              </div>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Click the link and Keel will sign you in automatically. You can close this window once you do.
            </div>
            <div>
              <button onClick={cancelSignIn} style={buttonSecondary}>
                Cancel / use a different email
              </button>
            </div>
          </div>
        )}

        {stage === 'signed-in' && status && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)' }} />
              <div style={{ fontSize: 14 }}>
                Signed in as <strong>{status.email}</strong>
              </div>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Captures from your phone arrive within 30 seconds. Reminders fire as push notifications even when this Mac is asleep.
            </div>
            <div>
              <button onClick={signOut} disabled={busy} style={buttonSecondary}>
                {busy ? 'Signing out…' : 'Sign out'}
              </button>
            </div>
          </div>
        )}

        {message && (
          <div style={{
            marginTop: 12, padding: '8px 10px', borderRadius: 6, fontSize: 13,
            color: message.tone === 'error' ? '#c33' : 'var(--text-secondary)',
            background: message.tone === 'error' ? 'rgba(204, 51, 51, 0.08)' : 'var(--surface-muted)',
          }}>
            {message.text}
          </div>
        )}
      </SectionCard>

      {/* The "API endpoint" override that used to live here was useful
          for testing against a local or staging server, but confused
          real users and created support load. Removed from the UI for
          v0.4.x. Power users / contributors can still override the
          endpoint by editing `cloudApiBase` in:
            ~/Library/Application Support/Keel/settings.json
          The IPC + setting + cloudSetApiBase preload bridge are still
          wired — only the visible panel is gone. */}
    </div>
  );
}

// Lightweight CSS-only spinner so we don't pull in a dep.
function Spinner() {
  return (
    <span
      aria-hidden
      style={{
        width: 16,
        height: 16,
        borderRadius: '50%',
        border: '2px solid var(--border-default)',
        borderTopColor: 'var(--accent)',
        animation: 'keel-spin 0.8s linear infinite',
        display: 'inline-block',
      }}
    >
      <style>{`@keyframes keel-spin { to { transform: rotate(360deg); } }`}</style>
    </span>
  );
}

// Minimal inline styles to keep this panel self-contained and avoid
// pulling in Settings.tsx's helpers. Matches Keel desktop tokens.

const inputStyle: React.CSSProperties = {
  padding: '8px 12px',
  border: '1px solid var(--border-input)',
  borderRadius: 6,
  background: 'var(--bg-input-focus)',
  color: 'var(--text-primary)',
  fontSize: 14,
  outline: 'none',
};

const buttonPrimary: React.CSSProperties = {
  padding: '8px 14px',
  background: 'var(--accent)',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 14,
  fontWeight: 500,
};

const buttonSecondary: React.CSSProperties = {
  padding: '8px 14px',
  background: 'transparent',
  color: 'var(--text-primary)',
  border: '1px solid var(--border-btn)',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 14,
};

// Local copy of the SectionCard shape used in Settings.tsx so we
// don't have to export it from there.
function SectionCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border-default)',
      borderRadius: 10,
      padding: 20,
    }}>
      <h3 style={{ margin: 0, fontSize: 16, color: 'var(--text-primary)' }}>{title}</h3>
      {description && (
        <p style={{ margin: '4px 0 16px', fontSize: 13, color: 'var(--text-secondary)' }}>{description}</p>
      )}
      {children}
    </section>
  );
}
