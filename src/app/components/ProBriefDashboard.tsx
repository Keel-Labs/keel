// Pro-gated dashboard showing daily briefs.
//
// Displays:
// - Today's brief (if generated)
// - Recent briefs (last 7 days)
// - Upsell teaser for free users
//
// Briefs are parsed from daily-log/{YYYY-MM-DD}.md files,
// extracting the "## Morning Brief" section.

import { useEffect, useState } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import type { ProStatus, FileEntry } from '../../shared/types';

interface ParsedBrief {
  date: string;
  dateObj: Date;
  content: string;
  generatedAt?: string;
}

interface State {
  isLoading: boolean;
  proStatus: ProStatus | null;
  briefs: ParsedBrief[];
  error: string | null;
}

export default function ProBriefDashboard() {
  const [state, setState] = useState<State>({
    isLoading: true,
    proStatus: null,
    briefs: [],
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    const loadBriefs = async () => {
      try {
        // Check Pro status
        const proStatus = await window.keel.proStatus();
        if (cancelled) return;

        if (!proStatus.isPro) {
          setState((prev) => ({
            ...prev,
            isLoading: false,
            proStatus,
            briefs: [],
          }));
          return;
        }

        // List files in daily-log directory
        const files = await window.keel.listFiles('daily-log');
        if (cancelled) return;

        // Sort by date descending, take last 7 days
        const sortedFiles = files
          .filter((f) => f.name.endsWith('.md'))
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .slice(0, 7);

        // Parse briefs from each file
        const briefs: ParsedBrief[] = [];
        for (const file of sortedFiles) {
          try {
            const content = await window.keel.readFile(`daily-log/${file.name}`);
            if (cancelled) return;

            // Extract date from filename (YYYY-MM-DD.md)
            const dateMatch = file.name.match(/(\d{4}-\d{2}-\d{2})/);
            const dateStr = dateMatch?.[1] || file.name;

            // Parse "## Morning Brief" section
            const briefMatch = content.match(
              /## Morning Brief\n([\s\S]*?)(?=\n##|\Z)/i
            );
            const briefContent = briefMatch?.[1]?.trim() || '';

            if (briefContent) {
              briefs.push({
                date: dateStr,
                dateObj: new Date(`${dateStr}T00:00:00`),
                content: briefContent,
              });
            }
          } catch (err) {
            console.error(`Failed to parse brief for ${file.name}:`, err);
          }
        }

        setState((prev) => ({
          ...prev,
          isLoading: false,
          proStatus,
          briefs: briefs.sort((a, b) => b.dateObj.getTime() - a.dateObj.getTime()),
        }));
      } catch (err) {
        if (!cancelled) {
          setState((prev) => ({
            ...prev,
            isLoading: false,
            error: err instanceof Error ? err.message : 'Failed to load briefs',
          }));
        }
      }
    };

    void loadBriefs();

    // Re-load when memory updates (new brief generated)
    const unsubscribe = window.keel.onMemoryUpdated(() => {
      void loadBriefs();
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const { isLoading, proStatus, briefs, error } = state;

  if (isLoading) {
    return (
      <div className="pro-brief-dashboard">
        <div className="loading">Loading briefs...</div>
      </div>
    );
  }

  // Non-Pro teaser
  if (!proStatus?.isPro) {
    return (
      <div className="pro-brief-dashboard pro-teaser">
        <div className="teaser-content">
          <h2>Keel Pro Daily Briefs</h2>
          <p>Every morning, Keel generates a personalized briefing:</p>
          <ul>
            <li>Top priorities for today</li>
            <li>Items carried forward from yesterday</li>
            <li>Suggested focus blocks (time-boxed work)</li>
            <li>Open tasks by project</li>
          </ul>
          <button
            className="button button--primary button--large"
            onClick={() => window.open('https://keel-labs.org/pro', '_blank')}
          >
            Upgrade to Pro
          </button>
        </div>
      </div>
    );
  }

  // Pro view with briefs
  return (
    <div className="pro-brief-dashboard">
      <div className="briefs-header">
        <h2>Daily Briefs</h2>
        {briefs.length > 0 && (
          <p className="briefs-count">
            {briefs.length} brief{briefs.length !== 1 ? 's' : ''} in the last 7 days
          </p>
        )}
      </div>

      {error && <div className="error-message">{error}</div>}

      {briefs.length === 0 ? (
        <div className="empty-state">
          <p>No briefings yet. Run <code>/daily-brief</code> to generate your first morning briefing.</p>
        </div>
      ) : (
        <div className="briefs-list">
          {briefs.map((brief) => (
            <div key={brief.date} className="brief-card">
              <div className="brief-card-header">
                <h3>
                  {brief.dateObj.toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })}
                </h3>
              </div>
              <div className="brief-card-content">
                <div
                  className="markdown-content"
                  dangerouslySetInnerHTML={{
                    __html: DOMPurify.sanitize(marked.parse(brief.content) as string),
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
