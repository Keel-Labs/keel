import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { Message as MessageType, MessageImage, Settings as SettingsType, OllamaModelInfo } from '../../shared/types';
import Message from './Message';

const CLAUDE_MODELS = [
  { value: 'claude-sonnet-4-20250514', label: 'Sonnet 4' },
  { value: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5' },
];

const OPENAI_MODELS = [
  { value: 'gpt-4o', label: 'GPT-4o' },
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
  { value: 'gpt-4.1', label: 'GPT-4.1' },
  { value: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
];

function formatOpenAIModelLabel(modelId: string): string {
  const known = OPENAI_MODELS.find((model) => model.value === modelId);
  if (known) return known.label;

  return modelId
    .split('-')
    .map((part) => {
      if (/^\d/.test(part)) return part;
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(' ');
}

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
  // Nautical
  'Land ahoy...',
  'Bobbing up...',
  'Hoisting the sails...',
  'Charting the course...',
  'Riding the tide...',
  'Swabbing the deck...',
  'Dropping anchor...',
  'Reading the stars...',
  'Catching the wind...',
  'Checking the compass...',
  'Weathering the storm...',
  'Knot quite ready...',
  'Reeling it in...',
  'Tying up loose ends...',
  'All hands on deck...',
  'Navigating the deep...',
  'Keeping her steady...',
  'Almost in port...',
  // British
  'Putting the kettle on...',
  'Buttering the scone...',
  'Spreading the jam...',
  'Waiting for the biscuits to cool...',
  'Pouring a cuppa...',
  'Queuing very patiently...',
  'Minding the gap...',
  'Keeping calm and carrying on...',
  'Checking if it might rain...',
  'Feeding the pigeons in the square...',
  'Tutting quietly...',
  // Italian
  'Waiting for the pasta to al dente...',
  'Arguing about the sauce...',
  'Letting the espresso settle...',
  'Taking a very necessary nap...',
  // French
  'Shrugging philosophically...',
  'Selecting the correct beret...',
  'Debating the wine pairing...',
  'Contemplating...',
  // Japanese
  'Perfecting the fold...',
  'Waiting for the ramen to steep...',
  'Bowing respectfully...',
  'Arranging things very precisely...',
  'Finding the most efficient route...',
  // Australian
  'No worries, nearly there...',
  'Chucking another log on...',
  'Slapping on the sunscreen...',
  // Indian
  'Brewing the chai...',
  'Finding a jugaad solution...',
  'Adjusting accordingly...',
  'Consulting the family group chat...',
  'Adding a little extra spice...',
  // Universal / Cosmic
  'Consulting the universe...',
  'Asking a very wise owl...',
  'Letting the dust settle...',
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

function OrigamiBoatLoader() {
  // Simple flat origami boat bobbing on a wave line
  // Viewbox 48x32 — wide enough for boat + water
  return (
    <svg viewBox="0 0 48 32" xmlns="http://www.w3.org/2000/svg" width="48" height="32" style={{ flexShrink: 0 }}>
      <defs>
        <style>{`
          @keyframes bob {
            0%,100% { transform: translateY(0px) rotate(-1deg); }
            50%      { transform: translateY(-4px) rotate(1deg); }
          }
          @keyframes wave-shift {
            0%,100% { d: path("M0 22 Q8 18 16 22 Q24 26 32 22 Q40 18 48 22 L48 32 L0 32 Z"); }
            50%      { d: path("M0 22 Q8 26 16 22 Q24 18 32 22 Q40 26 48 22 L48 32 L0 32 Z"); }
          }
        `}</style>
      </defs>

      {/* Water */}
      <path
        fill="#CF7A5C"
        opacity="0.25"
        style={{ animation: 'wave-shift 2.4s ease-in-out infinite' }}
      >
        <animate
          attributeName="d"
          dur="2.4s"
          repeatCount="indefinite"
          calcMode="spline"
          keySplines="0.45 0 0.55 1; 0.45 0 0.55 1"
          values="
            M0 22 Q8 18 16 22 Q24 26 32 22 Q40 18 48 22 L48 32 L0 32 Z;
            M0 22 Q8 26 16 22 Q24 18 32 22 Q40 26 48 22 L48 32 L0 32 Z;
            M0 22 Q8 18 16 22 Q24 26 32 22 Q40 18 48 22 L48 32 L0 32 Z
          "
        />
      </path>

      {/* Boat group — bobs up and down */}
      <g style={{ transformOrigin: '24px 21px', animation: 'bob 2.4s ease-in-out infinite' }}>
        {/* Hull: flat-bottomed trapezoid */}
        <path
          d="M13 21 L35 21 L32 26 L16 26 Z"
          fill="#CF7A5C"
          opacity="0.85"
        />
        {/* Left sail: triangle leaning right */}
        <path
          d="M22 21 L22 8 L30 21 Z"
          fill="#CF7A5C"
          opacity="0.55"
        />
        {/* Right sail panel (darker fold line effect) */}
        <path
          d="M22 21 L26 10 L30 21 Z"
          fill="#CF7A5C"
          opacity="0.35"
        />
        {/* Mast line */}
        <line x1="22" y1="21" x2="22" y2="8" stroke="#CF7A5C" strokeWidth="0.8" opacity="0.6" />
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0' }}>
        <NauticalLoader />
        <span className="thinking-text" style={{
          fontSize: 13, color: 'var(--text-subtle)',
          fontStyle: 'italic',
        }}>
          {THINKING_MESSAGES[messageIndex]}
        </span>
      </div>
    </div>
  );
}

function ThinkingSteps({ steps, thinkingContent }: { steps: string[]; thinkingContent?: string }) {
  const [expanded, setExpanded] = useState(false);
  const latest = steps[steps.length - 1];
  const hasRealThinking = !!thinkingContent;
  const label = hasRealThinking ? 'Chain of thought' : 'Thinking steps';
  const summary = hasRealThinking
    ? (thinkingContent.length > 60 ? thinkingContent.slice(0, 60) + '…' : thinkingContent)
    : latest;

  return (
    <div style={{
      display: 'flex', justifyContent: 'flex-start', marginBottom: 12, paddingRight: 48,
    }}>
      <div style={{
        background: 'var(--accent-bg-subtle)',
        border: '1px solid var(--accent-border-subtle)',
        borderRadius: 'var(--radius-xl)', padding: '8px 14px',
        maxWidth: '80%', fontSize: 12,
      }}>
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            background: 'none', border: 'none', padding: 0, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6, width: '100%',
            color: 'var(--text-muted)',
          }}
        >
          <span style={{
            fontSize: 8, transition: 'transform 0.15s',
            transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
          }}>▶</span>
          <span style={{ fontStyle: 'italic' }}>
            {expanded ? label : summary}
          </span>
        </button>
        {expanded && (
          <div style={{ marginTop: 6, paddingLeft: 14 }}>
            {steps.map((step, i) => (
              <div key={i} style={{
                color: 'var(--text-subtle)', padding: '2px 0',
                borderLeft: '2px solid var(--accent-border-subtle)',
                paddingLeft: 10, marginBottom: 2,
              }}>
                {step}
              </div>
            ))}
            {hasRealThinking && (
              <div style={{
                color: 'var(--text-muted)', padding: '6px 0 2px',
                borderLeft: '2px solid var(--accent-border)',
                paddingLeft: 10, marginTop: 4,
                whiteSpace: 'pre-wrap', lineHeight: 1.5,
                maxHeight: 300, overflowY: 'auto',
              }}>
                {thinkingContent}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ActivityPanel({
  steps,
  answerStarted,
  expanded,
  onToggle,
}: {
  steps: string[];
  answerStarted: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const latestStep = steps[steps.length - 1] || (answerStarted ? 'Generating answer' : 'Working');

  return (
    <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 12, paddingRight: 48 }}>
      <div style={{
        background: 'var(--surface-elevated)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-xl)',
        padding: answerStarted ? '10px 14px' : '12px 14px',
        maxWidth: '72%',
        minWidth: 260,
      }}>
        {answerStarted ? (
          <>
            <button
              onClick={onToggle}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                width: '100%',
                color: 'inherit',
                textAlign: 'left',
              }}
            >
              <span style={{
                fontSize: 9,
                color: 'var(--text-muted)',
                transition: 'transform 0.15s ease',
                transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
              }}>▶</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>Activity</span>
              <span style={{
                fontSize: 12,
                color: 'var(--text-subtle)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                {latestStep}
              </span>
            </button>

            {expanded && (
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {steps.map((step, index) => (
                  <div key={`${step}-${index}`} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <span style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: index === steps.length - 1 ? 'var(--accent)' : 'var(--border-strong)',
                      marginTop: 6,
                      flexShrink: 0,
                    }} />
                    <span style={{ fontSize: 12, lineHeight: 1.45, color: 'var(--text-subtle)' }}>{step}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: 'var(--accent)',
                boxShadow: '0 0 0 4px var(--accent-bg-subtle)',
                flexShrink: 0,
              }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>Working</span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-subtle)', lineHeight: 1.45 }}>{latestStep}</div>
          </div>
        )}
      </div>
    </div>
  );
}

function ClipboardIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
    </svg>
  );
}
function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}
function PaperclipIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}
function BellIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

const WELCOME_SUGGESTIONS: Array<{ label: string; icon: React.ReactNode }> = [
  { label: 'What am I working on?', icon: <ClipboardIcon /> },
  { label: '/daily-brief', icon: <SunIcon /> },
  { label: '/capture', icon: <PaperclipIcon /> },
  { label: '/reminders', icon: <BellIcon /> },
];

function isPdfCommand(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (/^(make|export|save|create|generate|give me|get me|download)\s.*(pdf)$/i.test(t)) return true;
  if (/^(pdf|save pdf|export pdf|make pdf|to pdf|as pdf)$/i.test(t)) return true;
  if (/^turn\s.*(pdf)$/i.test(t)) return true;
  if (/pdf/i.test(t) && /(make|create|save|export|want|need|give|get|generate|download)/i.test(t)) return true;
  return false;
}

function isGoogleDocCommand(text: string): 'export-only' | 'write-and-export' | false {
  const t = text.trim().toLowerCase();
  if (!/google\s*doc/i.test(t)) return false;

  // Strip common filler prefixes for easier matching
  const stripped = t
    .replace(/^(could you|can you|would you|will you|please|ok|okay|yes|yeah|sure)\s*,?\s*/i, '')
    .trim();

  // "export-only" — commands that reference existing content to export
  // Direct export verbs at start: "put this in a google doc", "export to google doc"
  if (/^(export|save|send|put|place|add)\s.*google\s*doc/i.test(stripped)) return 'export-only';
  if (/^(create|make)\s+(a\s+)?google\s*doc/i.test(stripped)) return 'export-only';
  // References to existing content (this/that/it) anywhere with google doc
  if (/(put|save|send|export|place|add|move)\s+(this|that|it|the above)\s.*(google\s*doc)/i.test(stripped)) return 'export-only';
  if (/google\s*docs?\s+(with|from|of|for)\s+(this|that|the above|this info)/i.test(stripped)) return 'export-only';
  // "(put/save/turn) this (in/into) a google doc" — reference to existing content
  if (/(this|that|it|the above).*(in|into|to|as)\s+(a\s+)?google\s*doc/i.test(stripped)) return 'export-only';
  // Short commands (just the google doc request, not much else)
  if (stripped.replace(/google\s*docs?/i, '').replace(/[^a-z]/g, '').length < 20) return 'export-only';

  // "write-and-export" — user wants something NEW written AND exported
  // e.g., "write a recommendation on X and put it in a google doc"
  if (/(make|create|save|export|want|need|give|get|generate|send|turn|put|write|add|place)/i.test(t)) return 'write-and-export';

  return false;
}

/**
 * Parse /schedule command for creating calendar events.
 * /schedule tomorrow at 9am Meeting with Alex
 * /schedule 2026-04-03 2:00 PM Team standup
 * /schedule today at 3pm for 2 hours Design review
 */
function parseScheduleCommand(text: string, timezone?: string): { summary: string; startTime: string; endTime: string } | null {
  const t = text.trim();
  const match = t.match(/^\/schedule\s+(.+)/i);
  if (!match) return null;

  const rest = match[1];
  const now = new Date();

  // "tomorrow at HH:MM [am/pm] [for N hours] message"
  const tomorrowMatch = rest.match(/^tomorrow\s+(?:at\s+)?(\d{1,2}):?(\d{2})?\s*(am|pm)?\s+(?:for\s+(\d+)\s*(?:hours?|hrs?)\s+)?(.+)/i);
  if (tomorrowMatch) {
    const due = parseTimeToDate(now, tomorrowMatch[1], tomorrowMatch[2] || '00', tomorrowMatch[3], timezone);
    due.setDate(due.getDate() + 1);
    const durationHrs = tomorrowMatch[4] ? parseInt(tomorrowMatch[4]) : 1;
    const end = new Date(due.getTime() + durationHrs * 3_600_000);
    return { summary: tomorrowMatch[5], startTime: due.toISOString(), endTime: end.toISOString() };
  }

  // "today at HH:MM [am/pm] [for N hours] message"
  const todayMatch = rest.match(/^today\s+(?:at\s+)?(\d{1,2}):?(\d{2})?\s*(am|pm)?\s+(?:for\s+(\d+)\s*(?:hours?|hrs?)\s+)?(.+)/i);
  if (todayMatch) {
    const due = parseTimeToDate(now, todayMatch[1], todayMatch[2] || '00', todayMatch[3], timezone);
    const durationHrs = todayMatch[4] ? parseInt(todayMatch[4]) : 1;
    const end = new Date(due.getTime() + durationHrs * 3_600_000);
    return { summary: todayMatch[5], startTime: due.toISOString(), endTime: end.toISOString() };
  }

  // "HH:MM [am/pm] [for N hours] message" or "at HH:MM message"
  const timeMatch = rest.match(/^(?:at\s+)?(\d{1,2}):?(\d{2})?\s*(am|pm)?\s+(?:for\s+(\d+)\s*(?:hours?|hrs?)\s+)?(.+)/i);
  if (timeMatch && timeMatch[5]) {
    const due = parseTimeToDate(now, timeMatch[1], timeMatch[2] || '00', timeMatch[3], timezone);
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
function parseReminderCommand(text: string, timezone?: string): { dueAt: number; message: string; recurring?: string } | 'list' | null {
  const t = text.trim();
  if (/^\/reminders?$/i.test(t)) return 'list';

  const match = t.match(/^\/remind\s+(.+)/i);
  if (!match) return null;

  const rest = match[1].replace(/^me\s+/i, '');
  const now = new Date();

  // "every day/weekly/monthly at HH:MM message"
  const recurMatch = rest.match(/^every\s+(day|daily|week|weekly|month|monthly)\s+(?:at\s+)?(\d{1,2}):?(\d{2})?\s*(am|pm)?\s+(.+)/i);
  if (recurMatch) {
    const recur = recurMatch[1].toLowerCase();
    const recurring = recur === 'day' || recur === 'daily' ? 'daily' : recur === 'week' || recur === 'weekly' ? 'weekly' : 'monthly';
    const due = parseTimeToDate(now, recurMatch[2], recurMatch[3] || '00', recurMatch[4], timezone);
    if (due <= now) due.setDate(due.getDate() + 1);
    return { dueAt: due.getTime(), message: recurMatch[5], recurring };
  }

  // "in X seconds/minutes/hours [message]"
  const inMatch = rest.match(/^in\s+(\d+)\s*(sec(?:onds?)?|min(?:utes?)?|hrs?|hours?)\s+(.+)/i);
  if (inMatch) {
    const amount = parseInt(inMatch[1]);
    const unit = inMatch[2].toLowerCase();
    const ms = unit.startsWith('sec') ? amount * 1_000 : unit.startsWith('min') ? amount * 60_000 : amount * 3_600_000;
    return { dueAt: Date.now() + ms, message: inMatch[3] };
  }

  // "[message] in X seconds/minutes/hours" (time at end)
  const inEndMatch = rest.match(/^(.+?)\s+in\s+(\d+)\s*(sec(?:onds?)?|min(?:utes?)?|hrs?|hours?)s?\s*$/i);
  if (inEndMatch) {
    const amount = parseInt(inEndMatch[2]);
    const unit = inEndMatch[3].toLowerCase();
    const ms = unit.startsWith('sec') ? amount * 1_000 : unit.startsWith('min') ? amount * 60_000 : amount * 3_600_000;
    const message = inEndMatch[1].replace(/^to\s+/i, '');
    return { dueAt: Date.now() + ms, message };
  }

  // "tomorrow at HH:MM message"
  const tomorrowMatch = rest.match(/^tomorrow\s+(?:at\s+)?(\d{1,2}):?(\d{2})?\s*(am|pm)?\s+(.+)/i);
  if (tomorrowMatch) {
    const due = parseTimeToDate(now, tomorrowMatch[1], tomorrowMatch[2] || '00', tomorrowMatch[3], timezone);
    due.setDate(due.getDate() + 1);
    return { dueAt: due.getTime(), message: tomorrowMatch[4] };
  }

  // "HH:MM [am/pm] message" or "at HH:MM message"
  const timeMatch = rest.match(/^(?:at\s+)?(\d{1,2}):?(\d{2})?\s*(am|pm)?\s+(.+)/i);
  if (timeMatch && timeMatch[4]) {
    const due = parseTimeToDate(now, timeMatch[1], timeMatch[2] || '00', timeMatch[3], timezone);
    if (due <= now) due.setDate(due.getDate() + 1); // next day if time already passed
    return { dueAt: due.getTime(), message: timeMatch[4] };
  }

  // Fallback: treat everything as message, due in 1 hour
  return { dueAt: Date.now() + 3_600_000, message: rest };
}

function parseTimeToDate(base: Date, hours: string, minutes: string, ampm?: string | null, timezone?: string): Date {
  let h = parseInt(hours);
  const m = parseInt(minutes);
  if (ampm) {
    if (ampm.toLowerCase() === 'pm' && h < 12) h += 12;
    if (ampm.toLowerCase() === 'am' && h === 12) h = 0;
  }
  // Build the target time in the user's timezone, then convert to UTC
  const tz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const dateStr = base.toLocaleDateString('en-CA', { timeZone: tz }); // YYYY-MM-DD
  const isoStr = `${dateStr}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
  // Start with UTC guess, then adjust by the offset the timezone introduces
  const guess = new Date(isoStr + 'Z');
  const displayedHour = parseInt(guess.toLocaleString('en-US', { hour: '2-digit', hour12: false, timeZone: tz }));
  const displayedMin = parseInt(guess.toLocaleString('en-US', { minute: '2-digit', timeZone: tz }));
  const offsetMs = ((displayedHour - h) * 60 + (displayedMin - m)) * 60000;
  return new Date(guess.getTime() - offsetMs);
}

function getGreetingName(name: string): string {
  const first = name.trim().split(/\s+/)[0];
  return first || 'there';
}

function getTimeOfDayGreeting(name: string, timezone?: string): string {
  const tz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const hourPart = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    hour12: false,
    timeZone: tz,
  }).formatToParts(new Date()).find((part) => part.type === 'hour');
  const hour = Number(hourPart?.value ?? 12);

  let greeting = 'Hello';
  if (hour >= 5 && hour < 12) {
    greeting = 'Good morning';
  } else if (hour >= 12 && hour < 17) {
    greeting = 'Good afternoon';
  } else if (hour >= 17 || hour < 5) {
    greeting = 'Good evening';
  }

  return `${greeting}, ${getGreetingName(name)}.`;
}

function generateSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function generateRequestId(): string {
  return `request-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

type SessionStreamState = {
  requestId: string;
  baseMessages: MessageType[];
  accumulated: string;
  steps: string[];
};

interface ChatProps {
  newChatSignal: number;
  loadSessionId: string | null;
  onSessionChange: (id: string) => void;
  onSessionStreamStateChange?: (sessionId: string, isStreaming: boolean) => void;
}

export default function Chat({
  newChatSignal,
  loadSessionId,
  onSessionChange,
  onSessionStreamStateChange,
}: ChatProps) {
  const [messages, setMessages] = useState<MessageType[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [sessionId, setSessionId] = useState<string>(generateSessionId());
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [userTimezone, setUserTimezone] = useState<string>('');
  const [userName, setUserName] = useState<string>('');
  const [activitySteps, setActivitySteps] = useState<string[]>([]);
  const [activityExpanded, setActivityExpanded] = useState(true);
  const [activityManuallyToggled, setActivityManuallyToggled] = useState(false);
  const [attachedImages, setAttachedImages] = useState<MessageImage[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [currentProvider, setCurrentProvider] = useState<string>('claude');
  const [currentModel, setCurrentModel] = useState<string>('');
  const [openaiModels, setOpenaiModels] = useState<string[]>([]);
  const [openaiModelsLoading, setOpenaiModelsLoading] = useState(false);
  const [ollamaModels, setOllamaModels] = useState<OllamaModelInfo[]>([]);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [composerExpanded, setComposerExpanded] = useState(false);
  const justLoadedRef = useRef(false);
  const currentSessionIdRef = useRef(sessionId);
  const activeRequestIdRef = useRef<string | null>(null);
  const sessionMessagesCacheRef = useRef(new Map<string, MessageType[]>());
  const sessionStreamsRef = useRef(new Map<string, SessionStreamState>());
  const requestSessionMapRef = useRef(new Map<string, string>());
  const streamCleanupRef = useRef<Array<() => void>>([]);
  const pendingGoogleExportRef = useRef(false);
  const [availableProviders, setAvailableProviders] = useState<Set<string>>(new Set());
  const [openrouterModelName, setOpenrouterModelName] = useState<string>('');
  const openaiModelOptionIds = Array.from(new Set([
    ...openaiModels,
    currentProvider === 'openai' ? currentModel : '',
  ].filter(Boolean)));
  const openaiModelOptions = openaiModelOptionIds
    .map((modelId) => ({ value: modelId, label: formatOpenAIModelLabel(modelId) }));

  const syncProviderSettings = useCallback(() => {
    return window.keel.getSettings().then((s) => {
      setUserTimezone(s.timezone || '');
      setUserName(s.userName || '');
      setCurrentProvider(s.provider);
      switch (s.provider) {
        case 'claude': setCurrentModel(s.claudeModel || 'claude-sonnet-4-20250514'); break;
        case 'openai': setCurrentModel(s.openaiModel || 'gpt-4o'); break;
        case 'openrouter': setCurrentModel(s.openrouterModel || ''); break;
        case 'ollama': setCurrentModel(s.ollamaModel || 'llama3.2'); break;
      }
      // Detect all available providers
      const available = new Set<string>();
      if (s.anthropicApiKey) available.add('claude');
      if (s.openaiApiKey) {
        available.add('openai');
        setOpenaiModelsLoading(true);
        window.keel.openaiListModels().then((result) => {
          setOpenaiModels(result.models);
          setOpenaiModelsLoading(false);
        }).catch(() => {
          setOpenaiModels([]);
          setOpenaiModelsLoading(false);
        });
      } else {
        setOpenaiModels([]);
        setOpenaiModelsLoading(false);
      }
      if (s.openrouterApiKey) {
        available.add('openrouter');
        setOpenrouterModelName(s.openrouterModel || '');
      } else {
        setOpenrouterModelName('');
      }
      // Always try Ollama
      window.keel.ollamaListModels().then((r) => {
        if (!r.error && r.models.length > 0) {
          setOllamaModels(r.models);
          available.add('ollama');
          setAvailableProviders(new Set(available));
        } else {
          setOllamaModels([]);
          setAvailableProviders(new Set(available));
        }
      }).catch(() => {
        setOllamaModels([]);
        setAvailableProviders(new Set(available));
      });
      setAvailableProviders(new Set(available));
    }).catch(() => {});
  }, []);

  // Load settings (timezone, model, provider) and detect all available providers
  useEffect(() => {
    syncProviderSettings();

    const handleFocus = () => {
      syncProviderSettings();
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [syncProviderSettings]);

  const clearStreamSubscriptions = useCallback(() => {
    for (const unsubscribe of streamCleanupRef.current) {
      unsubscribe();
    }
    streamCleanupRef.current = [];
  }, []);

  const resetStreamingUi = useCallback(() => {
    activeRequestIdRef.current = null;
    setIsStreaming(false);
    setStreamingContent('');
    setActivitySteps([]);
    setActivityExpanded(true);
    setActivityManuallyToggled(false);
  }, []);

  const syncVisibleStreamState = useCallback((targetSessionId: string) => {
    const stream = sessionStreamsRef.current.get(targetSessionId);
    if (!stream) {
      resetStreamingUi();
      return;
    }

    activeRequestIdRef.current = stream.requestId;
    setIsStreaming(true);
    setStreamingContent(stream.accumulated);
    setActivitySteps(stream.steps);
    setActivityManuallyToggled(false);
    setActivityExpanded(stream.accumulated.length === 0);
  }, [resetStreamingUi]);

  const formatTime = (ms: number) => {
    const opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' };
    if (userTimezone) opts.timeZone = userTimezone;
    return new Date(ms).toLocaleString('en-US', opts);
  };

  // Handle new chat signal from sidebar/header
  const isFirstRender = useRef(true);
  useEffect(() => {
    currentSessionIdRef.current = sessionId;
  }, [sessionId]);

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
        const saved = sessionMessagesCacheRef.current.get(loadSessionId)
          ?? sessionStreamsRef.current.get(loadSessionId)?.baseMessages
          ?? await window.keel.loadChat(loadSessionId);
        if (saved) {
          justLoadedRef.current = true;
          setSessionId(loadSessionId);
          setMessages(saved);
          onSessionChange(loadSessionId);
          syncVisibleStreamState(loadSessionId);
        }
      })();
    }
  }, [loadSessionId, onSessionChange, sessionId, syncVisibleStreamState]);

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

  // Listen for auto-capture confirmations
  useEffect(() => {
    const cleanup = window.keel.onAutoCaptureDone((event) => {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `*${event.summary}*`, timestamp: Date.now() },
      ]);
    });
    return cleanup;
  }, []);

  // Listen for memory extraction confirmations
  useEffect(() => {
    const cleanup = window.keel.onMemoryUpdated((event) => {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `*Noted: ${event.summary}*`, timestamp: Date.now() },
      ]);
    });
    return cleanup;
  }, []);

  // Auto-save messages whenever they change (skip if just loaded from DB)
  useEffect(() => {
    if (messages.length > 0) {
      sessionMessagesCacheRef.current.set(sessionId, messages);
      if (justLoadedRef.current) {
        justLoadedRef.current = false;
        return;
      }
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
      const nextHeight = Math.min(textareaRef.current.scrollHeight, 160);
      textareaRef.current.style.height = `${nextHeight}px`;
      setComposerExpanded(nextHeight > 66 || attachedImages.length > 0);
    }
  }, [input, attachedImages.length]);

  useEffect(() => {
    if (isStreaming && streamingContent && !activityManuallyToggled) {
      setActivityExpanded(false);
    }
  }, [activityManuallyToggled, isStreaming, streamingContent]);

  useEffect(() => {
    return () => {
      clearStreamSubscriptions();
    };
  }, [clearStreamSubscriptions]);

  useEffect(() => {
    streamCleanupRef.current = [
      window.keel.onThinkingStep(({ requestId, step }) => {
        const targetSessionId = requestSessionMapRef.current.get(requestId);
        if (!targetSessionId) return;
        const stream = sessionStreamsRef.current.get(targetSessionId);
        if (!stream || stream.requestId !== requestId) return;

        if (stream.steps[stream.steps.length - 1] !== step) {
          stream.steps = [...stream.steps, step];
        }
        sessionStreamsRef.current.set(targetSessionId, stream);

        if (targetSessionId === currentSessionIdRef.current && requestId === activeRequestIdRef.current) {
          setActivitySteps([...stream.steps]);
        }
      }),
      window.keel.onStreamChunk(({ requestId, chunk }) => {
        const targetSessionId = requestSessionMapRef.current.get(requestId);
        if (!targetSessionId) return;
        const stream = sessionStreamsRef.current.get(targetSessionId);
        if (!stream || stream.requestId !== requestId) return;

        stream.accumulated += chunk;
        sessionStreamsRef.current.set(targetSessionId, stream);

        if (targetSessionId === currentSessionIdRef.current && requestId === activeRequestIdRef.current) {
          setStreamingContent(stream.accumulated);
        }
      }),
      window.keel.onStreamDone(({ requestId }) => {
        const targetSessionId = requestSessionMapRef.current.get(requestId);
        if (!targetSessionId) return;
        const stream = sessionStreamsRef.current.get(targetSessionId);
        if (!stream || stream.requestId !== requestId) return;

        sessionStreamsRef.current.delete(targetSessionId);
        requestSessionMapRef.current.delete(requestId);
        onSessionStreamStateChange?.(targetSessionId, false);

        // Auto-export to Google Doc if flagged — skip showing full content
        if (pendingGoogleExportRef.current && stream.accumulated) {
          pendingGoogleExportRef.current = false;
          const fullContent = stream.accumulated;

          // Extract title: prefer markdown headings, then derive from user request
          const headingMatch = fullContent.match(/^#+\s+(.{1,60})/m);
          let title = headingMatch ? headingMatch[1].replace(/[*#]/g, '').trim() : '';
          if (!title) {
            // Derive from user's request
            const userMsg = stream.baseMessages.filter((m) => m.role === 'user').pop();
            if (userMsg) {
              const req = userMsg.content
                .replace(/\b(and\s+)?(put|place|save|export|send|add)\s+(it\s+)?(in|into|to|as)\s+(a\s+)?google\s*docs?\b/gi, '')
                .replace(/\b(can you|could you|please|write|draft|create)\b/gi, '')
                .replace(/\s{2,}/g, ' ').trim();
              if (req.length > 5 && req.length <= 80) {
                title = req.charAt(0).toUpperCase() + req.slice(1);
              }
            }
          }
          if (!title) title = 'Keel Export';

          if (targetSessionId === currentSessionIdRef.current) {
            justLoadedRef.current = true;
            resetStreamingUi();
            setMessages([
              ...stream.baseMessages,
              { role: 'assistant' as const, content: 'Exporting your document...', timestamp: Date.now() },
            ]);
          }

          window.keel.googleExportDoc(fullContent, title).then((url: string) => {
            const doneMessages = [
              ...stream.baseMessages,
              { role: 'assistant' as const, content: `Done — I wrote "${title}" for you.\n\n<!-- gdoc:${url} -->`, timestamp: Date.now() },
            ];
            sessionMessagesCacheRef.current.set(targetSessionId, doneMessages);
            window.keel.saveChat(targetSessionId, doneMessages).catch(() => {});
            if (targetSessionId === currentSessionIdRef.current) {
              setMessages(doneMessages);
            }
          }).catch((err: unknown) => {
            const errMsg = err instanceof Error ? err.message : 'Google Doc export failed';
            const errorMessages = [
              ...stream.baseMessages,
              { role: 'assistant' as const, content: errMsg, timestamp: Date.now() },
            ];
            sessionMessagesCacheRef.current.set(targetSessionId, errorMessages);
            window.keel.saveChat(targetSessionId, errorMessages).catch(() => {});
            if (targetSessionId === currentSessionIdRef.current) {
              setMessages(errorMessages);
            }
          });
          return;
        }

        const finalMessages = [
          ...stream.baseMessages,
          { role: 'assistant' as const, content: stream.accumulated, timestamp: Date.now() },
        ];
        sessionMessagesCacheRef.current.set(targetSessionId, finalMessages);
        window.keel.saveChat(targetSessionId, finalMessages).catch(() => {});

        if (targetSessionId === currentSessionIdRef.current) {
          justLoadedRef.current = true;
          setMessages(finalMessages);
          resetStreamingUi();
        }
      }),
      window.keel.onStreamError(({ requestId, error }) => {
        const targetSessionId = requestSessionMapRef.current.get(requestId);
        if (!targetSessionId) return;
        const stream = sessionStreamsRef.current.get(targetSessionId);
        if (!stream || stream.requestId !== requestId) return;

        const finalMessages = [
          ...stream.baseMessages,
          { role: 'assistant' as const, content: error, timestamp: Date.now() },
        ];
        sessionMessagesCacheRef.current.set(targetSessionId, finalMessages);
        sessionStreamsRef.current.delete(targetSessionId);
        requestSessionMapRef.current.delete(requestId);
        onSessionStreamStateChange?.(targetSessionId, false);
        window.keel.saveChat(targetSessionId, finalMessages).catch(() => {});

        if (targetSessionId === currentSessionIdRef.current) {
          justLoadedRef.current = true;
          setMessages(finalMessages);
          resetStreamingUi();
        }
      }),
    ];

    return () => {
      clearStreamSubscriptions();
    };
  }, [clearStreamSubscriptions, onSessionStreamStateChange, resetStreamingUi]);

  const getLastAssistantMessage = (): string | null => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') {
        const content = messages[i].content;
        if (content.length < 20) continue;
        return content;
      }
    }
    return null;
  };

  const startNewChat = () => {
    resetStreamingUi();
    setMessages([]);
    const nextSessionId = generateSessionId();
    setSessionId(nextSessionId);
    currentSessionIdRef.current = nextSessionId;
    onSessionChange('');
  };

  const handleModelChange = async (provider: string, model: string) => {
    setCurrentProvider(provider);
    setCurrentModel(model);
    setShowModelDropdown(false);
    try {
      const settings = await window.keel.getSettings();
      settings.provider = provider as SettingsType['provider'];
      switch (provider) {
        case 'claude': settings.claudeModel = model; break;
        case 'openai': settings.openaiModel = model; break;
        case 'openrouter': settings.openrouterModel = model; break;
        case 'ollama': settings.ollamaModel = model; break;
      }
      await window.keel.saveSettings(settings);
    } catch { /* ignore */ }
  };

  const getModelLabel = (): string => {
    if (currentProvider === 'claude') {
      return CLAUDE_MODELS.find((m) => m.value === currentModel)?.label || currentModel;
    }
    if (currentProvider === 'openai') {
      return openaiModelOptions.find((m) => m.value === currentModel)?.label || currentModel;
    }
    if (currentProvider === 'ollama') {
      const found = ollamaModels.find((m) => m.name === currentModel);
      return found ? found.name.split(':')[0] : currentModel || 'llama3.2';
    }
    return currentModel || 'OpenRouter';
  };

  const getConversationTitle = (): string => {
    const firstMeaningfulMessage = messages.find((message) => message.content.trim().length > 0);
    if (!firstMeaningfulMessage) return 'New chat';
    const singleLine = firstMeaningfulMessage.content.replace(/\s+/g, ' ').trim();
    return singleLine.length > 56 ? `${singleLine.slice(0, 56)}...` : singleLine;
  };

  const conversationTitle = getConversationTitle();
  const isCommandMode = input.startsWith('/');
  const showHeader = messages.length > 0 || isStreaming;
  const emptyStateGreeting = getTimeOfDayGreeting(userName, userTimezone || undefined);

  const COMMANDS = [
    { command: '/daily-brief', description: 'Morning briefing' },
    { command: '/eod', description: 'End-of-day summary' },
    { command: '/capture', description: 'Save text or URL to brain' },
    { command: '/remind', description: 'Set a reminder' },
    { command: '/reminders', description: 'List upcoming reminders' },
    { command: '/schedule', description: 'Create a calendar event' },
    { command: '/reset', description: 'Reset your profile' },
  ];

  const commandSuggestions = isCommandMode && !input.includes(' ')
    ? COMMANDS.filter((c) => c.command.startsWith(input.toLowerCase()) && c.command !== input.toLowerCase())
    : [];

  const [commandIndex, setCommandIndex] = useState(0);
  useEffect(() => { setCommandIndex(0); }, [input]);

  const handleImageAttach = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach((file) => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        const mediaType = file.type as MessageImage['mediaType'];
        setAttachedImages((prev) => [...prev, { data: base64, mediaType }]);
      };
      reader.readAsDataURL(file);
    });
    // Reset input so same file can be re-selected
    e.target.value = '';
  };

  const removeImage = (index: number) => {
    setAttachedImages((prev) => prev.filter((_, i) => i !== index));
  };

  const sendMessage = async (overrideText?: string) => {
    const trimmed = (overrideText || input).trim();
    if ((!trimmed && attachedImages.length === 0) || isStreaming) return;

    onSessionChange(sessionId);

    const userMessage: MessageType = {
      role: 'user',
      content: trimmed,
      images: attachedImages.length > 0 ? [...attachedImages] : undefined,
      timestamp: Date.now(),
    };

    let updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput('');
    setAttachedImages([]);
    setIsStreaming(true);
    setStreamingContent('');

    // Google Doc export command
    const googleDocMode = isGoogleDocCommand(trimmed);
    if (googleDocMode === 'export-only') {
      const lastContent = getLastAssistantMessage();
      if (!lastContent) {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: 'Nothing to export yet — ask me something first.', timestamp: Date.now() },
        ]);
      } else {
        try {
          // Derive title from markdown heading, fallback to first line
          const headingMatch = lastContent.match(/^#+\s+(.{1,60})/m);
          const title = headingMatch ? headingMatch[1].replace(/[*#]/g, '').trim() : 'Keel Export';
          const url = await window.keel.googleExportDoc(lastContent, title);
          setMessages((prev) => [
            ...prev,
            { role: 'assistant', content: `Done — exported your response.\n\n<!-- gdoc:${url} -->`, timestamp: Date.now() },
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
    if (googleDocMode === 'write-and-export') {
      // Flag for auto-export after the LLM responds
      pendingGoogleExportRef.current = true;
      // Strip the "google doc" request from the message so the LLM only writes the content
      const lastMsg = updatedMessages[updatedMessages.length - 1];
      if (lastMsg) {
        const stripped = lastMsg.content
          .replace(/\b(and\s+)?(put|place|save|export|send|add)\s+(it\s+)?(in|into|to|as)\s+(a\s+)?google\s*docs?\b/gi, '')
          .replace(/\b(and\s+)?create\s+(a\s+)?google\s*docs?\s*(for|from|with)?\s*(it|this|that)?\b/gi, '')
          .replace(/\s{2,}/g, ' ')
          .trim();
        updatedMessages = updatedMessages.map((m, i) =>
          i === updatedMessages.length - 1 ? { ...m, content: stripped || m.content } : m
        );
      }
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
    const reminderParsed = parseReminderCommand(trimmed, userTimezone || undefined);
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
    const scheduleParsed = parseScheduleCommand(trimmed, userTimezone || undefined);
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
    const targetSessionId = sessionId;
    const requestId = generateRequestId();
    activeRequestIdRef.current = requestId;
    setActivitySteps([]);
    setActivityExpanded(true);
    setActivityManuallyToggled(false);
    requestSessionMapRef.current.set(requestId, targetSessionId);
    sessionStreamsRef.current.set(targetSessionId, {
      requestId,
      baseMessages: updatedMessages,
      accumulated,
      steps: [],
    });
    sessionMessagesCacheRef.current.set(targetSessionId, updatedMessages);
    onSessionStreamStateChange?.(targetSessionId, true);

    // Strip hidden gdoc markers from messages before sending to LLM
    const llmMessages = updatedMessages.map((m) => {
      if (m.role === 'assistant' && m.content.includes('<!-- gdoc:')) {
        return { ...m, content: m.content.replace(/\n*<!-- gdoc:.+? -->/g, '').trim() };
      }
      return m;
    });

    try {
      await window.keel.chatStream(llmMessages, requestId);
    } catch (error) {
      const msg =
        error instanceof Error
          ? error.message
          : 'AI provider unavailable. Check Settings to configure your AI engine.';
      requestSessionMapRef.current.delete(requestId);
      sessionStreamsRef.current.delete(targetSessionId);
      onSessionStreamStateChange?.(targetSessionId, false);
      const finalMessages = [
        ...updatedMessages,
        { role: 'assistant' as const, content: msg, timestamp: Date.now() },
      ];
      sessionMessagesCacheRef.current.set(targetSessionId, finalMessages);
      window.keel.saveChat(targetSessionId, finalMessages).catch(() => {});

      if (targetSessionId === currentSessionIdRef.current) {
        justLoadedRef.current = true;
        setMessages(finalMessages);
        resetStreamingUi();

        // Clear pending Google Doc export on error
        pendingGoogleExportRef.current = false;
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Command autocomplete navigation
    if (commandSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setCommandIndex((i) => (i + 1) % commandSuggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setCommandIndex((i) => (i - 1 + commandSuggestions.length) % commandSuggestions.length);
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        const selected = commandSuggestions[commandIndex];
        if (selected) {
          const needsArg = ['/capture', '/remind', '/schedule'].includes(selected.command);
          setInput(selected.command + (needsArg ? ' ' : ''));
        }
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const selected = commandSuggestions[commandIndex];
        if (selected) {
          const needsArg = ['/capture', '/remind', '/schedule'].includes(selected.command);
          setInput(selected.command + (needsArg ? ' ' : ''));
        }
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="chat-pane">
      {showHeader && (
        <div className="chat-pane__header">
          <div className="chat-pane__title">{conversationTitle}</div>
        </div>
      )}

      <div ref={scrollRef} className="chat-pane__scroll">
        <div className="chat-pane__content">
          {messages.length === 0 && !isStreaming && (
            <div className="chat-empty-state">
              <div className="chat-empty-state__glyph">✦</div>
              <h2 className="chat-empty-state__title">{emptyStateGreeting}</h2>
              <p className="chat-empty-state__description">
                Keel can help you review active work, pull a daily brief, capture context, or turn scattered notes into a clear next step.
              </p>
              <div className="chat-empty-state__suggestions">
                {WELCOME_SUGGESTIONS.map((s) => (
                  <button
                    key={s.label}
                    onClick={() => sendMessage(s.label)}
                    className="chat-empty-state__chip"
                  >
                    <span>{s.icon}</span>
                    <span>{s.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <Message key={i} message={msg} />
          ))}

          {isStreaming && !streamingContent && <ThinkingIndicator />}

          {isStreaming && !!streamingContent && !pendingGoogleExportRef.current && (
            <ActivityPanel
              steps={activitySteps}
              answerStarted={!!streamingContent}
              expanded={activityExpanded}
              onToggle={() => {
                setActivityManuallyToggled(true);
                setActivityExpanded((prev) => !prev);
              }}
            />
          )}

          {isStreaming && streamingContent && !pendingGoogleExportRef.current && (
            <Message
              message={{
                role: 'assistant',
                content: streamingContent,
                timestamp: Date.now(),
              }}
            />
          )}

          {isStreaming && streamingContent && pendingGoogleExportRef.current && (
            <Message
              message={{
                role: 'assistant',
                content: 'Writing your document...',
                timestamp: Date.now(),
              }}
            />
          )}
        </div>
      </div>

      <div className="chat-pane__composer-wrap">
        <div className={composerExpanded ? 'chat-composer is-expanded' : 'chat-composer'}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            multiple
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />

          {attachedImages.length > 0 && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
              {attachedImages.map((img, i) => (
                <div key={i} style={{ position: 'relative' }}>
                  <img
                    src={`data:${img.mediaType};base64,${img.data}`}
                    alt=""
                    style={{
                      width: 58,
                      height: 58,
                      borderRadius: 12,
                      objectFit: 'cover',
                      border: '1px solid var(--border-emphasis)',
                    }}
                  />
                  <button
                    onClick={() => removeImage(i)}
                    style={{
                      position: 'absolute',
                      top: -6,
                      right: -6,
                      width: 18,
                      height: 18,
                      borderRadius: '50%',
                      background: 'var(--accent)',
                      border: 'none',
                      color: 'var(--button-primary-text)',
                      fontSize: 11,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      lineHeight: 1,
                      padding: 0,
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {isCommandMode && (
            <div className="chat-composer__command-label">
              Command mode
              {commandSuggestions.length > 0 && (
                <div className="chat-composer__command-suggestions">
                  {commandSuggestions.map((cmd, i) => (
                    <button
                      key={cmd.command}
                      className={`chat-composer__command-option${i === commandIndex ? ' is-active' : ''}`}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        const needsArg = ['/capture', '/remind', '/schedule'].includes(cmd.command);
                        setInput(cmd.command + (needsArg ? ' ' : ''));
                        textareaRef.current?.focus();
                      }}
                      onMouseEnter={() => setCommandIndex(i)}
                    >
                      <span className="chat-composer__command-name">{cmd.command}</span>
                      <span className="chat-composer__command-desc">{cmd.description}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
	            placeholder={messages.length === 0 ? 'Ask Keel anything…' : 'Reply…'}
            disabled={isStreaming}
            rows={1}
            className={isCommandMode ? 'chat-composer__textarea is-command' : 'chat-composer__textarea'}
          />

          <div className="chat-composer__footer">
            <div className="chat-composer__meta">
	              <button
	                onClick={handleImageAttach}
	                disabled={isStreaming}
	                title="Attach image"
	                aria-label="Attach image"
	                className="chat-composer__icon-button"
	              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                  <circle cx="8.5" cy="8.5" r="1.5"/>
                  <polyline points="21 15 16 10 5 21"/>
                </svg>
              </button>
              <span className="chat-composer__hint">
                {isCommandMode ? 'Slash command ready' : 'Shift+Enter for a new line'}
              </span>
            </div>

            <div className="chat-composer__actions">
              <div style={{ position: 'relative' }}>
	                <button
	                  onClick={() => setShowModelDropdown(!showModelDropdown)}
	                  aria-label="Choose model"
	                  className="chat-composer__model-button"
	                >
                  {getModelLabel()}
                  <span style={{ fontSize: 8 }}>▼</span>
                </button>

                {showModelDropdown && (
                  <>
                    <div
                      onClick={() => setShowModelDropdown(false)}
                      style={{ position: 'fixed', inset: 0, zIndex: 99 }}
                    />
	                    <div style={{
	                      position: 'absolute', bottom: 'calc(100% + 8px)', right: 0,
	                      background: 'var(--surface-elevated)', border: '1px solid var(--panel-border-strong)',
	                      borderRadius: 'var(--radius-lg)', padding: '4px 0', minWidth: 180,
	                      boxShadow: '0 8px 24px rgba(0,0,0,0.25)', zIndex: 100,
	                      maxHeight: 320, overflowY: 'auto',
	                    }}>
	                {availableProviders.has('claude') && (
	                  <>
	                    <div style={{ fontSize: 10, color: 'var(--text-disabled)', padding: '6px 14px 2px', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>Claude</div>
	                    {CLAUDE_MODELS.map((m) => {
	                      const active = currentProvider === 'claude' && currentModel === m.value;
	                      return (
	                        <button key={`claude-${m.value}`} onClick={() => handleModelChange('claude', m.value)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 14px', border: 'none', cursor: 'pointer', background: active ? 'var(--accent-bg)' : 'transparent', color: active ? 'var(--accent-link)' : 'var(--text-secondary)', fontSize: 12, transition: 'background 0.1s' }}
	                          onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'var(--surface-muted)'; }}
	                          onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
	                        >{m.label}</button>
	                      );
                    })}
                  </>
                )}
                {availableProviders.has('openai') && (
                  <>
	                    {availableProviders.has('claude') && <div style={{ height: 1, background: 'var(--panel-border)', margin: '4px 0' }} />}
	                    <div style={{ fontSize: 10, color: 'var(--text-disabled)', padding: '6px 14px 2px', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>OpenAI</div>
	                    {openaiModelsLoading && openaiModelOptions.length === 0 && (
	                      <div style={{ padding: '8px 14px', color: 'var(--text-muted)', fontSize: 12 }}>
	                        Loading live OpenAI models...
	                      </div>
	                    )}
	                    {openaiModelOptions.map((m) => {
	                      const active = currentProvider === 'openai' && currentModel === m.value;
	                      return (
	                        <button key={`openai-${m.value}`} onClick={() => handleModelChange('openai', m.value)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 14px', border: 'none', cursor: 'pointer', background: active ? 'var(--accent-bg)' : 'transparent', color: active ? 'var(--accent-link)' : 'var(--text-secondary)', fontSize: 12, transition: 'background 0.1s' }}
	                          onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'var(--surface-muted)'; }}
	                          onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
	                        >{m.label}</button>
                      );
                    })}
                  </>
                )}
                {availableProviders.has('ollama') && ollamaModels.length > 0 && (
                  <>
	                    {(availableProviders.has('claude') || availableProviders.has('openai')) && <div style={{ height: 1, background: 'var(--panel-border)', margin: '4px 0' }} />}
	                    <div style={{ fontSize: 10, color: 'var(--text-disabled)', padding: '6px 14px 2px', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>Ollama</div>
	                    {ollamaModels.map((m) => {
	                      const active = currentProvider === 'ollama' && currentModel === m.name;
	                      return (
	                        <button key={`ollama-${m.name}`} onClick={() => handleModelChange('ollama', m.name)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 14px', border: 'none', cursor: 'pointer', background: active ? 'var(--accent-bg)' : 'transparent', color: active ? 'var(--accent-link)' : 'var(--text-secondary)', fontSize: 12, transition: 'background 0.1s' }}
	                          onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'var(--surface-muted)'; }}
	                          onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
	                        >{m.name.split(':')[0]} <span style={{ color: 'var(--text-disabled)' }}>{m.parameterSize}</span></button>
	                      );
                    })}
                  </>
                )}
                {availableProviders.has('openrouter') && (
                  <>
	                    {(availableProviders.has('claude') || availableProviders.has('openai') || availableProviders.has('ollama')) && <div style={{ height: 1, background: 'var(--panel-border)', margin: '4px 0' }} />}
	                    <div style={{ fontSize: 10, color: 'var(--text-disabled)', padding: '6px 14px 2px', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>OpenRouter</div>
	                    <button onClick={() => handleModelChange('openrouter', openrouterModelName)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 14px', border: 'none', cursor: 'pointer', background: currentProvider === 'openrouter' ? 'var(--accent-bg)' : 'transparent', color: currentProvider === 'openrouter' ? 'var(--accent-link)' : 'var(--text-secondary)', fontSize: 12, transition: 'background 0.1s' }}
	                      onMouseEnter={(e) => { if (currentProvider !== 'openrouter') e.currentTarget.style.background = 'var(--surface-muted)'; }}
	                      onMouseLeave={(e) => { if (currentProvider !== 'openrouter') e.currentTarget.style.background = 'transparent'; }}
	                    >{openrouterModelName || 'Configure in Settings'}</button>
                  </>
                )}
                {availableProviders.size === 0 && (
	                  <div style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: 12 }}>
	                    No providers configured. Add an API key in Settings.
	                  </div>
                )}
                    </div>
                  </>
                )}
              </div>

              {isStreaming ? (
                <button
                  onClick={() => {
                    if (activeRequestIdRef.current) {
                      window.keel.cancelStream(activeRequestIdRef.current);
                    }
                    resetStreamingUi();
                  }}
                  className="chat-composer__send chat-composer__stop"
                >
                  Stop
                </button>
              ) : (
                <button
                  onClick={() => sendMessage()}
                  disabled={!input.trim() && attachedImages.length === 0}
                  className="chat-composer__send"
                >
                  Send
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
