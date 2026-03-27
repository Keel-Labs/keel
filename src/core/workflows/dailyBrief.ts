import { FileManager } from '../fileManager';
import { LLMClient } from '../llmClient';
import { logActivity } from '../db';

export async function dailyBrief(
  fileManager: FileManager,
  llmClient: LLMClient
): Promise<string> {
  const brainPath = fileManager.getBrainPath();
  const today = formatDate(new Date());
  const yesterday = formatDate(new Date(Date.now() - 86_400_000));

  // Gather context
  const parts: string[] = [];

  // Yesterday's daily log
  try {
    const yesterdayLog = await fileManager.readFile(`daily_log/${yesterday}.md`);
    parts.push(`## Yesterday's Log (${yesterday})\n${yesterdayLog}`);
  } catch {
    parts.push("## Yesterday's Log\nNo log found for yesterday.");
  }

  // All project task files
  try {
    const taskFiles = await fileManager.listFiles('01_projects/*/tasks.md');
    for (const file of taskFiles) {
      try {
        const content = await fileManager.readFile(file);
        parts.push(`## ${file}\n${content}`);
      } catch {
        // skip
      }
    }
  } catch {
    // no task files
  }

  // Current Priorities from keel.md
  try {
    const priorities = await fileManager.readSection('keel.md', 'Current Priorities');
    if (priorities) {
      parts.push(`## Current Priorities\n${priorities}`);
    }
  } catch {
    // no keel.md
  }

  const context = parts.join('\n\n---\n\n');

  // Generate the brief
  const brief = await llmClient.chat(
    [
      {
        role: 'user',
        content: `Here is my current context:\n\n${context}`,
        timestamp: Date.now(),
      },
    ],
    `You are Keel, a personal AI chief of staff generating a concise morning briefing.

Based on the provided context, generate a morning briefing that includes:
1. **Top Priorities for Today** — based on open tasks and current priorities
2. **Carried Forward** — anything left undone from yesterday
3. **Suggested Focus Blocks** — 3 time-boxed blocks for the day (e.g., "9-11am: Deep work on X")

Note: Calendar integration is not connected yet, so skip calendar items.

Be concise and actionable. Use markdown formatting.`
  );

  // Write to daily log
  const logPath = `daily_log/${today}.md`;
  const logContent = `## Morning Brief\n\n${brief}\n\n`;

  if (await fileManager.fileExists(logPath)) {
    // Prepend the brief to existing log
    const existing = await fileManager.readFile(logPath);
    await fileManager.writeFile(logPath, logContent + existing);
  } else {
    await fileManager.writeFile(logPath, `# Daily Log — ${today}\n\n${logContent}`);
  }

  logActivity(brainPath, 'daily-brief', `Generated for ${today}`);

  return brief;
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}
