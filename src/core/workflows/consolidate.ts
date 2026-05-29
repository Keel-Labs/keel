import { FileManager } from '../fileManager';
import { LLMClient } from '../llmClient';
import { logActivity } from '../db';
import {
  loadModelOfYou,
  writeSection,
  STRUCTURED_SECTIONS,
  ARCHIVE_SECTION,
} from '../modelOfYou';
import { applyModelUpdate, sanitizeModelJson, type ModelUpdatePayload } from './modelUpdate';

// How far back "recent activity" reaches when judging whether an item is stale.
const FRESHNESS_WINDOW_DAYS = 60;
const MAX_ACTIVITY_CHARS = 60_000;
const MAX_ITEMS_PER_SECTION = 30;

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function isDatedLog(name: string): string | null {
  const m = name.match(/(\d{4}-\d{2}-\d{2})\.md$/);
  return m ? m[1] : null;
}

interface ConsolidatePayload extends ModelUpdatePayload {
  archive?: string[];
}

export interface ConsolidateResult {
  consolidated: boolean;
  changedSections: string[];
  archived: boolean;
  skippedLocked: string[];
}

/**
 * Whether a weekly consolidation is due. Runs on the configured day of week,
 * once per calendar day, with a catch-up if more than 10 days have elapsed
 * (so users who never have the app open on the configured day still get one).
 * Pure for testability.
 */
export function dueForConsolidation(
  lastRunDate: string | null,
  todayKey: string,
  dayOfWeek: number,
  configuredDay: number,
): boolean {
  if (lastRunDate === todayKey) return false;
  if (dayOfWeek === configuredDay) return true;
  if (lastRunDate) {
    const days = Math.floor((Date.parse(todayKey) - Date.parse(lastRunDate)) / 86_400_000);
    if (days >= 10) return true;
  }
  return false;
}

function buildPrompt(userName: string, today: string): string {
  const name = userName || 'the user';
  return `You are doing a weekly tidy of Keel's "model of you" for ${name}. The goal is to keep it accurate, de-duplicated, and bounded — NOT to add new facts.

You are given the CURRENT MODEL and a list of RECENT ACTIVITY (the last ${FRESHNESS_WINDOW_DAYS} days of daily logs). Use the activity only to judge what is still current.

DO THIS:
1. Within each section, merge duplicate or near-duplicate bullets into one clean line. Keep the user's own wording where possible.
2. Retire stale items: a goal, active project, or recurring theme that has NOT appeared in recent activity and reads as finished or abandoned should be MOVED to the Archive (not deleted). Be conservative — when in doubt, leave it where it is. Aspirational/long-horizon goals are not stale just because they are slow.
3. Bound the Narrative: if it is long, summarize it to a few tight paragraphs (aim for under ~250 words). Preserve the most important observations; drop redundancy. End it with a line "Updated: ${today}".
4. Keep each structured section to at most ${MAX_ITEMS_PER_SECTION} bullets.

DO NOT:
- Invent new goals, people, themes, or facts. This is cleanup, not discovery.
- Touch "Things avoided", "Habits and routines", "Writing voice", "Working style", "People" unless there are literal duplicates to merge — these are not subject to staleness.
- Empty a section just because it is quiet.

TONE: observational and generous, never accusatory. Archived items get a short neutral note, e.g. "- Ship the beta — archived ${today} (shipped / no recent activity)".

OUTPUT — respond with ONLY valid JSON:
{
  "updates": { "<Section name>": ["- bullet", "..."] },
  "archive": ["- retired item — archived ${today} (reason)", "..."],
  "narrative": "the bounded narrative prose, ending with Updated: ${today}"
}
- Only include a section under "updates" if you actually changed it (merged or removed something). Return its COMPLETE new body.
- "archive" is the COMPLETE new Archive section body (merge with any existing Archive lines you see). Omit if nothing is being archived and Archive is currently empty.
- Section names must be EXACTLY one of: ${STRUCTURED_SECTIONS.join(', ')}.
- Omit "narrative" if it was already short and needs no change.

Respond ONLY with the JSON object.`;
}

/**
 * Weekly deep pass: de-duplicate, retire stale goals/projects/themes to the
 * Archive section (never silently delete), and bound the narrative. Reads
 * recent daily logs as the freshness signal. Best-effort; no-op when unseeded.
 */
export async function consolidateModel(
  fileManager: FileManager,
  llmClient: LLMClient,
  opts?: { userName?: string },
): Promise<ConsolidateResult | undefined> {
  try {
    const current = await loadModelOfYou(fileManager);
    if (!current) return; // not seeded — nothing to consolidate

    const today = formatDate(new Date());
    const cutoff = formatDate(new Date(Date.now() - FRESHNESS_WINDOW_DAYS * 86_400_000));

    // Recent daily logs = the freshness signal for the stale heuristic.
    const activity: string[] = [];
    let used = 0;
    try {
      const logs = await fileManager.listFiles('daily-log/*.md');
      const recent = logs
        .map((f) => ({ f, d: isDatedLog(f) }))
        .filter((x): x is { f: string; d: string } => x.d !== null && x.d >= cutoff)
        .sort((a, b) => b.d.localeCompare(a.d));
      for (const { f } of recent) {
        try {
          const content = await fileManager.readFile(f);
          if (used + content.length > MAX_ACTIVITY_CHARS) break;
          activity.push(`## ${f}\n${content}`);
          used += content.length;
        } catch { /* skip */ }
      }
    } catch { /* no logs */ }

    const userMessage = [
      `# CURRENT MODEL\n${current}`,
      `# RECENT ACTIVITY (last ${FRESHNESS_WINDOW_DAYS} days)\n${activity.join('\n\n') || '(no recent daily logs)'}`,
    ].join('\n\n');

    const response = await llmClient.chat(
      [{ role: 'user', content: userMessage, timestamp: Date.now() }],
      buildPrompt(opts?.userName ?? '', today),
    );

    let payload: ConsolidatePayload;
    try {
      payload = JSON.parse(sanitizeModelJson(response));
    } catch {
      console.error('[consolidate] JSON parse failed. Raw:', response.slice(0, 300));
      return { consolidated: false, changedSections: [], archived: false, skippedLocked: [] };
    }

    const { changedSections, skippedLocked } = await applyModelUpdate(
      fileManager,
      { updates: payload.updates, narrative: payload.narrative },
      current,
    );

    let archived = false;
    if (Array.isArray(payload.archive) && payload.archive.length > 0) {
      const ok = await writeSection(fileManager, ARCHIVE_SECTION, payload.archive.join('\n'));
      if (ok) archived = true;
      else skippedLocked.push(ARCHIVE_SECTION);
    }

    const consolidated = changedSections.length > 0 || archived;
    if (consolidated || skippedLocked.length > 0) {
      try {
        logActivity(
          fileManager.getBrainPath(),
          'model-consolidate',
          `changed: ${changedSections.join(', ') || 'none'}${archived ? ' | archived items' : ''}${
            skippedLocked.length ? ` | skipped locked: ${skippedLocked.join(', ')}` : ''
          }`,
        );
      } catch { /* logging is non-essential */ }
    }

    return { consolidated, changedSections, archived, skippedLocked };
  } catch (err) {
    console.error('[consolidate] Failed:', err);
  }
}
