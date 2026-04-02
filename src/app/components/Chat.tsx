import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { Message as MessageType } from '../../shared/types';
import Message from './Message';
import { KeelIcon } from './KeelIcon';

const THINKING_MESSAGES = [
  'Moving fast and thinking things...',
  'Double-clicking into your ask...',
  'Finding product-market fit for this answer...',
  'Running it up the flagpole...',
  'Boiling the ocean...',
  'Aligning cross-functionally...',
  'Steeling my nerves...',
  'Clearing my throat...',
  'Gazing meaningfully into the distance...',
  'Sensing the weight of this moment...',
  'Reaching deep within...',
  'Rising to the occasion...',
  'Preparing for my close-up...',
  'Composing myself...',
  'Bracing for impact...',
  'Mustering every ounce of courage...',
  'Cross-referencing with the ancient texts...',
  'Following the breadcrumbs...',
  'Connecting the dots...',
  'Decoding the signal...',
  'Piecing the fragments together...',
  'Stalking the answer through dense undergrowth...',
  'Migrating toward a conclusion...',
  'Foraging for ideas...',
  'Circling overhead before landing...',
  'Burrowing deeper into the question...',
  'Emerging from the chrysalis...',
  'Waiting for conditions to be just right...',
  'Grazing on the data...',
  'Staring at the ceiling...',
  'Making coffee...',
  'Rewriting the first sentence for the 8th time...',
  'Definitely not procrastinating...',
  'The answer is near. It can sense it.',
  'Sniffing the wind...',
  'Molting...',
  'A thought stirs in the undergrowth...',
  'Camouflaged, waiting...',
  'Scanning the horizon...',
  'In pursuit...',
  'Drinking from the watering hole...',
  'Building a nest for your answer...',
  'Preparing for the long winter...',
];

function NauticalLoader() {
  // Square wave box — 24x24, transparent bg, coral waves with splash droplets
  const s = 24;
  return (
    <svg viewBox={`0 0 ${s} ${s}`} xmlns="http://www.w3.org/2000/svg" width={s} height={s} style={{ flexShrink: 0 }}>
      <defs>
        <clipPath id="wave-clip">
          <rect x="0" y="0" width={s} height={s} rx="4"/>
        </clipPath>
      </defs>
      <g clipPath="url(#wave-clip)">
        {/* Water body */}
        <rect x="0" y="16" width={s} height="12" fill="#CF7A5C" opacity="0.15"/>
        {/* Wave layer 1 */}
        <path fill="#CF7A5C" opacity="0.55">
          <animate
            attributeName="d"
            dur="2.4s"
            repeatCount="indefinite"
            calcMode="spline"
            keySplines="0.45 0 0.55 1; 0.45 0 0.55 1"
            values="
              M-5 16 Q3 6 11 16 Q19 26 27 16 L28 28 L-5 28 Z;
              M-5 16 Q3 26 11 16 Q19 6 27 16 L28 28 L-5 28 Z;
              M-5 16 Q3 6 11 16 Q19 26 27 16 L28 28 L-5 28 Z
            "/>
        </path>
        {/* Wave layer 2 */}
        <path fill="#CF7A5C" opacity="0.3">
          <animate
            attributeName="d"
            dur="1.8s"
            begin="-0.9s"
            repeatCount="indefinite"
            calcMode="spline"
            keySplines="0.45 0 0.55 1; 0.45 0 0.55 1"
            values="
              M-5 18 Q3 9 11 18 Q19 27 27 18 L28 28 L-5 28 Z;
              M-5 18 Q3 27 11 18 Q19 9 27 18 L28 28 L-5 28 Z;
              M-5 18 Q3 9 11 18 Q19 27 27 18 L28 28 L-5 28 Z
            "/>
        </path>
        {/* Splash droplet at first crest */}
        <circle cx="11" r="1.5" fill="#CF7A5C" opacity="0">
          <animate attributeName="cy" dur="2.4s" repeatCount="indefinite" values="6;1;6" calcMode="spline" keySplines="0.3 0 0.7 1; 0.3 0 0.7 1"/>
          <animate attributeName="opacity" dur="2.4s" repeatCount="indefinite" values="0;0.6;0" calcMode="spline" keySplines="0.3 0 0.7 1; 0.3 0 0.7 1"/>
        </circle>
        {/* Splash droplet at second crest */}
        <circle cx="20" r="1" fill="#CF7A5C" opacity="0">
          <animate attributeName="cy" dur="1.8s" begin="-0.9s" repeatCount="indefinite" values="9;3;9" calcMode="spline" keySplines="0.3 0 0.7 1; 0.3 0 0.7 1"/>
          <animate attributeName="opacity" dur="1.8s" begin="-0.9s" repeatCount="indefinite" values="0;0.45;0" calcMode="spline" keySplines="0.3 0 0.7 1; 0.3 0 0.7 1"/>
        </circle>
      </g>
    </svg>
  );
}

function ThinkingIndicator() {
  const [messageIndex, setMessageIndex] = useState(() =>
    Math.floor(Math.random() * THINKING_MESSAGES.length)
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setMessageIndex((prev) => {
        let next;
        do { next = Math.floor(Math.random() * THINKING_MESSAGES.length); } while (next === prev);
        return next;
      });
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 16, paddingRight: 48 }}>
      <div style={{
        background: '#252525', border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '16px 16px 16px 4px', padding: '12px 16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <NauticalLoader />
          <span className="thinking-text" style={{
            fontSize: 13, color: 'rgba(255,255,255,0.4)',
            fontStyle: 'italic',
          }}>
            {THINKING_MESSAGES[messageIndex]}
          </span>
        </div>
      </div>
    </div>
  );
}

function ThinkingSteps({ steps }: { steps: string[] }) {
  const [expanded, setExpanded] = useState(false);
  const latest = steps[steps.length - 1];

  return (
    <div style={{
      display: 'flex', justifyContent: 'flex-start', marginBottom: 12, paddingRight: 48,
    }}>
      <div style={{
        background: 'rgba(207,122,92,0.06)',
        border: '1px solid rgba(207,122,92,0.15)',
        borderRadius: 12, padding: '8px 14px',
        maxWidth: '80%', fontSize: 12,
      }}>
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            background: 'none', border: 'none', padding: 0, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6, width: '100%',
            color: 'rgba(255,255,255,0.5)',
          }}
        >
          <span style={{
            fontSize: 8, transition: 'transform 0.15s',
            transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
          }}>▶</span>
          <span style={{ fontStyle: 'italic' }}>
            {expanded ? 'Thinking steps' : latest}
          </span>
        </button>
        {expanded && (
          <div style={{ marginTop: 6, paddingLeft: 14 }}>
            {steps.map((step, i) => (
              <div key={i} style={{
                color: 'rgba(255,255,255,0.4)', padding: '2px 0',
                borderLeft: '2px solid rgba(207,122,92,0.2)',
                paddingLeft: 10, marginBottom: 2,
              }}>
                {step}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const WELCOME_SUGGESTIONS = [
  { label: 'What am I working on?', icon: '📋' },
  { label: '/daily-brief', icon: '☀️' },
  { label: '/capture', icon: '📎' },
  { label: '/reminders', icon: '🔔' },
];

function isPdfCommand(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (/^(make|export|save|create|generate|give me|get me|download)\s.*(pdf)$/i.test(t)) return true;
  if (/^(pdf|save pdf|export pdf|make pdf|to pdf|as pdf)$/i.test(t)) return true;
  if (/^turn\s.*(pdf)$/i.test(t)) return true;
  if (/pdf/i.test(t) && /(make|create|save|export|want|need|give|get|generate|download)/i.test(t)) return true;
  return false;
}

function isGoogleDocCommand(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (/google\s*doc/i.test(t) && /(make|create|save|export|want|need|give|get|generate|send|turn)/i.test(t)) return true;
  if (/^(export|save|send)\s.*google\s*doc/i.test(t)) return true;
  return false;
}

/**
 * Parse /schedule command for creating calendar events.
 * /schedule tomorrow at 9am Meeting with Alex
 * /schedule 2026-04-03 2:00 PM Team standup
 * /schedule today at 3pm for 2 hours Design review
 */
function parseScheduleCommand(text: string): { summary: string; startTime: string; endTime: string } | null {
  const t = text.trim();
  const match = t.match(/^\/schedule\s+(.+)/i);
  if (!match) return null;

  const rest = match[1];
  const now = new Date();

  // "tomorrow at HH:MM [am/pm] [for N hours] message"
  const tomorrowMatch = rest.match(/^tomorrow\s+(?:at\s+)?(\d{1,2}):?(\d{2})?\s*(am|pm)?\s+(?:for\s+(\d+)\s*(?:hours?|hrs?)\s+)?(.+)/i);
  if (tomorrowMatch) {
    const due = parseTimeToDate(now, tomorrowMatch[1], tomorrowMatch[2] || '00', tomorrowMatch[3]);
    due.setDate(due.getDate() + 1);
    const durationHrs = tomorrowMatch[4] ? parseInt(tomorrowMatch[4]) : 1;
    const end = new Date(due.getTime() + durationHrs * 3_600_000);
    return { summary: tomorrowMatch[5], startTime: due.toISOString(), endTime: end.toISOString() };
  }

  // "today at HH:MM [am/pm] [for N hours] message"
  const todayMatch = rest.match(/^today\s+(?:at\s+)?(\d{1,2}):?(\d{2})?\s*(am|pm)?\s+(?:for\s+(\d+)\s*(?:hours?|hrs?)\s+)?(.+)/i);
  if (todayMatch) {
    const due = parseTimeToDate(now, todayMatch[1], todayMatch[2] || '00', todayMatch[3]);
    const durationHrs = todayMatch[4] ? parseInt(todayMatch[4]) : 1;
    const end = new Date(due.getTime() + durationHrs * 3_600_000);
    return { summary: todayMatch[5], startTime: due.toISOString(), endTime: end.toISOString() };
  }

  // "HH:MM [am/pm] [for N hours] message" or "at HH:MM message"
  const timeMatch = rest.match(/^(?:at\s+)?(\d{1,2}):?(\d{2})?\s*(am|pm)?\s+(?:for\s+(\d+)\s*(?:hours?|hrs?)\s+)?(.+)/i);
  if (timeMatch && timeMatch[5]) {
    const due = parseTimeToDate(now, timeMatch[1], timeMatch[2] || '00', timeMatch[3]);
    if (due <= now) due.setDate(due.getDate() + 1);
    const durationHrs = timeMatch[4] ? parseInt(timeMatch[4]) : 1;
    const end = new Date(due.getTime() + durationHrs * 3_600_000);
    return { summary: timeMatch[5], startTime: due.toISOString(), endTime: end.toISOString() };
  }

  return null;
}

/**
 * Parse reminder commands. Supports:
 *   /remind [time] [message]
 *   /remind 2:00 PM Call John
 *   /remind in 30 minutes check the oven
 *   /remind tomorrow at 9am standup
 *   /remind every day at 9am standup  (recurring)
 *   /reminders  (list)
 */
function parseReminderCommand(text: string): { dueAt: number; message: string; recurring?: string } | 'list' | null {
  const t = text.trim();
  if (/^\/reminders?$/i.test(t)) return 'list';

  const match = t.match(/^\/remind\s+(.+)/i);
  if (!match) return null;

  const rest = match[1];
  const now = new Date();

  // "every day/weekly/monthly at HH:MM message"
  const recurMatch = rest.match(/^every\s+(day|daily|week|weekly|month|monthly)\s+(?:at\s+)?(\d{1,2}):?(\d{2})?\s*(am|pm)?\s+(.+)/i);
  if (recurMatch) {
    const recur = recurMatch[1].toLowerCase();
    const recurring = recur === 'day' || recur === 'daily' ? 'daily' : recur === 'week' || recur === 'weekly' ? 'weekly' : 'monthly';
    const due = parseTimeToDate(now, recurMatch[2], recurMatch[3] || '00', recurMatch[4]);
    if (due <= now) due.setDate(due.getDate() + 1);
    return { dueAt: due.getTime(), message: recurMatch[5], recurring };
  }

  // "in X seconds/minutes/hours"
  const inMatch = rest.match(/^in\s+(\d+)\s*(sec(?:onds?)?|min(?:utes?)?|hrs?|hours?)\s+(.+)/i);
  if (inMatch) {
    const amount = parseInt(inMatch[1]);
    const unit = inMatch[2].toLowerCase();
    const ms = unit.startsWith('sec') ? amount * 1_000 : unit.startsWith('min') ? amount * 60_000 : amount * 3_600_000;
    return { dueAt: Date.now() + ms, message: inMatch[3] };
  }

  // "tomorrow at HH:MM message"
  const tomorrowMatch = rest.match(/^tomorrow\s+(?:at\s+)?(\d{1,2}):?(\d{2})?\s*(am|pm)?\s+(.+)/i);
  if (tomorrowMatch) {
    const due = parseTimeToDate(now, tomorrowMatch[1], tomorrowMatch[2] || '00', tomorrowMatch[3]);
    due.setDate(due.getDate() + 1);
    return { dueAt: due.getTime(), message: tomorrowMatch[4] };
  }

  // "HH:MM [am/pm] message" or "at HH:MM message"
  const timeMatch = rest.match(/^(?:at\s+)?(\d{1,2}):?(\d{2})?\s*(am|pm)?\s+(.+)/i);
  if (timeMatch && timeMatch[4]) {
    const due = parseTimeToDate(now, timeMatch[1], timeMatch[2] || '00', timeMatch[3]);
    if (due <= now) due.setDate(due.getDate() + 1); // next day if time already passed
    return { dueAt: due.getTime(), message: timeMatch[4] };
  }

  // Fallback: treat everything as message, due in 1 hour
  return { dueAt: Date.now() + 3_600_000, message: rest };
}

function parseTimeToDate(base: Date, hours: string, minutes: string, ampm?: string | null): Date {
  let h = parseInt(hours);
  const m = parseInt(minutes);
  if (ampm) {
    if (ampm.toLowerCase() === 'pm' && h < 12) h += 12;
    if (ampm.toLowerCase() === 'am' && h === 12) h = 0;
  }
  const d = new Date(base);
  d.setHours(h, m, 0, 0);
  return d;
}

function generateSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

interface ChatProps {
  newChatSignal: number;
  loadSessionId: string | null;
  onSessionChange: (id: string) => void;
}

export default function Chat({ newChatSignal, loadSessionId, onSessionChange }: ChatProps) {
  const [messages, setMessages] = useState<MessageType[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [sessionId, setSessionId] = useState<string>(generateSessionId());
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [userTimezone, setUserTimezone] = useState<string>('');
  const [thinkingSteps, setThinkingSteps] = useState<string[]>([]);

  // Load user timezone
  useEffect(() => {
    window.keel.getSettings().then((s) => setUserTimezone(s.timezone || '')).catch(() => {});
  }, []);

  const formatTime = (ms: number) => {
    const opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' };
    if (userTimezone) opts.timeZone = userTimezone;
    return new Date(ms).toLocaleString('en-US', opts);
  };

  // Handle new chat signal from sidebar/header
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    startNewChat();
  }, [newChatSignal]);

  // Load a specific session when selected from sidebar
  useEffect(() => {
    if (loadSessionId && loadSessionId !== sessionId) {
      (async () => {
        const saved = await window.keel.loadChat(loadSessionId);
        if (saved) {
          setSessionId(loadSessionId);
          setMessages(saved);
          onSessionChange(loadSessionId);
        }
      })();
    }
  }, [loadSessionId]);

  // Load the last session on mount
  useEffect(() => {
    (async () => {
      try {
        const latestId = await window.keel.getLatestSession();
        if (latestId) {
          const saved = await window.keel.loadChat(latestId);
          if (saved && saved.length > 0) {
            setSessionId(latestId);
            setMessages(saved);
            onSessionChange(latestId);
          }
        }
      } catch {
        // First launch, no sessions yet
      }
    })();
  }, []);

  // Listen for scheduled notifications (daily brief / EOD)
  useEffect(() => {
    window.keel.onScheduledNotification((notification) => {
      if (notification.type === 'reminder') {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: notification.content, timestamp: Date.now() },
        ]);
        return;
      }
      const label = notification.type === 'daily-brief' ? 'Scheduled Daily Brief' : 'Scheduled EOD Summary';
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `**${label}**\n\n${notification.content}`, timestamp: Date.now() },
      ]);
    });
    return () => {
      window.keel.removeScheduledNotificationListener();
    };
  }, []);

  // Auto-save messages whenever they change
  useEffect(() => {
    if (messages.length > 0) {
      window.keel.saveChat(sessionId, messages).catch(() => {});
    }
  }, [messages, sessionId]);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingContent, scrollToBottom]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 120) + 'px';
    }
  }, [input]);

  const getLastAssistantMessage = (): string | null => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') return messages[i].content;
    }
    return null;
  };

  const startNewChat = () => {
    setMessages([]);
    setSessionId(generateSessionId());
  };

  const sendMessage = async (overrideText?: string) => {
    const trimmed = (overrideText || input).trim();
    if (!trimmed || isStreaming) return;

    const userMessage: MessageType = {
      role: 'user',
      content: trimmed,
      timestamp: Date.now(),
    };

    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput('');
    setIsStreaming(true);
    setStreamingContent('');

    // Google Doc export command
    if (isGoogleDocCommand(trimmed)) {
      const lastContent = getLastAssistantMessage();
      if (!lastContent) {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: 'Nothing to export yet — ask me something first.', timestamp: Date.now() },
        ]);
      } else {
        try {
          const url = await window.keel.googleExportDoc(lastContent, 'Keel Export');
          setMessages((prev) => [
            ...prev,
            { role: 'assistant', content: `Exported to Google Doc: [Open document](${url})`, timestamp: Date.now() },
          ]);
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Google Doc export failed';
          setMessages((prev) => [
            ...prev,
            { role: 'assistant', content: msg, timestamp: Date.now() },
          ]);
        }
      }
      setIsStreaming(false);
      return;
    }

    // PDF export command
    if (isPdfCommand(trimmed)) {
      const lastContent = getLastAssistantMessage();
      if (!lastContent) {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: 'Nothing to export yet — ask me something first.', timestamp: Date.now() },
        ]);
      } else {
        try {
          const result = await window.keel.exportPdf(lastContent);
          setMessages((prev) => [
            ...prev,
            { role: 'assistant', content: result, timestamp: Date.now() },
          ]);
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'PDF export failed';
          setMessages((prev) => [
            ...prev,
            { role: 'assistant', content: msg, timestamp: Date.now() },
          ]);
        }
      }
      setIsStreaming(false);
      return;
    }

    // /capture command
    if (trimmed === '/capture') {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: '**Usage:** `/capture [text or URL]`\n\nExamples:\n- `/capture https://interesting-article.com`\n- `/capture Meeting notes: decided to push launch to April 20`', timestamp: Date.now() },
      ]);
      setIsStreaming(false);
      return;
    }

    if (trimmed.startsWith('/capture ')) {
      try {
        const result = await window.keel.capture(trimmed.slice(9));
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: result, timestamp: Date.now() },
        ]);
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Capture failed';
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: msg, timestamp: Date.now() },
        ]);
      }
      setIsStreaming(false);
      return;
    }

    if (trimmed === '/reset') {
      try {
        await window.keel.resetProfile();
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: 'Profile reset to blank template. Your `keel.md` has been cleared — tell me about yourself and your projects to get started fresh.', timestamp: Date.now() },
        ]);
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Reset failed';
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: msg, timestamp: Date.now() },
        ]);
      }
      setIsStreaming(false);
      return;
    }

    if (trimmed === '/daily-brief') {
      try {
        const result = await window.keel.dailyBrief();
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: result, timestamp: Date.now() },
        ]);
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Daily brief failed';
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: msg, timestamp: Date.now() },
        ]);
      }
      setIsStreaming(false);
      return;
    }

    if (trimmed === '/eod') {
      try {
        const result = await window.keel.eod(updatedMessages);
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: result, timestamp: Date.now() },
        ]);
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'EOD failed';
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: msg, timestamp: Date.now() },
        ]);
      }
      setIsStreaming(false);
      return;
    }

    // Reminder commands
    const reminderParsed = parseReminderCommand(trimmed);
    if (reminderParsed === 'list') {
      try {
        const reminders = await window.keel.listReminders();
        if (reminders.length === 0) {
          setMessages((prev) => [...prev, { role: 'assistant', content: 'No upcoming reminders.', timestamp: Date.now() }]);
        } else {
          const lines = reminders.map((r) => {
            const when = new Date(r.dueAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
            const recur = r.recurring ? ` (${r.recurring})` : '';
            return `- **${when}**${recur} — ${r.message}`;
          });
          setMessages((prev) => [...prev, { role: 'assistant', content: `**Upcoming Reminders:**\n\n${lines.join('\n')}`, timestamp: Date.now() }]);
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to list reminders';
        setMessages((prev) => [...prev, { role: 'assistant', content: msg, timestamp: Date.now() }]);
      }
      setIsStreaming(false);
      return;
    }
    if (reminderParsed) {
      try {
        await window.keel.createReminder(reminderParsed.message, reminderParsed.dueAt, reminderParsed.recurring);
        const when = formatTime(reminderParsed.dueAt);
        const recur = reminderParsed.recurring ? ` Repeats ${reminderParsed.recurring}.` : '';
        setMessages((prev) => [...prev, { role: 'assistant', content: `Reminder set for **${when}**: ${reminderParsed.message}${recur}`, timestamp: Date.now() }]);
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to set reminder';
        setMessages((prev) => [...prev, { role: 'assistant', content: msg, timestamp: Date.now() }]);
      }
      setIsStreaming(false);
      return;
    }

    // Schedule command
    const scheduleParsed = parseScheduleCommand(trimmed);
    if (scheduleParsed) {
      try {
        const result = await window.keel.googleCreateEvent(scheduleParsed);
        const start = new Date(scheduleParsed.startTime);
        const when = formatTime(start.getTime());
        setMessages((prev) => [...prev, { role: 'assistant', content: `Meeting scheduled: **${scheduleParsed.summary}** on **${when}**`, timestamp: Date.now() }]);
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to create event';
        setMessages((prev) => [...prev, { role: 'assistant', content: `Could not schedule event: ${msg}`, timestamp: Date.now() }]);
      }
      setIsStreaming(false);
      return;
    }

    // Regular chat — use streaming
    let accumulated = '';
    setThinkingSteps([]);

    window.keel.removeStreamListeners();

    window.keel.onThinkingStep((step: string) => {
      setThinkingSteps((prev) => [...prev, step]);
    });

    window.keel.onStreamChunk((chunk: string) => {
      accumulated += chunk;
      setStreamingContent(accumulated);
    });

    window.keel.onStreamDone(() => {
      window.keel.removeStreamListeners();
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: accumulated, timestamp: Date.now() },
      ]);
      setStreamingContent('');
      setIsStreaming(false);
    });

    window.keel.onStreamError((error: string) => {
      window.keel.removeStreamListeners();
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: error, timestamp: Date.now() },
      ]);
      setStreamingContent('');
      setIsStreaming(false);
    });

    try {
      await window.keel.chatStream(updatedMessages);
    } catch (error) {
      window.keel.removeStreamListeners();
      const msg =
        error instanceof Error
          ? error.message
          : 'AI provider unavailable. Check Settings to configure your AI engine.';
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: msg, timestamp: Date.now() },
      ]);
      setStreamingContent('');
      setIsStreaming(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Message list */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
        {messages.length === 0 && !isStreaming && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <div style={{ textAlign: 'center', maxWidth: 360 }}>
              <div style={{ margin: '0 auto 20px', width: 56 }}>
                <KeelIcon size={56} />
              </div>
              <h2 style={{ fontSize: 18, fontWeight: 600, color: 'rgba(255,255,255,0.9)', marginBottom: 8 }}>Good to see you</h2>
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', marginBottom: 24, lineHeight: 1.6 }}>
                I'm Keel, your AI chief of staff. I know your projects, priorities, and people.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {WELCOME_SUGGESTIONS.map((s) => (
                  <button
                    key={s.label}
                    onClick={() => sendMessage(s.label)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '10px 12px', borderRadius: 12,
                      background: '#252525', border: '1px solid rgba(255,255,255,0.08)',
                      color: 'rgba(255,255,255,0.6)', fontSize: 12,
                      cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#2a2a2a';
                      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)';
                      e.currentTarget.style.color = 'rgba(255,255,255,0.8)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = '#252525';
                      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
                      e.currentTarget.style.color = 'rgba(255,255,255,0.6)';
                    }}
                  >
                    <span>{s.icon}</span>
                    <span>{s.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <Message key={i} message={msg} />
        ))}

        {/* Thinking steps — collapsible chain of thought */}
        {isStreaming && thinkingSteps.length > 0 && (
          <ThinkingSteps steps={thinkingSteps} />
        )}

        {isStreaming && streamingContent && (
          <Message
            message={{
              role: 'assistant',
              content: streamingContent,
              timestamp: Date.now(),
            }}
          />
        )}

        {isStreaming && !streamingContent && <ThinkingIndicator />}
      </div>

      {/* Input area */}
      <div style={{
        borderTop: '1px solid rgba(255,255,255,0.08)',
        padding: '12px 24px',
        background: '#1a1a1a',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, position: 'relative' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            {input.startsWith('/') && (
              <div style={{
                position: 'absolute', top: -24, left: 4,
                fontSize: 11, fontWeight: 600, color: '#CF7A5C',
                letterSpacing: '0.03em', opacity: 0.8,
              }}>
                / COMMAND
              </div>
            )}
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message Keel..."
              disabled={isStreaming}
              rows={1}
              style={{
                width: '100%', background: input.startsWith('/') ? 'rgba(207,122,92,0.06)' : '#252525',
                border: `1px solid ${input.startsWith('/') ? 'rgba(207,122,92,0.35)' : 'rgba(255,255,255,0.08)'}`,
                color: 'rgba(255,255,255,0.9)', fontSize: 14, borderRadius: 12,
                padding: '10px 16px', resize: 'none', outline: 'none',
                fontFamily: 'inherit', transition: 'all 0.15s',
                overflow: 'hidden',
                opacity: isStreaming ? 0.4 : 1,
                boxSizing: 'border-box',
              }}
              onFocus={(e) => {
                if (!input.startsWith('/')) {
                  e.currentTarget.style.borderColor = 'rgba(207,122,92,0.4)';
                  e.currentTarget.style.background = '#282828';
                }
              }}
              onBlur={(e) => {
                if (!input.startsWith('/')) {
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
                  e.currentTarget.style.background = '#252525';
                }
              }}
            />
          </div>
          <button
            onClick={() => sendMessage()}
            disabled={isStreaming || !input.trim()}
            style={{
              background: isStreaming || !input.trim() ? '#252525' : '#CF7A5C',
              border: isStreaming || !input.trim() ? '1px solid rgba(255,255,255,0.08)' : '1px solid transparent',
              color: isStreaming || !input.trim() ? 'rgba(255,255,255,0.2)' : 'white',
              fontSize: 14, fontWeight: 500, borderRadius: 12,
              padding: '10px 16px', cursor: isStreaming || !input.trim() ? 'default' : 'pointer',
              transition: 'all 0.15s', flexShrink: 0,
            }}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
