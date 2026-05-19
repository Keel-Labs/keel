// Settings → Keel Cloud panel.
//
// Three states the user can be in:
//   1. signed out  — show explainer + email form
//   2. pending verify  — show 6-8 digit code input
//   3. signed in  — show email + sign-out + API base override
//
// The actual auth round-trips go through the main process via the
// preload bridge (window.keel.cloud*). This component is renderer-
// only and stateless about the session itself — main.ts is the
// source of truth via cloudStatus().

import { useEffect, useState } from 'react';

type Stage = 'signed-out' | 'pending' | 'signed-in';

interface Status {
  enabled: boolean;
  signedIn: boolean;
  email: string;
  apiBase: string;
}

const DEFAULT_API_BASE = 'https://api.keel.app';

export default function KeelCloudPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [stage, setStage] = useState<Stage>('signed-out');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'info' | 'error'; text: string } | null>(null);
  const [apiBaseDraft, setApiBaseDraft] = useState('');

  // Initial status fetch + react to background sign-out from main.
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const s = await window.keel.cloudStatus();
        if (cancelled) return;
        setStatus(s);
        setStage(s.signedIn ? 'signed-in' : 'signed-out');
        setApiBaseDraft(s.apiBase);
        if (s.email) setEmail(s.email);
      } catch {
        // first render before main is ready, etc.
      }
    };
    void refresh();
    const off = window.keel.onCloudSignedOut(() => {
      setStage('signed-out');
      setMessage({ tone: 'info', text: 'Your session expired. Sign in again to keep using Keel Cloud.' });
      void refresh();
    });
    return () => { cancelled = true; off?.(); };
  }, []);

  const requestLink = async () => {
    const trimmed = email.trim();
    if (!trimmed) return;
    setBusy(true);
    setMessage(null);
    try {
      await window.keel.cloudRequestMagicLink(trimmed);
      setStage('pending');
      setMessage({ tone: 'info', text: `We sent a sign-in code to ${trimmed}. Check your inbox.` });
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Send failed' });
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    const trimmedCode = code.trim();
    if (!trimmedCode) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await window.keel.cloudVerify(email.trim(), trimmedCode);
      setStage('signed-in');
      setCode('');
      setMessage({ tone: 'info', text: `Signed in as ${result.email}.` });
      const s = await window.keel.cloudStatus();
      setStatus(s);
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Verification failed' });
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await window.keel.cloudSignOut();
      setStage('signed-out');
      setCode('');
      setMessage({ tone: 'info', text: 'Signed out. Captures stay local until you sign in again.' });
      const s = await window.keel.cloudStatus();
      setStatus(s);
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Sign-out failed' });
    } finally {
      setBusy(false);
    }
  };

  const saveApiBase = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const next = (apiBaseDraft.trim() || DEFAULT_API_BASE).replace(/\/$/, '');
      const { apiBase } = await window.keel.cloudSetApiBase(next);
      setStatus((prev) => prev ? { ...prev, apiBase } : prev);
      setApiBaseDraft(apiBase);
      setMessage({ tone: 'info', text: `API base set to ${apiBase}.` });
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Could not save API base' });
    } finally {
      setBusy(false);
    }
  };

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
                {busy ? 'Sending…' : 'Send sign-in code'}
              </button>
            </div>
          </div>
        )}

        {stage === 'pending' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              Sent a code to <strong>{email.trim()}</strong>. Paste it below.
            </div>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123456"
              autoFocus
              inputMode="numeric"
              autoComplete="one-time-code"
              style={{ ...inputStyle, fontFamily: 'var(--font-mono)', letterSpacing: 4 }}
              disabled={busy}
              onKeyDown={(e) => { if (e.key === 'Enter') void verify(); }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={verify} disabled={busy || !code.trim()} style={buttonPrimary}>
                {busy ? 'Verifying…' : 'Sign in'}
              </button>
              <button onClick={() => { setStage('signed-out'); setCode(''); setMessage(null); }} disabled={busy} style={buttonSecondary}>
                Use a different email
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

      <SectionCard
        title="API endpoint"
        description="Where this Mac sends captures and reminders. Change only if you're testing against a local or staging server."
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input
            type="text"
            value={apiBaseDraft}
            onChange={(e) => setApiBaseDraft(e.target.value)}
            placeholder={DEFAULT_API_BASE}
            spellCheck={false}
            autoComplete="off"
            style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }}
            disabled={busy}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={saveApiBase}
              disabled={busy || apiBaseDraft.trim() === status?.apiBase}
              style={buttonPrimary}
            >
              Save endpoint
            </button>
            <button
              onClick={() => setApiBaseDraft(DEFAULT_API_BASE)}
              disabled={busy}
              style={buttonSecondary}
            >
              Reset to default
            </button>
          </div>
        </div>
      </SectionCard>
    </div>
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
