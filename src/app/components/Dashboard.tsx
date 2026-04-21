import React, { useState, useEffect, useCallback } from 'react';
import type { TaskGroup, Reminder, ActivityLogEntry, NewsItem, WeatherInfo, Settings } from '../../shared/types';
import { getPersonalityGreeting } from '../../core/personalities';

interface DashboardProps {
  onNavigateToTasks: () => void;
  onNavigateToChat: (sessionId: string) => void;
  onNewChatWithDraft?: (draft: string, autoSend?: boolean) => void;
}

// ── Helpers ──

function timeAgo(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function timeUntil(timestamp: number): string {
  const now = Date.now();
  const diff = timestamp - now;
  if (diff < 0) return 'overdue';
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `in ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `in ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'tomorrow';
  return `in ${days}d`;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function getYesterdayKey(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function getTodayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseEodTomorrow(content: string): string[] {
  // Find ## EOD Summary section
  const eodMatch = content.match(/## EOD Summary\s*\n([\s\S]*?)(?=\n## |$)/);
  if (!eodMatch) return [];

  const eodSection = eodMatch[1];

  // Find **Tomorrow** block
  const tomorrowMatch = eodSection.match(/\*\*Tomorrow\*\*[^\n]*\n([\s\S]*?)(?=\n\*\*|$)/);
  if (!tomorrowMatch) return [];

  return tomorrowMatch[1]
    .split('\n')
    .map((line) => line.replace(/^[-*]\s*/, '').trim())
    .filter((line) => line.length > 0);
}

const ACTIVITY_LABELS: Record<string, string> = {
  chat: 'Conversation',
  capture: 'Captured note',
  'task-toggled': 'Task updated',
  'task-moved': 'Task moved',
  'task-accepted': 'Task accepted',
  'task-dismissed': 'Task dismissed',
  'reminder-created': 'Reminder set',
  'reminder-fired': 'Reminder fired',
  'calendar-sync': 'Calendar synced',
  'daily-brief': 'Daily brief',
  eod: 'EOD summary',
  reset: 'Profile reset',
  'export-pdf': 'PDF exported',
};

function activityLabel(action: string): string {
  return ACTIVITY_LABELS[action] || action;
}

// ── Greeting & Quotes ──

function useDailyQuote() {
  const [quote, setQuote] = useState<{ text: string; author: string } | null>(null);

  useEffect(() => {
    window.keel.getDailyQuote()
      .then(setQuote)
      .catch(() => setQuote({ text: 'Make today count.', author: '' }));
  }, []);

  return quote;
}

function getTimeOfDay(): 'morning' | 'afternoon' | 'evening' {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  return 'evening';
}

// ── Icons ──

function ArrowRightIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 01-3.46 0" />
    </svg>
  );
}

function ChecklistIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

// ── Component ──

export default function Dashboard({ onNavigateToTasks, onNavigateToChat, onNewChatWithDraft }: DashboardProps) {
  const [taskGroups, setTaskGroups] = useState<TaskGroup[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [activity, setActivity] = useState<ActivityLogEntry[]>([]);
  const [eodItems, setEodItems] = useState<string[]>([]);
  const [weather, setWeather] = useState<WeatherInfo | null>(null);
  const [userName, setUserName] = useState<string>('');
  const [personalityId, setPersonalityId] = useState<string>('default');
  const [loading, setLoading] = useState(true);
  const dailyQuote = useDailyQuote();

  const fetchAll = useCallback(async () => {
    try {
      const [groups, rems, acts, weatherInfo, settings] = await Promise.all([
        window.keel.listTasks(),
        window.keel.listReminders(),
        window.keel.getRecentActivity(15),
        window.keel.fetchWeather().catch(() => null),
        window.keel.getSettings(),
      ]);

      setTaskGroups(groups);
      setReminders(rems);
      setActivity(acts);
      setWeather(weatherInfo);
      setUserName(settings.userName || '');
      setPersonalityId(settings.personality || 'default');

      // Parse EOD "Tomorrow" items
      const items = await loadEodItems();
      setEodItems(items);
    } catch (err) {
      console.error('[Dashboard] Failed to fetch data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    const cleanup = window.keel.onMemoryUpdated(() => {
      fetchAll();
    });
    return cleanup;
  }, [fetchAll]);

  if (loading) {
    return (
      <div className="dashboard-pane">
        <div className="dashboard-pane__loading">Loading...</div>
      </div>
    );
  }

  // Derived data
  const openGroups = taskGroups
    .map((g) => ({ ...g, tasks: g.tasks.filter((t) => !t.completed) }))
    .filter((g) => g.tasks.length > 0);
  const totalOpen = openGroups.reduce((sum, g) => sum + g.tasks.length, 0);

  const upcomingReminders = reminders
    .filter((r) => !r.fired && r.dueAt > Date.now())
    .sort((a, b) => a.dueAt - b.dueAt)
    .slice(0, 5);


  return (
    <div className="dashboard-pane">
      <div className="dashboard-pane__header">
        <h1 className="dashboard-pane__title">
          <span className="dashboard-pane__glyph">✦</span>
          {getPersonalityGreeting(personalityId, userName, getTimeOfDay())}
        </h1>
        <div className="dashboard-pane__subtitle-row">
          <span className="dashboard-pane__info-item">
            <svg className="dashboard-pane__info-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            {formatDate(new Date())}
          </span>
          {weather && (
            <>
              <span className="dashboard-pane__separator">·</span>
              <span className="dashboard-pane__info-item">
                <svg className="dashboard-pane__info-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.5 19a4.5 4.5 0 1 0 0-9h-1.8A7 7 0 1 0 4 14.5" /><path d="M9 17l3 3 3-3" />
                </svg>
                {weather.temp} in {weather.location || 'your area'}
              </span>
            </>
          )}
          <span className="dashboard-pane__separator">·</span>
          <span className="dashboard-pane__info-item dashboard-pane__quote-inline">
            <svg className="dashboard-pane__info-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21z" />
              <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21z" />
            </svg>
            {dailyQuote ? `"${dailyQuote.text}"${dailyQuote.author ? ` - ${dailyQuote.author}` : ''}` : '…'}
          </span>
        </div>
      </div>

      <div className="dashboard-pane__grid">
        {/* Pick Up Where You Left Off — full width */}
        <DashboardSection title="Pick up where you left off" icon={<SunIcon />} wide>
          {eodItems.length > 0 ? (
            <ul className="dashboard-eod-list">
              {eodItems.map((item, i) => (
                <li key={i} className="dashboard-eod-list__item">{item}</li>
              ))}
            </ul>
          ) : (
            <p className="dashboard-section__empty">
              No EOD summary yet. Run an end-of-day to see focus items here.
            </p>
          )}
        </DashboardSection>

        {/* Tasks — left column */}
        <DashboardSection
          title="Tasks"
          icon={<ChecklistIcon />}
          badge={totalOpen > 0 ? `${totalOpen} open` : undefined}
          action={totalOpen > 0 ? { label: 'View all', onClick: onNavigateToTasks } : undefined}
        >
          {openGroups.length > 0 ? (
            <div className="dashboard-tasks">
              {openGroups.slice(0, 3).map((group) => (
                <div key={group.slug ?? 'general'} className="dashboard-tasks__group">
                  <div className="dashboard-tasks__group-name">{group.project}</div>
                  {group.tasks.slice(0, 3).map((task, i) => (
                    <div key={i} className="dashboard-tasks__item">
                      <span className="dashboard-tasks__bullet" />
                      <span className="dashboard-tasks__text">{task.text}</span>
                    </div>
                  ))}
                  {group.tasks.length > 3 && (
                    <div className="dashboard-tasks__more">
                      +{group.tasks.length - 3} more
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="dashboard-section__empty">No open tasks.</p>
          )}
        </DashboardSection>

        {/* Upcoming Reminders — right column */}
        <DashboardSection
          title="Reminders"
          icon={<BellIcon />}
          action={onNewChatWithDraft ? { label: 'View', onClick: () => onNewChatWithDraft('/reminders', true) } : undefined}
        >
          {upcomingReminders.length > 0 ? (
            <div className="dashboard-reminders">
              {upcomingReminders.map((r) => (
                <div key={r.id} className="dashboard-reminders__item">
                  <span className="dashboard-reminders__message">{r.message}</span>
                  <span className="dashboard-reminders__time">{timeUntil(r.dueAt)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="dashboard-section__empty">No upcoming reminders.</p>
          )}
        </DashboardSection>

        {/* Recent Activity — left column */}
        <DashboardSection title="Recent Activity" icon={<ClockIcon />}>
          {activity.length > 0 ? (
            <div className="dashboard-activity">
              {activity.map((entry) => (
                <div key={entry.id} className="dashboard-activity__item">
                  <span className="dashboard-activity__label">{activityLabel(entry.action)}</span>
                  {entry.detail && (
                    <span className="dashboard-activity__detail">{entry.detail.slice(0, 80)}</span>
                  )}
                  <span className="dashboard-activity__time">{timeAgo(entry.createdAt)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="dashboard-section__empty">No activity yet.</p>
          )}
        </DashboardSection>

        {/* AI News — right column */}
        <NewsSection />
      </div>
    </div>
  );
}

// ── Section wrapper ──

function DashboardSection({
  title,
  icon,
  badge,
  action,
  wide,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  badge?: string;
  action?: { label: string; onClick: () => void; icon?: React.ReactNode };
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`dashboard-section${wide ? ' dashboard-section--wide' : ''}`}>
      <div className="dashboard-section__header">
        <div className="dashboard-section__title-row">
          {icon && <span className="dashboard-section__icon">{icon}</span>}
          <h2 className="dashboard-section__title">{title}</h2>
          {badge && <span className="dashboard-section__badge">{badge}</span>}
        </div>
        {action && (
          <button className="dashboard-section__action" onClick={action.onClick}>
            {action.icon || <>{action.label} <ArrowRightIcon /></>}
          </button>
        )}
      </div>
      <div className="dashboard-section__body">{children}</div>
    </div>
  );
}

// ── EOD loader ──

async function loadEodItems(): Promise<string[]> {
  const yesterday = getYesterdayKey();
  try {
    const content = await window.keel.readFile(`daily-log/${yesterday}.md`);
    const items = parseEodTomorrow(content);
    if (items.length > 0) return items;
  } catch {
    // Yesterday's log doesn't exist — try most recent
  }

  // Fallback: find most recent daily-log
  try {
    const files = await window.keel.listFiles('daily-log');
    const mdFiles = files
      .filter((f) => f.name.endsWith('.md') && f.name !== `${getTodayKey()}.md`)
      .sort((a, b) => b.updatedAt - a.updatedAt);

    for (const file of mdFiles.slice(0, 3)) {
      try {
        const content = await window.keel.readFile(`daily-log/${file.name}`);
        const items = parseEodTomorrow(content);
        if (items.length > 0) return items;
      } catch {
        continue;
      }
    }
  } catch {
    // No daily-log directory
  }

  return [];
}

// ── News Section ──

function GlobeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
    </svg>
  );
}

function NewsSection() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    window.keel.fetchAiNews()
      .then(setNews)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <DashboardSection title="AI News" icon={<GlobeIcon />}>
      {loading ? (
        <p className="dashboard-section__empty">Loading news...</p>
      ) : news.length > 0 ? (
        <div className="dashboard-news">
          {news.map((item, i) => (
            <a
              key={i}
              className="dashboard-news__item"
              href={item.url}
              onClick={(e) => {
                e.preventDefault();
                window.keel.openPath(item.url);
              }}
              title={item.title}
            >
              <span className="dashboard-news__title">{item.title}</span>
              <span className="dashboard-news__meta">
                <span className="dashboard-news__source">{item.source}</span>
                <span className="dashboard-news__time">{timeAgo(item.publishedAt)}</span>
              </span>
            </a>
          ))}
        </div>
      ) : (
        <p className="dashboard-section__empty">Unable to load news. Check your connection.</p>
      )}
    </DashboardSection>
  );
}
