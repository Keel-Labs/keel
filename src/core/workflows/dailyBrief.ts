import { FileManager } from '../fileManager';
import { LLMClient } from '../llmClient';
import { logActivity } from '../db';

export async function dailyBrief(
  fileManager: FileManager,
  llmClient: LLMClient,
  options?: { teamFileManager?: FileManager }
): Promise<string> {
  const brainPath = fileManager.getBrainPath();
  const today = formatDate(new Date());
  const yesterday = formatDate(new Date(Date.now() - 86_400_000));

  // Gather context
  const parts: string[] = [];

  // Yesterday's daily log
  try {
    const yesterdayLog = await fileManager.readFile(`daily-log/${yesterday}.md`);
    parts.push(`## Yesterday's Log (${yesterday})\n${yesterdayLog}`);
  } catch {
    parts.push("## Yesterday's Log\nNo log found for yesterday.");
  }

  // All project task files
  try {
    const taskFiles = await fileManager.listFiles('projects/*/tasks.md');
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

  // General tasks
  try {
    const generalTasks = await fileManager.readFile('tasks.md');
    parts.push(`## General Tasks\n${generalTasks}`);
  } catch {
    // no general tasks
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

  // Team updates from yesterday (if team brain configured)
  if (options?.teamFileManager) {
    try {
      const teamUpdates = await options.teamFileManager.listFiles('updates/*.md');
      const yesterdayUpdates = teamUpdates.filter((f) => f.includes(yesterday));
      for (const file of yesterdayUpdates) {
        try {
          const content = await options.teamFileManager.readFile(file);
          parts.push(`## [TEAM] ${file}\n${content}`);
        } catch {
          // skip
        }
      }
    } catch {
      // no team updates
    }
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

CRITICAL RULES:
- ONLY use information that is explicitly present in the provided context.
- NEVER invent, assume, or fabricate tasks, priorities, projects, or deadlines.
- If a section says "1." with nothing after it, or contains placeholder text like "[Your Name]", "[Your Role]", "X, Y, and Z (please specify)" — treat it as EMPTY. Do not turn placeholders into real tasks.
- If there is genuinely no data to work with, say so honestly: "I don't have enough information about your tasks and priorities yet. Tell me what you're working on and I'll build better briefings."

Based on the provided context, generate a morning briefing that includes:
1. **Top Priorities for Today** — based on REAL open tasks and priorities (skip if none)
2. **Carried Forward** — anything left undone from yesterday (skip if no yesterday log)
3. **Suggested Focus Blocks** — 3 time-boxed blocks for the day (only if you have real tasks)
4. **Open Tasks Summary** — a compact count of open tasks by project (e.g., "11 open tasks: 3 Keel app, 8 General"). Do NOT list every task — just the counts.

Note: Calendar integration is not connected yet, so skip calendar items.

Be concise and actionable. Use markdown formatting.`
  );

  // Write to daily log
  const logPath = `daily-log/${today}.md`;
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
