import { LLMClient } from '../llmClient';
import type { Message } from '../../shared/types';

export interface MeetingSynthesis {
  title: string;
  summary: string;
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
  "summary": "A 2-3 sentence summary of what was discussed",
  "decisions": ["Key decision made", "Another decision (may be empty array)"],
  "myActionItems": ["action items assigned to the person speaking/recording (the 'Speaker', 'I', 'me', or 'you' — first-person perspective)"],
  "othersActionItems": ["Name: action item — tasks assigned to other named people"]
}

If no clear decisions or action items exist, use empty arrays.
For myActionItems: include anything the speaker committed to doing themselves.
For othersActionItems: include tasks explicitly assigned to other named people.`;

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
