import React, { useCallback, useEffect, useState } from 'react';
import ModelInterview from './ModelInterview';
import type { ProStatus } from '../../shared/types';

// About Me renders the model-of-you file (<workspace>/.keel/model-of-me.md).
// Pro-gated: check both Pro entitlement AND file existence before showing model.
// Free users see upsell teaser even if file exists (defensive gating).
const MODEL_PATH = '.keel/model-of-me.md';
const LOCK_MARKER = '<!-- locked -->';

interface Section {
  heading: string;
  locked: boolean;
  bullets: string[];
  prose: string[];
  emptyHint: string | null;
}

// Minimal section splitter mirroring core parseModel. Lives here (not imported
// from core) because the core module pulls in Node fs and can't run in the
// renderer; the format is stable and trivial to split on level-2 headings.
function parseSections(content: string): Section[] {
  const sections: Section[] = [];
  let current: { heading: string; lines: string[] } | null = null;

  for (const line of content.split('\n')) {
    const headingMatch = line.match(/^##\s+(.+?)\s*$/);
    if (headingMatch) {
      if (current) sections.push(finalizeSection(current));
      current = { heading: headingMatch[1].trim(), lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
    // lines before the first heading (the file preamble comment) are ignored
  }
  if (current) sections.push(finalizeSection(current));
  return sections;
}

function finalizeSection(raw: { heading: string; lines: string[] }): Section {
  const locked = raw.lines.some((l) => l.includes(LOCK_MARKER));
  const bullets: string[] = [];
  const prose: string[] = [];
  const commentText: string[] = [];

  // Strip HTML comments (lock marker + placeholder hints), capturing the inner
  // text of any standalone placeholder comment to use as an empty-state hint.
  const body = raw.lines.join('\n');
  const commentRegex = /<!--([\s\S]*?)-->/g;
  let m: RegExpExecArray | null;
  while ((m = commentRegex.exec(body)) !== null) {
    const inner = m[1].trim();
    if (inner && inner !== 'locked') commentText.push(inner);
  }
  const withoutComments = body.replace(commentRegex, '');

  for (const rawLine of withoutComments.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('- ') || line.startsWith('* ')) {
      bullets.push(line.replace(/^[-*]\s+/, ''));
    } else {
      prose.push(line);
    }
  }

  const emptyHint =
    bullets.length === 0 && prose.length === 0
      ? commentText.join(' ') || 'Nothing here yet.'
      : null;

  return { heading: raw.heading, locked, bullets, prose, emptyHint };
}

function LockIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8Z" />
    </svg>
  );
}

function emphasizeInline(text: string): React.ReactNode {
  // Render **bold** spans; everything else as-is. Keeps the renderer dependency-free.
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    /^\*\*[^*]+\*\*$/.test(part) ? <strong key={i}>{part.slice(2, -2)}</strong> : <span key={i}>{part}</span>,
  );
}

export default function AboutMe() {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [interviewing, setInterviewing] = useState(false);
  const [proStatus, setProStatus] = useState<ProStatus | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    return Promise.all([
      window.keel.proStatus(),
      window.keel.readFile(MODEL_PATH),
    ])
      .then(([pro, text]) => {
        // Only show model if Pro is active AND file has content
        if (pro.isPro && text.trim().length > 0) {
          setContent(text);
        } else {
          setContent(null);
        }
        setProStatus(pro);
      })
      .catch(() => {
        setContent(null);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      window.keel.proStatus(),
      window.keel.readFile(MODEL_PATH),
    ])
      .then(([pro, text]) => {
        if (cancelled) return;
        // Only show model if Pro is active AND file has content
        if (pro.isPro && text.trim().length > 0) {
          setContent(text);
        } else {
          setContent(null);
        }
        setProStatus(pro);
      })
      .catch(() => {
        if (cancelled) return;
        setContent(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (interviewing) {
    return (
      <ModelInterview
        onComplete={() => {
          setInterviewing(false);
          void load();
        }}
        onCancel={() => setInterviewing(false)}
      />
    );
  }

  if (loading) {
    return (
      <div className="about-me">
        <div className="about-me__loading">Loading what Keel knows about you…</div>
      </div>
    );
  }

  // No seeded model → Pro upsell teaser (the marketing surface).
  if (!content) {
    return (
      <div className="about-me">
        <div className="about-me__lock">
          <div className="about-me__lock-badge">
            <LockIcon size={22} />
          </div>
          <h2 className="about-me__lock-title">Let Keel learn who you are</h2>
          <p className="about-me__lock-text">
            With Keel Pro: Keel learns your goals, the people in your work, your voice, and the
            things you keep circling back to. Every chat gets more you-aware. Use any AI model you
            want—Claude, OpenAI, or others. You control which model and the cost.
          </p>
          <p className="about-me__lock-subtext">Personalized AI + your choice of models</p>
          <button className="about-me__lock-cta" onClick={() => setInterviewing(true)}>
            Get started
          </button>
        </div>
      </div>
    );
  }

  const sections = parseSections(content);

  return (
    <div className="about-me">
      <div className="about-me__header">
        <div className="about-me__header-icon"><SparkleIcon /></div>
        <div>
          <h1 className="about-me__title">About Me</h1>
          <p className="about-me__subtitle">What Keel has learned about you. The longer you use Keel, the better it knows you.</p>
        </div>
      </div>

      <div className="about-me__scroll">
        <div className="about-me__grid">
          {sections.map((section) => (
            <section
              className={
                section.heading === 'Archive' ? 'about-me__card about-me__card--archive' : 'about-me__card'
              }
              key={section.heading}
            >
              <div className="about-me__card-head">
                <h2 className="about-me__card-title">{section.heading}</h2>
                {section.locked && (
                  <span className="about-me__lock-chip" title="You locked this section — Keel won't change it">
                    <LockIcon /> Locked
                  </span>
                )}
              </div>

              {section.emptyHint ? (
                <p className="about-me__empty">{section.emptyHint}</p>
              ) : section.bullets.length > 0 ? (
                <ul className="about-me__list">
                  {section.bullets.map((b, i) => (
                    <li key={i}>{emphasizeInline(b)}</li>
                  ))}
                </ul>
              ) : (
                section.prose.map((p, i) => (
                  <p className="about-me__prose" key={i}>{emphasizeInline(p)}</p>
                ))
              )}
            </section>
          ))}
        </div>

        <p className="about-me__footnote">
          Keel maintains this from your daily logs and chats. Edit{' '}
          <code>.keel/model-of-me.md</code> in any editor to correct it, or add{' '}
          <code>&lt;!-- locked --&gt;</code> under a heading to keep Keel from changing it.
        </p>
      </div>
    </div>
  );
}
