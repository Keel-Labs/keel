import React, { useEffect, useMemo, useState } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

const LAST_SEEN_VERSION_KEY = 'keel:last-seen-version';
const FIRST_RUN_KEY = 'keel:first-run-done';
const REPO = 'Keel-Labs/keel';

interface ReleasePayload {
  name: string | null;
  body: string;
}

async function fetchReleaseNotes(version: string): Promise<ReleasePayload | null> {
  // Try the exact-version tag first. If the build is ahead of any published
  // release (common during dev / pre-releases), fall back to the latest
  // release so we still show something useful instead of a blank modal.
  try {
    const exact = await fetch(`https://api.github.com/repos/${REPO}/releases/tags/v${version}`);
    if (exact.ok) {
      const data = await exact.json() as { name?: string; body?: string };
      return { name: data.name ?? null, body: data.body ?? '' };
    }

    const latest = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`);
    if (latest.ok) {
      const data = await latest.json() as { name?: string; body?: string; tag_name?: string };
      const tag = data.tag_name ? ` (${data.tag_name})` : '';
      const header = `_You're on v${version}. Showing the most recent published release${tag}._\n\n`;
      return { name: data.name ?? null, body: header + (data.body ?? '') };
    }
    return null;
  } catch {
    return null;
  }
}

function renderMarkdown(md: string): string {
  const html = marked.parse(md, { breaks: true, gfm: true }) as string;
  return DOMPurify.sanitize(html, { ADD_ATTR: ['target'] });
}

export default function WhatsNewModal() {
  const [open, setOpen] = useState(false);
  const [version, setVersion] = useState<string | null>(null);
  const [release, setRelease] = useState<ReleasePayload | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const current = await window.keel.getAppVersion?.();
        if (!current || cancelled) return;
        const lastSeen = localStorage.getItem(LAST_SEEN_VERSION_KEY);
        const firstRunDone = localStorage.getItem(FIRST_RUN_KEY);
        if (!firstRunDone) {
          // First-ever launch: don't show modal, just seed state.
          localStorage.setItem(FIRST_RUN_KEY, '1');
          localStorage.setItem(LAST_SEEN_VERSION_KEY, current);
          return;
        }
        if (lastSeen === current) return;
        setVersion(current);
        setOpen(true);
        setLoading(true);
        const notes = await fetchReleaseNotes(current);
        if (cancelled) return;
        setRelease(notes);
        setLoading(false);
      } catch {
        // ignore
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const html = useMemo(() => {
    if (!release) return '';
    return renderMarkdown(release.body || '_No release notes provided._');
  }, [release]);

  if (!open || !version) return null;

  const dismiss = () => {
    localStorage.setItem(LAST_SEEN_VERSION_KEY, version);
    setOpen(false);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          background: 'var(--bg-base)', color: 'var(--text-primary)',
          border: '1px solid var(--panel-border)', borderRadius: 12,
          width: 'min(640px, 92vw)', maxHeight: '80vh', display: 'flex',
          flexDirection: 'column', overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
        }}
      >
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid var(--panel-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>You're now on</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>
              {release?.name ?? `What's new in v${version}`}
            </div>
          </div>
          <button
            type="button"
            onClick={dismiss}
            style={{
              background: 'transparent', border: 'none', color: 'var(--text-muted)',
              fontSize: 22, cursor: 'pointer', padding: 4,
            }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1, fontSize: 14, lineHeight: 1.55 }}>
          {loading && <div style={{ color: 'var(--text-muted)' }}>Loading release notes…</div>}
          {!loading && !release && (
            <div style={{ color: 'var(--text-muted)' }}>
              Couldn't load release notes from GitHub. You're running v{version}.
            </div>
          )}
          {!loading && release && (
            <div className="markdown-body" dangerouslySetInnerHTML={{ __html: html }} />
          )}
        </div>

        <div style={{
          padding: '12px 20px', borderTop: '1px solid var(--panel-border)',
          display: 'flex', justifyContent: 'flex-end',
        }}>
          <button
            type="button"
            onClick={dismiss}
            style={{
              padding: '8px 16px', borderRadius: 8, border: '1px solid var(--panel-border)',
              background: 'var(--surface-muted)', color: 'var(--text-primary)',
              cursor: 'pointer', fontSize: 13, fontFamily: 'inherit',
            }}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
