/**
 * Google Calendar connector.
 *
 * Syncs upcoming events and writes them as structured markdown files
 * in the brain's `projects/calendar/` directory.
 */

import { FileManager } from '../fileManager';
import { getValidAccessToken, type GoogleOAuthConfig } from './googleAuth';
import { getSyncState, upsertSyncState, logActivity } from '../db';

const CONNECTOR_KEY = 'google-calendar';
const CALENDAR_DIR = 'projects/calendar';

interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: string;   // ISO datetime or date
  end: string;
  location?: string;
  attendees: string[];
  htmlLink?: string;
}

/**
 * Fetch upcoming events from Google Calendar API.
 */
async function fetchUpcomingEvents(
  accessToken: string,
  daysAhead: number = 7
): Promise<CalendarEvent[]> {
  const now = new Date();
  const future = new Date(now.getTime() + daysAhead * 86_400_000);

  const params = new URLSearchParams({
    timeMin: now.toISOString(),
    timeMax: future.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '50',
  });

  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Calendar API error: ${response.status} ${err}`);
  }

  const data = await response.json() as any;
  const events: CalendarEvent[] = (data.items || []).map((item: any) => ({
    id: item.id,
    summary: item.summary || '(No title)',
    description: item.description || undefined,
    start: item.start?.dateTime || item.start?.date || '',
    end: item.end?.dateTime || item.end?.date || '',
    location: item.location || undefined,
    attendees: (item.attendees || []).map((a: any) => a.displayName || a.email).filter(Boolean),
    htmlLink: item.htmlLink || undefined,
  }));

  return events;
}

/**
 * Format a single event as a markdown section.
 */
function formatEvent(event: CalendarEvent): string {
  const startDate = new Date(event.start);
  const endDate = new Date(event.end);

  const timeStr = startDate.toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
  const endTimeStr = endDate.toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true,
  });

  const lines: string[] = [];
  lines.push(`### ${event.summary}`);
  lines.push(`**Time:** ${timeStr} - ${endTimeStr}`);
  if (event.location) lines.push(`**Location:** ${event.location}`);
  if (event.attendees.length > 0) {
    lines.push(`**Attendees:** ${event.attendees.join(', ')}`);
  }
  if (event.description) {
    lines.push('');
    lines.push(event.description.slice(0, 500));
  }
  return lines.join('\n');
}

/**
 * Format a day's worth of events as a markdown file.
 */
function formatDayEvents(date: string, events: CalendarEvent[]): string {
  const lines: string[] = [];
  lines.push(`# Calendar — ${date}`);
  lines.push('');
  if (events.length === 0) {
    lines.push('No events scheduled.');
  } else {
    for (const event of events) {
      lines.push(formatEvent(event));
      lines.push('');
    }
  }
  return lines.join('\n');
}

/**
 * Sync Google Calendar events to the brain.
 * Writes markdown files per day in ongoing/calendar/.
 */
export async function syncCalendar(
  fileManager: FileManager,
  brainPath: string,
  config: GoogleOAuthConfig,
  daysAhead: number = 7
): Promise<{ eventCount: number; filesWritten: number }> {
  const accessToken = await getValidAccessToken(brainPath, config);
  const events = await fetchUpcomingEvents(accessToken, daysAhead);

  // Group events by date
  const byDate = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const date = event.start.split('T')[0] || event.start;
    const existing = byDate.get(date) || [];
    existing.push(event);
    byDate.set(date, existing);
  }

  // Ensure calendar directory exists
  const calDir = CALENDAR_DIR;

  let filesWritten = 0;
  for (const [date, dayEvents] of byDate) {
    const content = formatDayEvents(date, dayEvents);
    const filePath = `${calDir}/${date}.md`;
    await fileManager.writeFile(filePath, content);
    filesWritten++;
  }

  // Update sync state
  upsertSyncState(brainPath, CONNECTOR_KEY, {
    lastSync: Date.now(),
    status: 'idle',
    cursor: null,
  });

  logActivity(brainPath, 'calendar-sync', `Synced ${events.length} events across ${filesWritten} days`);

  return { eventCount: events.length, filesWritten };
}

/**
 * Get today's events as a formatted string (for daily brief integration).
 */
export async function getTodayEvents(
  brainPath: string,
  config: GoogleOAuthConfig
): Promise<string> {
  const accessToken = await getValidAccessToken(brainPath, config);
  const events = await fetchUpcomingEvents(accessToken, 1);

  const today = new Date().toISOString().split('T')[0];
  const todayEvents = events.filter((e) => e.start.startsWith(today));

  if (todayEvents.length === 0) return 'No events scheduled for today.';

  const lines: string[] = [];
  for (const event of todayEvents) {
    const startDate = new Date(event.start);
    const time = startDate.toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', hour12: true,
    });
    const attendeeStr = event.attendees.length > 0 ? ` (with ${event.attendees.join(', ')})` : '';
    lines.push(`- **${time}** — ${event.summary}${attendeeStr}`);
  }
  return lines.join('\n');
}

/**
 * Get upcoming events as a formatted string for a given number of days.
 * Used for auto-enriching chat messages when users ask about their schedule.
 */
export async function getUpcomingEventsFormatted(
  brainPath: string,
  config: GoogleOAuthConfig,
  daysAhead: number = 7
): Promise<string> {
  const accessToken = await getValidAccessToken(brainPath, config);
  const events = await fetchUpcomingEvents(accessToken, daysAhead);

  if (events.length === 0) return `No events scheduled in the next ${daysAhead} day(s).`;

  // Group by date
  const byDate = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const date = event.start.split('T')[0] || event.start;
    const existing = byDate.get(date) || [];
    existing.push(event);
    byDate.set(date, existing);
  }

  const lines: string[] = [];
  for (const [date, dayEvents] of byDate) {
    const d = new Date(date + 'T00:00:00');
    const label = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    lines.push(`**${label}:**`);
    for (const event of dayEvents) {
      const startDate = new Date(event.start);
      const time = startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
      const attendeeStr = event.attendees.length > 0 ? ` (with ${event.attendees.join(', ')})` : '';
      lines.push(`- ${time} — ${event.summary}${attendeeStr}`);
    }
    lines.push('');
  }
  return lines.join('\n').trim();
}
