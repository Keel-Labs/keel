import { FileManager } from '../fileManager';
import type { ModelInterviewAnswers } from '../../shared/types';
import {
  loadModelOfYou,
  parseModel,
  serializeModel,
  saveModelOfYou,
  MODEL_OF_YOU_TEMPLATE,
  type ModelSection,
} from '../modelOfYou';

// ModelInterviewAnswers (in shared/types) holds the five onboarding answers
// (design decision #7). Each maps to one model-of-you section. Answers are the
// user's own words → ground truth; backfill fills the rest and yields on conflict.

const ANSWER_TO_SECTION: Array<{ key: keyof ModelInterviewAnswers; section: ModelSection }> = [
  { key: 'workingOn', section: 'Goals' },
  { key: 'people', section: 'People' },
  { key: 'recurringTheme', section: 'Recurring themes' },
  { key: 'avoided', section: 'Things avoided' },
  { key: 'voice', section: 'Writing voice' },
];

// Turn a freeform answer into markdown bullet lines. Splits on newlines and on
// leading list markers ("1.", "-", "*") so "1. X 2. Y" and multi-line answers
// both become clean bullets; a single sentence becomes one bullet.
function toBullets(answer: string): string[] {
  const trimmed = answer.trim();
  if (!trimmed) return [];
  const byLine = trimmed
    .split('\n')
    .flatMap((line) => line.split(/(?=\s\d+[.)]\s)/)) // split inline "2." enumerations
    .map((s) => s.replace(/^\s*(?:[-*]|\d+[.)])\s*/, '').trim())
    .filter(Boolean);
  return byLine.map((s) => `- ${s}`);
}

/**
 * Seed (or re-seed) the model file from the 5-question interview. Existing
 * non-empty sections are preserved unless the interview provides new content
 * for them (interview answers are the freshest ground truth). Returns the
 * sections that received content.
 */
export async function seedModelFromInterview(
  fileManager: FileManager,
  answers: ModelInterviewAnswers,
): Promise<{ seededSections: ModelSection[] }> {
  const current = (await loadModelOfYou(fileManager)) ?? MODEL_OF_YOU_TEMPLATE;
  const model = parseModel(current);
  const seededSections: ModelSection[] = [];

  for (const { key, section } of ANSWER_TO_SECTION) {
    const bullets = toBullets(answers[key]);
    if (bullets.length === 0) continue;
    const existing = model.sections.find((s) => s.heading.toLowerCase() === section.toLowerCase());
    const body = bullets.join('\n');
    if (existing) existing.body = body;
    else model.sections.push({ heading: section, body });
    seededSections.push(section);
  }

  await saveModelOfYou(fileManager, serializeModel(model));
  return { seededSections };
}
