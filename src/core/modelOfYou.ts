import { FileManager } from './fileManager';

// Model-of-you lives as a hidden dotfile in the workspace so it doesn't clutter
// the project tree, but stays a plain markdown file the user can open and edit.
export const MODEL_OF_YOU_PATH = '.keel/model-of-me.md';

// Stable level-2 headings. Keel reads and writes the file by heading, so this
// order and spelling is the locked schema (see model_of_you_design.md, Week 1).
export const MODEL_SECTIONS = [
  'Goals',
  'Active projects',
  'People',
  'Habits and routines',
  'Commitments',
  'Writing voice',
  'Working style',
  'Recurring themes',
  'Things avoided',
  'Narrative',
] as const;

export type ModelSection = (typeof MODEL_SECTIONS)[number];

// Every section except the freeform Narrative. The structured slots the
// EOD/backfill prompts enumerate and validate proposed updates against.
export const STRUCTURED_SECTIONS = MODEL_SECTIONS.filter(
  (s): s is Exclude<ModelSection, 'Narrative'> => s !== 'Narrative',
);

const PREAMBLE = `<!-- Keel model-of-you. Edit freely; Keel respects your changes.
     Add <!-- locked --> after any section heading to prevent Keel from touching it. -->`;

const LOCK_MARKER = '<!-- locked -->';

export const MODEL_OF_YOU_TEMPLATE = `${PREAMBLE}

${MODEL_SECTIONS.map((h) => `## ${h}\n`).join('\n')}`;

export interface ParsedModel {
  preamble: string;
  sections: { heading: string; body: string }[];
}

/**
 * Read the raw model file, or null if it doesn't exist yet. The model is
 * seeded via the onboarding interview + backfill (or hand-written for testing);
 * chat must tolerate its absence rather than create it implicitly.
 */
export async function loadModelOfYou(fm: FileManager): Promise<string | null> {
  try {
    const content = await fm.readFile(MODEL_OF_YOU_PATH);
    return content.trim().length > 0 ? content : null;
  } catch {
    return null;
  }
}

/** Parse the file into an ordered list of sections plus any leading preamble. */
export function parseModel(content: string): ParsedModel {
  const lines = content.split('\n');
  const sections: { heading: string; body: string }[] = [];
  const preambleLines: string[] = [];
  let current: { heading: string; body: string[] } | null = null;

  for (const line of lines) {
    const headingMatch = line.match(/^##\s+(.+?)\s*$/);
    if (headingMatch) {
      if (current) sections.push({ heading: current.heading, body: current.body.join('\n').trim() });
      current = { heading: headingMatch[1].trim(), body: [] };
    } else if (current) {
      current.body.push(line);
    } else {
      preambleLines.push(line);
    }
  }
  if (current) sections.push({ heading: current.heading, body: current.body.join('\n').trim() });

  return { preamble: preambleLines.join('\n').trim(), sections };
}

/** Serialize a parsed model back to canonical markdown. */
export function serializeModel(model: ParsedModel): string {
  const preamble = model.preamble || PREAMBLE;
  const body = model.sections
    .map((s) => `## ${s.heading}\n${s.body ? `${s.body}\n` : ''}`)
    .join('\n');
  return `${preamble}\n\n${body}`;
}

/** A section is locked if the user added a <!-- locked --> marker to its body. */
export function isSectionLocked(body: string): boolean {
  return body.includes(LOCK_MARKER);
}

/**
 * Replace the body of one section, preserving every other section verbatim.
 * Respects the <!-- locked --> marker: a locked section is never mutated.
 * Returns true if the write happened, false if the section was locked.
 * Used by the EOD update workflow and the conversational-correction tool.
 */
export async function writeSection(
  fm: FileManager,
  heading: ModelSection,
  newBody: string,
): Promise<boolean> {
  const raw = (await loadModelOfYou(fm)) ?? MODEL_OF_YOU_TEMPLATE;
  const model = parseModel(raw);
  const section = model.sections.find((s) => s.heading.toLowerCase() === heading.toLowerCase());

  if (section) {
    if (isSectionLocked(section.body)) return false;
    section.body = newBody.trim();
  } else {
    model.sections.push({ heading, body: newBody.trim() });
  }

  await fm.writeFile(MODEL_OF_YOU_PATH, serializeModel(model));
  return true;
}

/** Overwrite the whole model file (used by backfill seeding and manual seeding). */
export async function saveModelOfYou(fm: FileManager, content: string): Promise<void> {
  await fm.writeFile(MODEL_OF_YOU_PATH, content);
}
