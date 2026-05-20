import { LLMClient } from '../llmClient';
import type { Message } from '../../shared/types';

export interface MeetingSynthesis {
  title: string;
  summary: string;
  keyPoints: string[];          // main topics, context, info shared (not decisions, not actions)
  decisions: string[];
  actionItems: string[];        // combined (for saved note)
  myActionItems: string[];      // assigned to the speaker/recorder
  othersActionItems: string[];  // assigned to other people
}

const SYNTHESIS_SYSTEM_PROMPT = `You are a meeting analyst. Given a meeting transcript, extract structured information that appears in the transcript.

Critical rules:
- Only include content that is actually present in the transcript. Never invent details, numbers, names, levels, salaries, or constraints that weren't said.
- If the transcript is empty, trivial, or has no substantive content, return empty arrays for every list and a brief honest summary like "Brief test recording — no substantive content."
- Do not pattern-match on what a "typical" meeting looks like. A transcript of "hello hello hello" is a transcript of "hello hello hello", not a job interview.

Respond ONLY with valid JSON — no markdown fences, no extra text.`;

const SYNTHESIS_USER_TEMPLATE = (transcript: string) => `Meeting transcript:

${transcript}

Return JSON with this shape:
{
  "title": "Short title (5–10 words) describing what was actually discussed",
  "summary": "3–5 sentence overview of the actual content. If the transcript is empty or trivial, say so plainly.",
  "keyPoints": ["Specific topics, facts, or context that were actually stated in the transcript. 4–8 bullets when the transcript supports it; empty array when it doesn't."],
  "decisions": ["Concrete decisions reached, only if explicitly present"],
  "myActionItems": ["Tasks the speaker/recorder committed to (first-person 'I', 'me', 'I'll')"],
  "othersActionItems": ["Name: task — only for tasks explicitly assigned to other named people"]
}

For keyPoints: include only concrete details that appear in the transcript — numbers, names, dates, constraints that were actually said. Do not fabricate.
For action items and decisions: empty arrays are correct and expected when nothing was committed or decided.
Empty arrays are always better than invented content.`;

export async function synthesizeMeeting(
  transcript: string,
  llmClient: LLMClient,
): Promise<MeetingSynthesis> {
  const messages: Message[] = [
    {
      role: 'user',
      content: SYNTHESIS_USER_TEMPLATE(transcript),
      timestamp: Date.now(),
    },
  ];

  const response = await llmClient.chat(messages, SYNTHESIS_SYSTEM_PROMPT);

  try {
    // Strip potential markdown code fences
    const cleaned = response.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const parsed = JSON.parse(cleaned) as Partial<MeetingSynthesis>;
    const myItems = Array.isArray(parsed.myActionItems) ? parsed.myActionItems : [];
    const othersItems = Array.isArray(parsed.othersActionItems) ? parsed.othersActionItems : [];
    return {
      title: parsed.title || 'Meeting',
      summary: parsed.summary || '',
      keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints : [],
      decisions: Array.isArray(parsed.decisions) ? parsed.decisions : [],
      myActionItems: myItems,
      othersActionItems: othersItems,
      actionItems: [...myItems, ...othersItems],  // combined for saved note
    };
  } catch {
    // Fallback: return minimal structure
    return {
      title: 'Meeting',
      summary: transcript.slice(0, 200),
      keyPoints: [],
      decisions: [],
      myActionItems: [],
      othersActionItems: [],
      actionItems: [],
    };
  }
}

export function formatMeetingNote(
  synthesis: MeetingSynthesis,
  transcript: string,
  date: string,
  time: string,
): string {
  const displayTime = time.replace(/-/g, ':');
  const lines: string[] = [];

  lines.push(`# ${synthesis.title}`);
  lines.push('');
  lines.push(`**Date:** ${date} at ${displayTime}`);
  lines.push('');

  lines.push('## Summary');
  lines.push('');
  lines.push(synthesis.summary);
  lines.push('');

  if (synthesis.keyPoints.length > 0) {
    lines.push('## Key Points');
    lines.push('');
    for (const point of synthesis.keyPoints) {
      lines.push(`- ${point}`);
    }
    lines.push('');
  }

  if (synthesis.actionItems.length > 0) {
    lines.push('## Action Items');
    lines.push('');
    for (const item of synthesis.actionItems) {
      lines.push(`- [ ] ${item}`);
    }
    lines.push('');
  }

  if (synthesis.decisions.length > 0) {
    lines.push('## Key Decisions');
    lines.push('');
    for (const decision of synthesis.decisions) {
      lines.push(`- ${decision}`);
    }
    lines.push('');
  }

  lines.push('## Transcript');
  lines.push('');
  lines.push(transcript);
  lines.push('');

  return lines.join('\n');
}

export function formatDailyLogEntry(
  synthesis: MeetingSynthesis,
  meetingPath: string,
): string {
  const lines: string[] = ['', `## Meeting: ${synthesis.title}`, ''];

  if (synthesis.summary) {
    lines.push(synthesis.summary);
    lines.push('');
  }

  if (synthesis.actionItems.length > 0) {
    const itemList = synthesis.actionItems.map((item) => `- [ ] ${item}`).join('\n');
    lines.push('**Action items:**');
    lines.push(itemList);
    lines.push('');
  }

  lines.push(`[Full notes →](${meetingPath})`);
  lines.push('');

  return lines.join('\n');
}
