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

const SYNTHESIS_SYSTEM_PROMPT = `You are a meeting analyst. Given a meeting transcript, extract structured information.
Respond ONLY with valid JSON — no markdown fences, no extra text.`;

const SYNTHESIS_USER_TEMPLATE = (transcript: string) => `Meeting transcript:

${transcript}

Extract the following and return as JSON:
{
  "title": "A short title for this meeting (5-10 words)",
  "summary": "A substantive 3-5 sentence overview of what was discussed and why it mattered. Don't just restate the title — describe the actual content.",
  "keyPoints": ["The main topics, facts, and context shared during the meeting that aren't decisions and aren't action items. Examples: 'Compensation: base salary $180-220k plus equity', 'Role is leveled as L5 senior IC', 'Team reports into VP of Product', 'Hiring timeline targets Q3 close'. Aim for 4-8 specific bullets that capture what was actually said — concrete details, numbers, names, constraints. Skip generic filler."],
  "decisions": ["Concrete decisions or conclusions reached during the meeting (may be empty array)"],
  "myActionItems": ["action items assigned to the person speaking/recording (the 'Speaker', 'I', 'me', or 'you' — first-person perspective)"],
  "othersActionItems": ["Name: action item — tasks assigned to other named people"]
}

For keyPoints: think of it as the notes a careful attendee would jot down — what was discussed, what was learned, what context was shared. Include specific details (numbers, names, dates, levels) when they appear in the transcript. Don't repeat content that's already in summary, decisions, or actionItems.
For myActionItems: include anything the speaker committed to doing themselves.
For othersActionItems: include tasks explicitly assigned to other named people.
Use empty arrays when a category genuinely has nothing to capture.`;

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
