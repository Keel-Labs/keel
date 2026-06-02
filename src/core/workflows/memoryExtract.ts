import { FileManager, KEEL_MD_TEMPLATE } from '../fileManager';
import { LLMClient } from '../llmClient';
import { logActivity } from '../db';
import type { Message } from '../../shared/types';

const EXTRACT_PROMPT = `You are a memory extraction system. Analyze the conversation and extract ONLY facts the user explicitly stated.

CRITICAL RULES:
- NEVER invent, assume, or infer details the user did not say.
- If the user says "my projects are: music, sports" — save the names ONLY. Do NOT make up descriptions, deadlines, or statuses.
- Leave fields as empty strings if the user did not provide that information.
- Only extract from the USER's messages, never from the assistant's responses.

Categories to extract:
- Profile: name, role, company
- Projects: names (and only details the user explicitly provided)
- People: names and roles (only if stated)
- Priorities: only if explicitly listed
- Completed Tasks: tasks the user explicitly says are done, finished, or completed. Match by the task description.

Do NOT extract new to-dos / action items here — creating tasks is handled separately by the create_task tool during the conversation. Only capture COMPLETED tasks (so they can be checked off).

If there IS new info, respond with JSON:
{
  "hasUpdates": true,
  "profile": { "name": "...", "role": "..." },
  "projects": [{ "name": "...", "status": "", "summary": "", "deadline": "" }],
  "people": [{ "name": "...", "role": "", "notes": "" }],
  "priorities": ["..."],
  "completedTasks": ["task description that was marked done"]
}

For completedTasks: list the task descriptions the user said are done. Use the exact or closest matching description.

Only include fields with new info. Use empty strings for unknown fields — NEVER guess.

If there is NO new info (questions, casual chat, commands), respond:
{"hasUpdates": false}

Respond ONLY with valid JSON.`;

export interface MemoryExtractResult {
  updated: boolean;
  summary: string;
}

function sanitizeJsonResponse(raw: string): string {
  let text = raw.trim();
  // Strip markdown code fences
  text = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '');
  text = text.trim();
  // Extract first JSON object if surrounded by text
  const match = text.match(/\{[\s\S]*\}/);
  return match ? match[0] : text;
}

function flattenTaskSections(content: string): string {
  if (!content.includes('## To Do') && !content.includes('## In Progress')) {
    return content;
  }
  const lines = content.split('\n');
  const tasks: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('- [ ]') || trimmed.startsWith('- [x]')) {
      const text = trimmed.replace(/^- \[.\]\s*/, '');
      if (text) tasks.push(trimmed);
    }
  }
  return `# Tasks\n\n${tasks.join('\n')}\n`;
}

interface MemoryUpdate {
  hasUpdates: boolean;
  profile?: { name?: string; role?: string };
  projects?: Array<{ name: string; status?: string; summary?: string; deadline?: string }>;
  people?: Array<{ name: string; role?: string; notes?: string }>;
  priorities?: string[];
  conventions?: string[];
  completedTasks?: string[];
}

export async function extractAndSaveMemory(
  recentMessages: Message[],
  fileManager: FileManager,
  llmClient: LLMClient
): Promise<MemoryExtractResult | undefined> {
  // Only process if there are recent user messages with substance
  const lastUserMessages = recentMessages
    .filter((m) => m.role === 'user')
    .slice(-3);

  if (lastUserMessages.length === 0) return;

  // Skip if last messages are just commands
  const lastMsg = lastUserMessages[lastUserMessages.length - 1].content;
  if (lastMsg.startsWith('/') || lastMsg.length < 10) return;

  try {
    const conversationSlice = recentMessages.slice(-6).map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    const response = await llmClient.chat(
      [{ role: 'user', content: JSON.stringify(conversationSlice), timestamp: Date.now() }],
      EXTRACT_PROMPT
    );

    console.log('[memory-extract] Raw LLM response:', response.slice(0, 500));

    let update: MemoryUpdate;
    try {
      update = JSON.parse(sanitizeJsonResponse(response));
    } catch (parseErr) {
      console.error('[memory-extract] JSON parse failed. Raw response:', response.slice(0, 300));
      return;
    }
    if (!update.hasUpdates) return;

    // Read current keel.md (create from template if missing)
    let keelContent: string;
    try {
      keelContent = await fileManager.readFile('keel.md');
    } catch {
      // keel.md doesn't exist yet — create it from template so we can save into it
      try {
        await fileManager.writeFile('keel.md', KEEL_MD_TEMPLATE);
        keelContent = KEEL_MD_TEMPLATE;
        console.log('[memory-extract] Created keel.md from template');
      } catch (writeErr) {
        console.error('[memory-extract] Failed to create keel.md:', writeErr);
        return;
      }
    }

    let modified = false;

    // Update profile
    if (update.profile) {
      if (update.profile.name) {
        keelContent = keelContent.replace(
          /Name: \[Your Name\]|Name: .*/,
          `Name: ${update.profile.name}`
        );
        modified = true;
      }
      if (update.profile.role) {
        keelContent = keelContent.replace(
          /Role: \[Your Role\]|Role: .*/,
          `Role: ${update.profile.role}`
        );
        modified = true;
      }
    }

    // Update projects table
    if (update.projects && update.projects.length > 0) {
      for (const project of update.projects) {
        const tableRow = `| ${project.name} | ${project.status || 'Active'} | ${project.deadline || ''} | ${project.summary || ''} |`;
        // Check if project already exists in table
        if (keelContent.includes(`| ${project.name} |`)) {
          // Replace existing row
          const rowRegex = new RegExp(`\\| ${project.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\|.*\\|`, 'g');
          keelContent = keelContent.replace(rowRegex, tableRow);
          console.log(`[memory-extract] Updated project: ${project.name}`);
        } else {
          // Add new row after the table header (lenient: allow variable spacing in header)
          const tableHeaderRegex = /(#+ Active Projects\n\|[^\n]+\|\n\|[-| ]+\|)/;
          if (tableHeaderRegex.test(keelContent)) {
            keelContent = keelContent.replace(tableHeaderRegex, `$1\n${tableRow}`);
            console.log(`[memory-extract] Added project: ${project.name}`);
          } else {
            console.warn(`[memory-extract] Could not find Active Projects table to insert: ${project.name}`);
          }
        }
        modified = true;
      }
    }

    // Update people table
    if (update.people && update.people.length > 0) {
      for (const person of update.people) {
        const tableRow = `| ${person.name} | ${person.role || ''} | ${person.notes || ''} |`;
        if (keelContent.includes(`| ${person.name} |`)) {
          const rowRegex = new RegExp(`\\| ${person.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\|.*\\|`, 'g');
          keelContent = keelContent.replace(rowRegex, tableRow);
        } else {
          keelContent = keelContent.replace(
            /(# Key People\n\|.*\|\n\|[-| ]+\|)/,
            `$1\n${tableRow}`
          );
        }
        modified = true;
      }
    }

    // Update priorities
    if (update.priorities && update.priorities.length > 0) {
      const prioritySection = update.priorities.map((p, i) => `${i + 1}. ${p}`).join('\n');
      keelContent = keelContent.replace(
        /# Current Priorities\n([\s\S]*?)(?=\n# )/,
        `# Current Priorities\n${prioritySection}\n\n`
      );
      modified = true;
    }

    if (modified) {
      await fileManager.writeFile('keel.md', keelContent);
      const brainPath = fileManager.getBrainPath();
      logActivity(brainPath, 'memory-update', `Updated keel.md from chat conversation`);
      console.log('[memory-extract] Successfully updated keel.md');
    }

    // New to-dos are NOT created here — the create_task tool owns task creation
    // during the conversation. Extracting them here too produced duplicates
    // (one copy in the project's open tasks via the tool, a reworded copy in the
    // incoming-triage queue here). We only mark COMPLETED tasks below.

    // Mark completed tasks
    if (update.completedTasks && update.completedTasks.length > 0) {
      const allTaskFiles: string[] = [];
      try {
        const projectTaskFiles = await fileManager.listFiles('projects/*/tasks.md');
        allTaskFiles.push(...projectTaskFiles);
      } catch { /* no project tasks */ }
      try {
        await fileManager.readFile('tasks.md');
        allTaskFiles.push('tasks.md');
      } catch { /* no general tasks */ }

      let completedCount = 0;
      for (const completedTask of update.completedTasks) {
        const lowerCompleted = completedTask.toLowerCase().trim();
        for (const filePath of allTaskFiles) {
          try {
            const content = await fileManager.readFile(filePath);
            const lines = content.split('\n');
            let modified = false;
            for (let i = 0; i < lines.length; i++) {
              const line = lines[i];
              if (line.trim().startsWith('- [ ]')) {
                const taskText = line.trim().replace(/^- \[ \]\s*/, '').toLowerCase();
                if (taskText.includes(lowerCompleted) || lowerCompleted.includes(taskText)) {
                  lines[i] = line.replace('- [ ]', '- [x]');
                  modified = true;
                  completedCount++;
                }
              }
            }
            if (modified) {
              await fileManager.writeFile(filePath, lines.join('\n'));
              console.log(`[memory-extract] Marked task(s) done in ${filePath}`);
            }
          } catch { /* skip unreadable */ }
        }
      }
      if (completedCount > 0) {
        const brainPath = fileManager.getBrainPath();
        logActivity(brainPath, 'memory-update', `Marked ${completedCount} task(s) as done`);
      }
    }

    // Build summary of what was saved. Group by verb so we don't repeat
    // "Noted X, Noted Y" — instead: "Noted 2 projects, 1 contact".
    const noted: string[] = [];
    const updated: string[] = [];
    const completed: string[] = [];
    const plural = (n: number, singular: string, pluralForm?: string) =>
      `${n} ${n === 1 ? singular : (pluralForm ?? `${singular}s`)}`;

    if (update.profile?.name || update.profile?.role) updated.push('profile');
    if (update.priorities && update.priorities.length > 0) updated.push('priorities');
    if (update.projects && update.projects.length > 0) noted.push(plural(update.projects.length, 'project'));
    if (update.people && update.people.length > 0) noted.push(plural(update.people.length, 'contact'));
    if (update.completedTasks && update.completedTasks.length > 0) completed.push(plural(update.completedTasks.length, 'task'));

    const summaryParts: string[] = [];
    if (updated.length > 0) summaryParts.push(`Updated ${updated.join(' and ')}`);
    if (noted.length > 0) summaryParts.push(`Noted ${noted.join(', ')}`);
    if (completed.length > 0) summaryParts.push(`Completed ${completed.join(', ')}`);

    if (summaryParts.length > 0) {
      return { updated: true, summary: summaryParts.join(' · ') };
    }
  } catch (err) {
    // Memory extraction is best-effort — never fail the chat
    console.error('[memory-extract] Failed:', err);
  }
}
