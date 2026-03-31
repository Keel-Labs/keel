import { FileManager } from '../fileManager';
import { LLMClient } from '../llmClient';
import { logActivity } from '../db';
import type { Message } from '../../shared/types';

export async function eod(
  fileManager: FileManager,
  llmClient: LLMClient,
  chatHistory: Message[]
): Promise<string> {
  const brainPath = fileManager.getBrainPath();
  const today = formatDate(new Date());

  // Gather context
  const parts: string[] = [];

  // Today's daily log (morning brief section)
  try {
    const todayLog = await fileManager.readFile(`daily-log/${today}.md`);
    parts.push(`## Today's Morning Brief\n${todayLog}`);
  } catch {
    parts.push("## Today's Morning Brief\nNo morning brief found for today.");
  }

  // Chat session summary (last 20 messages)
  const recentChat = chatHistory.slice(-20);
  if (recentChat.length > 0) {
    const chatSummary = recentChat
      .map((m) => `${m.role === 'user' ? 'User' : 'Keel'}: ${m.content.slice(0, 200)}`)
      .join('\n');
    parts.push(`## Today's Conversations\n${chatSummary}`);
  }

  const context = parts.join('\n\n---\n\n');

  // Generate EOD summary
  const summary = await llmClient.chat(
    [
      {
        role: 'user',
        content: `Here is my context for today:\n\n${context}`,
        timestamp: Date.now(),
      },
    ],
    `You are Keel, a personal AI chief of staff writing an end-of-day summary.

CRITICAL: Only reference things that actually happened in the conversations or were explicitly listed in the morning brief. NEVER invent accomplishments, tasks, or priorities. If placeholder text like "[Your Name]" or "X, Y, Z (please specify)" appears, ignore it — it's not real data. If there's not enough real content, say so honestly.

Based on the morning brief and today's conversations, write an EOD summary that includes:
1. **Accomplished** — what was actually done today (based on conversations)
2. **Left Undone** — anything explicitly mentioned but not finished
3. **Tomorrow's Priorities** — suggested based on real context only

Be concise and actionable. Use markdown formatting.`
  );

  // Append to daily log
  const logPath = `daily-log/${today}.md`;
  const eodContent = `\n\n## EOD Summary\n\n${summary}\n`;

  if (await fileManager.fileExists(logPath)) {
    await fileManager.appendToFile(logPath, eodContent);
  } else {
    await fileManager.writeFile(
      logPath,
      `# Daily Log — ${today}\n${eodContent}`
    );
  }

  logActivity(brainPath, 'eod', `Generated for ${today}`);

  return summary;
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}
