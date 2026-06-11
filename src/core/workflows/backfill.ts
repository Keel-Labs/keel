import { FileManager } from '../fileManager';
import { LLMClient } from '../llmClient';
import { logActivity } from '../db';
import {
  loadModelOfYou,
  saveModelOfYou,
  MODEL_OF_YOU_TEMPLATE,
  STRUCTURED_SECTIONS,
} from '../modelOfYou';
import { applyModelUpdate, sanitizeModelJson, type ModelUpdatePayload } from './modelUpdate';
import * as entitlements from '../pro/entitlements';

// ~50k tokens of source material (decision #7 in the design). Budgeted in chars
// (~4 chars/token) with headroom for the prompt and the model file itself.
const DEFAULT_MAX_SOURCE_CHARS = 180_000;
const DAILY_LOG_WINDOW_DAYS = 90;

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function isDatedLog(name: string): string | null {
  const m = name.match(/(\d{4}-\d{2}-\d{2})\.md$/);
  return m ? m[1] : null;
}

export interface BackfillResult {
  seeded: boolean;
  sourceFiles: number;
  sourceChars: number;
  changedSections: string[];
  skippedLocked: string[];
}

function buildBackfillPrompt(userName: string, today: string): string {
  const name = userName || 'the user';
  return `You are seeding Keel's "model of you" for ${name} for the FIRST time, by reading a long stretch of their workspace history in one pass. Build a rich, accurate initial picture across all of it — this is synthesis across many days, not a single-day recap.

TONE — most important rule:
- Observational and generous. "I noticed ${name} keeps returning to X." NEVER "${name} has been failing to" or "${name} is avoiding" in an accusatory way.
- You are a trusted colleague forming a first impression, not an auditor.

GROUND TRUTH AND SAFETY:
- The CURRENT MODEL (provided) is ground truth and takes PRECEDENCE on any conflict — it may contain answers the user gave directly (e.g. an onboarding interview). Preserve those; only fill gaps and add what the history supports.
- NEVER invent facts. Synthesize only from what the sources actually show.
- Filter noise HARD: ignore microphone tests ("testing 1 2 3"), empty/placeholder briefs, "[Your Name]", and demo/test transcript names (generic "Bob", "Tina", "Sally", "Joan" with no real grounding).
- CONFIDENCE CALIBRATION (important — this history may include demo/test data created while building software). Weight by repetition:
  - A theme that recurs across MANY days with concrete specifics is high confidence — state it plainly.
  - Something mentioned only ONCE or TWICE (a single capture like "climb a wall at 10am", "start baking", a one-off project) is LOW confidence — either omit it, or include it tagged "(mentioned once — confirm?)". Do NOT assert low-frequency items as established facts.
  - When unsure if something is real biography vs. a test note, prefer the tentative tag over confident assertion. The user will prune.
- "People" may stay empty if there are no genuine recurring collaborators. Do not pad it.

WHAT TO SYNTHESIZE PER SECTION:
- Goals: durable objectives, each tagged with a horizon: [now], [this quarter], [strategic], or [aspirational] — NOT a bare year.
- Recurring themes: topics that genuinely span many days.
- Things avoided: THIS SECTION MATTERS — look for priorities/intentions that appear repeatedly across multiple days or briefs but are never marked done or completed (e.g. a top-priority task that carries forward week after week). Frame observationally ("I noticed X kept coming up without being closed out"). Do not leave this empty if such patterns exist.
- Habits and routines: behaviors with a real recurring cadence (seen on multiple days), not one-off mentions.
- Commitments: dated/recurring obligations that recur or are clearly real.
- Writing voice and Working style: infer ONLY from the user's OWN captured words and chat (provided as "OWN WORDS"), NEVER from Keel-authored brief/EOD summary prose. Whenever OWN WORDS are present, ALWAYS produce both of these sections.
- Use real dates from the history where natural ("first noticed: YYYY-MM-DD", "last touched: YYYY-MM-DD").

OUTPUT — respond with ONLY valid JSON:
{
  "updates": {
    "<Section name>": ["- bullet", "- bullet"]
  },
  "narrative": "a few short observational paragraphs ending with a line: Updated: ${today}"
}
- For each structured section, return the COMPLETE body as an array of markdown bullet lines (merge in any line already present in the current model).
- Section names must be EXACTLY one of: ${STRUCTURED_SECTIONS.join(', ')}.
- At most ~30 bullets per section; prefer one good line over near-duplicates.
- Omit a section only if you genuinely have nothing for it AND the current model has nothing there.

Respond ONLY with the JSON object.`;
}

/**
 * One-time deep pass that seeds model-of-you from workspace history (last ~90
 * days of daily logs + active project notes + recent captures). Merges into the
 * current model file (interview seed or template), with existing content as
 * ground truth. No-ops for brand-new users with no history. Best-effort.
 */
export async function backfillModel(
  fileManager: FileManager,
  llmClient: LLMClient,
  opts?: { maxSourceChars?: number; userName?: string },
): Promise<BackfillResult | undefined> {
  const empty: BackfillResult = {
    seeded: false,
    sourceFiles: 0,
    sourceChars: 0,
    changedSections: [],
    skippedLocked: [],
  };
  try {
    // Defensive gating: verify Pro entitlement before backfilling model
    const proStatus = await entitlements.getProStatus();
    if (!proStatus.isPro) return empty; // not Pro — don't backfill

    const budget = opts?.maxSourceChars ?? DEFAULT_MAX_SOURCE_CHARS;
    const today = formatDate(new Date());
    const cutoff = new Date(Date.now() - DAILY_LOG_WINDOW_DAYS * 86_400_000);
    const cutoffStr = formatDate(cutoff);

    // Gather sources, most-valuable first, within the char budget.
    const blocks: string[] = [];
    let usedChars = 0;
    let fileCount = 0;
    const ownWords: string[] = [];

    const tryAdd = (label: string, content: string): boolean => {
      const block = `\n\n## ${label}\n${content}`;
      if (usedChars + block.length > budget) return false;
      blocks.push(block);
      usedChars += block.length;
      fileCount++;
      return true;
    };

    // 1. Daily logs within the window, most recent first.
    let logs: string[] = [];
    try {
      logs = await fileManager.listFiles('daily-log/*.md');
    } catch { /* none */ }
    const datedLogs = logs
      .map((f) => ({ f, d: isDatedLog(f) }))
      .filter((x): x is { f: string; d: string } => x.d !== null && x.d >= cutoffStr)
      .sort((a, b) => b.d.localeCompare(a.d));
    for (const { f } of datedLogs) {
      try {
        if (!tryAdd(f, await fileManager.readFile(f))) break;
      } catch { /* skip */ }
    }

    // 2. Active project context notes.
    try {
      for (const f of await fileManager.listFiles('projects/*/context.md')) {
        try {
          if (!tryAdd(f, await fileManager.readFile(f))) break;
        } catch { /* skip */ }
      }
    } catch { /* none */ }

    // 3. Recent captures — kept aside as the user's OWN WORDS for voice/style.
    try {
      const captures = (await fileManager.listFiles('inbox/*.md')).sort().reverse().slice(0, 20);
      for (const f of captures) {
        try {
          ownWords.push(await fileManager.readFile(f));
        } catch { /* skip */ }
      }
    } catch { /* none */ }

    if (fileCount === 0 && ownWords.length === 0) {
      // Brand-new user, no history → nothing to backfill.
      return empty;
    }

    // Current model = ground truth (interview seed or template).
    const current = (await loadModelOfYou(fileManager)) ?? MODEL_OF_YOU_TEMPLATE;
    if (!(await loadModelOfYou(fileManager))) {
      await saveModelOfYou(fileManager, MODEL_OF_YOU_TEMPLATE);
    }

    const contextBlocks = [
      `# CURRENT MODEL (ground truth — preserve, fill gaps)\n${current}`,
      `# WORKSPACE HISTORY (Keel-authored briefs/summaries + project notes; NOT for voice/style)${blocks.join('')}`,
      ownWords.length > 0
        ? `# ${opts?.userName || 'USER'}'S OWN WORDS (use for writing voice & working style)\n${ownWords.join('\n---\n')}`
        : '',
    ].filter(Boolean);

    const response = await llmClient.chat(
      [{ role: 'user', content: contextBlocks.join('\n\n'), timestamp: Date.now() }],
      buildBackfillPrompt(opts?.userName ?? '', today),
    );

    let payload: ModelUpdatePayload;
    try {
      payload = JSON.parse(sanitizeModelJson(response));
    } catch {
      console.error('[backfill] JSON parse failed. Raw:', response.slice(0, 300));
      return { ...empty, sourceFiles: fileCount, sourceChars: usedChars };
    }

    const { changedSections, skippedLocked } = await applyModelUpdate(fileManager, payload, current);

    try {
      logActivity(
        fileManager.getBrainPath(),
        'model-backfill',
        `Seeded from ${fileCount} file(s), ${usedChars} chars | changed: ${changedSections.join(', ') || 'none'}`,
      );
    } catch { /* logging is non-essential */ }

    return {
      seeded: changedSections.length > 0,
      sourceFiles: fileCount,
      sourceChars: usedChars,
      changedSections,
      skippedLocked,
    };
  } catch (err) {
    console.error('[backfill] Failed:', err);
    return empty;
  }
}
