import { FileManager } from '../fileManager';
import { LLMClient } from '../llmClient';
import { logActivity } from '../db';
import type { Message } from '../../shared/types';

export async function eod(
  fileManager: FileManager,
  llmClient: LLMClient,
  chatHistory: Message[],
  options?: { teamFileManager?: FileManager; userName?: string }
): Promise<string> {
  const brainPath = fileManager.getBrainPath();
  const today = formatDate(new Date());

  // Gather context
  const parts: string[] = [];

  // Today's daily log (morning brief section — just the first brief, not duplicates)
  try {
    const todayLog = await fileManager.readFile(`daily-log/${today}.md`);
    // Only include the first morning brief section to avoid confusion from repeated runs
    const briefMatch = todayLog.match(/## Morning Brief\n\n([\s\S]*?)(?=\n## Morning Brief|\n## EOD|$)/);
    if (briefMatch) {
      parts.push(`## Today's Morning Brief\n${briefMatch[1].trim()}`);
    }
  } catch {
    // no daily log
  }

  // Chat session summary (last 20 messages)
  const recentChat = chatHistory.slice(-20);
  if (recentChat.length > 0) {
    const chatSummary = recentChat
      .map((m) => `${m.role === 'user' ? 'User' : 'Keel'}: ${m.content.slice(0, 200)}`)
      .join('\n');
    parts.push(`## Today's Conversations\n${chatSummary}`);
  }

  // Open tasks for tomorrow's priorities
  try {
    const taskFiles = await fileManager.listFiles('projects/*/tasks.md');
    for (const file of taskFiles) {
      try {
        const content = await fileManager.readFile(file);
        parts.push(`## ${file}\n${content}`);
      } catch { /* skip */ }
    }
  } catch { /* no project tasks */ }

  try {
    const generalTasks = await fileManager.readFile('tasks.md');
    parts.push(`## General Tasks\n${generalTasks}`);
  } catch { /* no general tasks */ }

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
    `You are Keel, a supportive personal AI chief of staff writing a quick end-of-day wrap-up.

RULES:
- Be warm and brief. This is a friendly recap, not a performance review.
- NEVER lecture, criticize, or ask the user to "clarify" things. They know what they did today.
- ONLY reference things that actually happened in conversations or appear in task files. NEVER invent details.
- If placeholder text like "[Your Name]" appears, ignore it.
- If there wasn't much activity, just keep it short — don't pad with filler.

Write an EOD summary with these sections:
1. **Today** — 2-4 bullet points of what happened (based on conversations). Keep it factual and positive.
2. **Tomorrow** — pick 2-3 open tasks from the task files that make sense to focus on next. Just list them, no questions.

Use markdown. Keep the whole thing under 15 lines.`
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

  // Write concise team update if team brain is configured
  if (options?.teamFileManager && options?.userName) {
    try {
      const slug = options.userName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const teamUpdatePath = `updates/${slug}-${today}.md`;
      const teamContent = `# ${options.userName} — ${today}\n\n${summary}\n`;
      await options.teamFileManager.writeFile(teamUpdatePath, teamContent);
    } catch {
      // Team write failed — don't block personal EOD
    }
  }

  return summary;
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}
