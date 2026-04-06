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
- Tasks/To-Dos: specific action items, things the user needs to do, wants to work on, or is tracking. Include which project they belong to if mentioned.
- Completed Tasks: tasks the user explicitly says are done, finished, or completed. Match by the task description.

If there IS new info, respond with JSON:
{
  "hasUpdates": true,
  "profile": { "name": "...", "role": "..." },
  "projects": [{ "name": "...", "status": "", "summary": "", "deadline": "" }],
  "people": [{ "name": "...", "role": "", "notes": "" }],
  "priorities": ["..."],
  "tasks": [{ "task": "...", "project": "..." }],
  "completedTasks": ["task description that was marked done"]
}

For tasks: "task" is the to-do description, "project" is the project name it belongs to (empty string if not associated with a project).
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
  tasks?: Array<{ task: string; project?: string }>;
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

    // Save tasks to project task files
    if (update.tasks && update.tasks.length > 0) {
      // Collect all existing tasks across all files to prevent duplicates
      const allExistingTasks = new Set<string>();
      try {
        const existingTaskFiles = await fileManager.listFiles('projects/*/tasks.md');
        for (const f of existingTaskFiles) {
          try {
            const c = await fileManager.readFile(f);
            for (const line of c.split('\n')) {
              const trimmed = line.trim();
              if (trimmed.startsWith('- [ ]') || trimmed.startsWith('- [x]')) {
                allExistingTasks.add(trimmed.replace(/^- \[.\]\s*/, '').toLowerCase());
              }
            }
          } catch { /* skip */ }
        }
      } catch { /* no project tasks */ }
      try {
        const generalContent = await fileManager.readFile('tasks.md');
        for (const line of generalContent.split('\n')) {
          const trimmed = line.trim();
          if (trimmed.startsWith('- [ ]') || trimmed.startsWith('- [x]')) {
            allExistingTasks.add(trimmed.replace(/^- \[.\]\s*/, '').toLowerCase());
          }
        }
      } catch { /* no general tasks */ }

      const tasksByProject = new Map<string, string[]>();
      for (const t of update.tasks) {
        // Skip if task already exists anywhere
        if (allExistingTasks.has(t.task.toLowerCase())) continue;
        const projectKey = t.project?.trim() || '';
        if (!tasksByProject.has(projectKey)) {
          tasksByProject.set(projectKey, []);
        }
        tasksByProject.get(projectKey)!.push(t.task);
      }

      for (const [projectName, tasks] of tasksByProject) {
        if (projectName) {
          const slug = projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
          const tasksPath = `projects/${slug}/tasks.md`;
          const contextPath = `projects/${slug}/context.md`;

          // Ensure project context file exists
          if (!(await fileManager.fileExists(contextPath))) {
            await fileManager.writeFile(contextPath, `# ${projectName}\n\nProject context and notes.\n`);
            console.log(`[memory-extract] Created project context: ${contextPath}`);
          }

          // Append tasks to project tasks file (flatten old format if needed)
          try {
            const raw = await fileManager.readFile(tasksPath);
            const existing = flattenTaskSections(raw);
            if (existing !== raw) {
              await fileManager.writeFile(tasksPath, existing);
              console.log(`[memory-extract] Flattened old task sections in ${tasksPath}`);
            }
            const tasksToAdd = tasks.filter(t => !existing.includes(t));
            if (tasksToAdd.length > 0) {
              const newContent = tasksToAdd.map(t => `- [ ] ${t}`).join('\n');
              await fileManager.writeFile(tasksPath, existing.trimEnd() + '\n' + newContent + '\n');
              console.log(`[memory-extract] Added ${tasksToAdd.length} task(s) to ${tasksPath}`);
            }
          } catch {
            const newTasks = tasks.map(t => `- [ ] ${t}`).join('\n');
            await fileManager.writeFile(tasksPath, `# ${projectName} — Tasks\n\n${newTasks}\n`);
            console.log(`[memory-extract] Created ${tasksPath} with ${tasks.length} task(s)`);
          }
        } else {
          // Tasks without a project go to general tasks file (flatten old format if needed)
          const tasksPath = 'tasks.md';
          const newTasks = tasks.map(t => `- [ ] ${t}`).join('\n');
          try {
            const raw = await fileManager.readFile(tasksPath);
            const existing = flattenTaskSections(raw);
            if (existing !== raw) {
              await fileManager.writeFile(tasksPath, existing);
              console.log('[memory-extract] Flattened old task sections in tasks.md');
            }
            const tasksToAdd = tasks.filter(t => !existing.includes(t));
            if (tasksToAdd.length > 0) {
              const newContent = tasksToAdd.map(t => `- [ ] ${t}`).join('\n');
              await fileManager.writeFile(tasksPath, existing.trimEnd() + '\n' + newContent + '\n');
            }
          } catch {
            await fileManager.writeFile(tasksPath, `# Tasks\n\n${newTasks}\n`);
          }
        }
      }

      const brainPath = fileManager.getBrainPath();
      logActivity(brainPath, 'memory-update', `Saved ${update.tasks.length} task(s) from conversation`);
    }

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

    // Build summary of what was saved
    const summaryParts: string[] = [];
    if (update.profile?.name || update.profile?.role) summaryParts.push('Updated profile');
    if (update.projects && update.projects.length > 0) summaryParts.push(`Noted ${update.projects.length} project(s)`);
    if (update.priorities && update.priorities.length > 0) summaryParts.push('Updated priorities');
    if (update.tasks && update.tasks.length > 0) summaryParts.push(`Saved ${update.tasks.length} task(s)`);
    if (update.people && update.people.length > 0) summaryParts.push(`Noted ${update.people.length} contact(s)`);
    if (update.completedTasks && update.completedTasks.length > 0) summaryParts.push(`Completed ${update.completedTasks.length} task(s)`);

    if (summaryParts.length > 0) {
      return { updated: true, summary: summaryParts.join(', ') };
    }
  } catch (err) {
    // Memory extraction is best-effort — never fail the chat
    console.error('[memory-extract] Failed:', err);
  }
}
