import { FileManager } from '../fileManager';
import { LLMClient } from '../llmClient';
import { logActivity } from '../db';
import type { Message } from '../../shared/types';
import {
  loadModelOfYou,
  parseModel,
  isSectionLocked,
  writeSection,
  STRUCTURED_SECTIONS,
  type ModelSection,
} from '../modelOfYou';
import * as entitlements from '../pro/entitlements';

function sanitizeJsonResponse(raw: string): string {
  let text = raw.trim();
  text = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
  const match = text.match(/\{[\s\S]*\}/);
  return match ? match[0] : text;
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

export interface ModelUpdatePayload {
  updates?: Partial<Record<ModelSection, string[]>>;
  narrative?: string;
}

export interface ModelUpdateResult {
  updated: boolean;
  changedSections: string[];
  skippedLocked: string[];
}

/**
 * Apply an LLM-proposed model update against the current file. Shared by the
 * EOD update and the backfill flow. Validates section names against the locked
 * schema, ignores hallucinated headings, and never mutates a <!-- locked -->
 * section. `currentRaw` is the model file as it exists right now (ground truth).
 */
export async function applyModelUpdate(
  fileManager: FileManager,
  payload: ModelUpdatePayload,
  currentRaw: string,
): Promise<{ changedSections: string[]; skippedLocked: string[] }> {
  const parsed = parseModel(currentRaw);
  const lockedHeadings = new Set(
    parsed.sections.filter((s) => isSectionLocked(s.body)).map((s) => s.heading.toLowerCase()),
  );

  const changedSections: string[] = [];
  const skippedLocked: string[] = [];

  const applySection = async (heading: ModelSection, body: string) => {
    if (lockedHeadings.has(heading.toLowerCase())) {
      skippedLocked.push(heading);
      return;
    }
    const ok = await writeSection(fileManager, heading, body);
    if (ok) changedSections.push(heading);
    else skippedLocked.push(heading);
  };

  for (const [rawHeading, lines] of Object.entries(payload.updates ?? {})) {
    const heading = STRUCTURED_SECTIONS.find((s) => s.toLowerCase() === rawHeading.toLowerCase());
    if (!heading) continue; // ignore hallucinated section names
    if (!Array.isArray(lines) || lines.length === 0) continue;
    await applySection(heading, lines.join('\n'));
  }

  if (payload.narrative && payload.narrative.trim().length > 0) {
    await applySection('Narrative', payload.narrative.trim());
  }

  return { changedSections, skippedLocked };
}

export function sanitizeModelJson(raw: string): string {
  return sanitizeJsonResponse(raw);
}

function buildPrompt(userName: string, today: string): string {
  const name = userName || 'the user';
  return `You maintain Keel's "model of you" — a living understanding of who ${name} is, kept in a markdown file with fixed sections. Your job at end of day is to propose careful, incremental updates to that file based on what happened today.

TONE — this is the most important rule:
- Write in an observational, generous voice. "I noticed ${name} keeps returning to X." NOT "${name} has been avoiding X" or "${name} failed to Y."
- You are a trusted colleague building a picture over time, not an auditor grading them.

GROUND TRUTH AND SAFETY:
- The CURRENT MODEL is ground truth. Preserve every existing line unless today's input clearly supersedes it. You are merging, not rewriting from scratch.
- NEVER invent facts. Only add something today's input actually supports.
- Filter noise hard: ignore microphone tests, empty briefs, placeholder names ([Your Name]), and obvious demo/test transcript names (e.g. generic "Bob", "Tina", "Sally" with no real context). When unsure whether a name is a real person, leave People unchanged.
- "People" may stay empty. Do not pad it.

SECTION SOURCING:
- Goals, Active projects, People, Habits and routines, Commitments, Recurring themes, Things avoided, Narrative: may draw from today's EOD summary and the user's own words.
- Writing voice and Working style: draw ONLY from the user's own captured words and chat messages (provided separately), NEVER from Keel's EOD summary text — that summary is written in Keel's voice, not ${name}'s.

OUTPUT FORMAT — respond with ONLY valid JSON:
{
  "updates": {
    "<Section name>": ["- bullet line", "- bullet line"]
  },
  "narrative": "full replacement narrative prose"
}
- For each structured section you want to change, return the COMPLETE merged body as an array of markdown bullet lines (existing lines you are keeping PLUS new/refined ones). Omit any section you are not changing.
- Section names must be EXACTLY one of: ${STRUCTURED_SECTIONS.join(', ')}.
- Keep each section to at most ~30 bullets; prefer refining a line over adding a near-duplicate.
- "narrative" is optional prose (a few short paragraphs, observational). If you change it, end it with a line "Updated: ${today}". Omit the key if unchanged.
- If nothing meaningful changed today, respond with {"updates": {}}.

Respond ONLY with the JSON object.`;
}

/**
 * EOD-time update to model-of-you. Reads today's EOD summary + the user's own
 * recent words, asks the LLM for merged section bodies, applies them while
 * respecting <!-- locked --> sections. Best-effort: never throws into the EOD
 * flow. No-op (returns undefined) when no model file exists — that is the
 * Pro-gating / not-yet-seeded signal.
 */
export async function updateModelFromEod(
  fileManager: FileManager,
  llmClient: LLMClient,
  opts: { eodSummary: string; recentChat?: Message[]; userName?: string },
): Promise<ModelUpdateResult | undefined> {
  try {
    // Defensive gating: verify Pro entitlement before updating model
    const proStatus = await entitlements.getProStatus();
    if (!proStatus.isPro) return; // not Pro — don't update model

    const current = await loadModelOfYou(fileManager);
    if (!current) return; // not seeded — nothing to maintain

    const today = formatDate(new Date());

    // The user's own words, for voice/style sourcing (Week 1 finding: EOD
    // summaries are Keel's voice, not the user's). Recent captures + user chat.
    const ownWords: string[] = [];
    try {
      const captureFiles = await fileManager.listFiles('inbox/*.md');
      for (const file of captureFiles.sort().reverse().slice(0, 8)) {
        try {
          ownWords.push(await fileManager.readFile(file));
        } catch { /* skip */ }
      }
    } catch { /* no captures */ }
    for (const m of (opts.recentChat ?? []).filter((m) => m.role === 'user').slice(-8)) {
      ownWords.push(m.content);
    }

    const contextBlocks = [
      `# CURRENT MODEL\n${current}`,
      `# TODAY'S EOD SUMMARY (Keel's voice — do NOT use for writing voice / working style)\n${opts.eodSummary}`,
      ownWords.length > 0
        ? `# ${opts.userName || 'USER'}'S OWN RECENT WORDS (use these for writing voice & working style)\n${ownWords.join('\n---\n')}`
        : '',
    ].filter(Boolean);

    const response = await llmClient.chat(
      [{ role: 'user', content: contextBlocks.join('\n\n'), timestamp: Date.now() }],
      buildPrompt(opts.userName ?? '', today),
    );

    let payload: ModelUpdatePayload;
    try {
      payload = JSON.parse(sanitizeJsonResponse(response));
    } catch {
      console.error('[model-update] JSON parse failed. Raw:', response.slice(0, 300));
      return;
    }

    const { changedSections, skippedLocked } = await applyModelUpdate(fileManager, payload, current);

    const updated = changedSections.length > 0;
    if (updated || skippedLocked.length > 0) {
      try {
        logActivity(
          fileManager.getBrainPath(),
          'model-update',
          `EOD: changed ${changedSections.join(', ') || 'none'}${skippedLocked.length ? ` | skipped locked: ${skippedLocked.join(', ')}` : ''}`,
        );
      } catch {
        // Activity logging is non-essential; never discard the update result over it.
      }
    }

    return { updated, changedSections, skippedLocked };
  } catch (err) {
    // Best-effort — never fail the EOD flow over a model update.
    console.error('[model-update] Failed:', err);
  }
}
