import { FileManager } from '../fileManager';
import { LLMClient } from '../llmClient';
import { capture } from './capture';
import type { Message } from '../../shared/types';
import type { GoogleOAuthConfig } from '../connectors/googleAuth';

export interface AutoCaptureResult {
  captured: boolean;
  summary?: string;
}

const MIN_CAPTURE_LENGTH = 100;
const QUESTION_STARTERS = [
  'who', 'what', 'when', 'where', 'why', 'how', 'which',
  'is', 'are', 'was', 'were', 'do', 'does', 'did',
  'can', 'could', 'should', 'would', 'will',
];

const capturedUserMessageTimestamps = new Set<number>();

export function _resetAutoCaptureStateForTests(): void {
  capturedUserMessageTimestamps.clear();
}

function isLikelyQuestion(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  // Single-sentence message ending in '?' is almost certainly a question.
  const isOneSentence = !/[.!?]\s+\S/.test(trimmed);
  if (isOneSentence && trimmed.endsWith('?')) return true;
  if (isOneSentence) {
    const firstWord = trimmed.split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, '');
    if (firstWord && QUESTION_STARTERS.includes(firstWord)) return true;
  }
  return false;
}

/**
 * Looks at only the latest user message and decides whether it contains
 * substantial new context worth auto-capturing. Earlier messages are not
 * re-considered — they were evaluated on their own turn — which prevents
 * trivial follow-ups from inheriting "substantial" status from a prior
 * message and being routed to whatever project that prior content matched.
 */
export async function autoCapture(
  messages: Message[],
  fileManager: FileManager,
  llmClient: LLMClient,
  googleConfig?: GoogleOAuthConfig,
): Promise<AutoCaptureResult> {
  const userMessages = messages.filter((m) => m.role === 'user');
  if (userMessages.length === 0) return { captured: false };

  const latest = userMessages[userMessages.length - 1];
  const content = latest.content ?? '';

  // De-dup: never re-capture the same user message.
  if (capturedUserMessageTimestamps.has(latest.timestamp)) {
    return { captured: false };
  }

  if (content.length < MIN_CAPTURE_LENGTH) return { captured: false };
  if (content.trimStart().startsWith('/')) return { captured: false };
  if (isLikelyQuestion(content)) return { captured: false };

  let classification: string;
  try {
    classification = await llmClient.chat(
      [
        {
          role: 'user',
          content: `Decide whether the following SINGLE user message contains substantial NEW information the user is providing — for example: a project description, organizational context, meeting notes, goals, team information, strategic decisions, or action items the user is recording.

Do NOT capture:
- Questions the user is asking the assistant ("where is California", "what is X", "how do I Y", anything seeking information rather than providing it).
- Casual conversation, greetings, or acknowledgements.
- Requests directed at the assistant for it to do something now ("summarize this", "write me X") without supplying meaningful context.

User message:
${content.slice(0, 3000)}

Respond with ONLY valid JSON:
{"shouldCapture": true/false, "reason": "brief explanation"}`,
          timestamp: Date.now(),
        },
      ],
      'You classify whether a single user message contains substantial NEW context the user is sharing (not asking about). Respond only with JSON.',
    );
  } catch {
    return { captured: false };
  }

  let shouldCapture = false;
  try {
    const parsed = JSON.parse(classification.trim());
    shouldCapture = parsed.shouldCapture === true;
  } catch {
    return { captured: false };
  }

  if (!shouldCapture) return { captured: false };

  try {
    const result = await capture(content, fileManager, llmClient, googleConfig);
    capturedUserMessageTimestamps.add(latest.timestamp);
    return { captured: true, summary: result };
  } catch (err) {
    console.error('[autoCapture] Capture failed:', err);
    return { captured: false };
  }
}
