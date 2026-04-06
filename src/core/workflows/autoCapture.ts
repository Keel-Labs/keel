import { FileManager } from '../fileManager';
import { LLMClient } from '../llmClient';
import { capture } from './capture';
import type { Message } from '../../shared/types';
import type { GoogleOAuthConfig } from '../connectors/googleAuth';

export interface AutoCaptureResult {
  captured: boolean;
  summary?: string;
}

/**
 * Extracts the last few user messages from a conversation and determines
 * whether they contain substantial context worth auto-capturing to the brain.
 * If so, runs the existing capture workflow and returns a summary.
 */
export async function autoCapture(
  messages: Message[],
  fileManager: FileManager,
  llmClient: LLMClient,
  googleConfig?: GoogleOAuthConfig,
): Promise<AutoCaptureResult> {
  // Collect recent user messages (last 4)
  const userMessages = messages
    .filter((m) => m.role === 'user')
    .slice(-4);

  if (userMessages.length === 0) return { captured: false };

  // Combine recent user content
  const combined = userMessages.map((m) => m.content).join('\n\n');

  // Skip short messages or slash commands
  if (combined.length < 100) return { captured: false };
  if (userMessages.every((m) => m.content.trimStart().startsWith('/'))) {
    return { captured: false };
  }

  // Lightweight classification — ask the LLM whether this is worth capturing
  let classification: string;
  try {
    classification = await llmClient.chat(
      [
        {
          role: 'user',
          content: `Analyze the following user messages from a conversation. Determine if they contain substantial context worth saving — for example, a new project description, organizational context, meeting notes, goals, team information, or strategic decisions.

Do NOT classify casual conversation, greetings, simple questions, or short requests as worth capturing.

User messages:
${combined.slice(0, 3000)}

Respond with ONLY valid JSON:
{"shouldCapture": true/false, "reason": "brief explanation"}`,
          timestamp: Date.now(),
        },
      ],
      'You classify whether user messages contain substantial context worth persisting. Respond only with JSON.',
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

  // Run the existing capture workflow on the combined user content
  try {
    const result = await capture(combined, fileManager, llmClient, googleConfig);
    return { captured: true, summary: result };
  } catch (err) {
    console.error('[autoCapture] Capture failed:', err);
    return { captured: false };
  }
}
