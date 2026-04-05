import { readBrainFile, writeBrainFile, appendToBrainFile } from './brain.js';
import type { LLMClient } from './llm.js';

const EXTRACT_PROMPT = `You are a memory extraction system. Analyze the conversation and extract ONLY facts the user explicitly stated.

CRITICAL RULES:
- NEVER invent, assume, or infer details the user did not say.
- Only extract from the USER's messages, never from the assistant's responses.
- Leave fields as empty strings if the user did not provide that information.

Categories to extract:
- Profile: name, role, company
- Projects: names (and only details the user explicitly provided)
- People: names and roles (only if stated)
- Priorities: only if explicitly listed
- Tasks/To-Dos: specific action items, things the user needs to do, wants to work on, or is tracking. Include which project they belong to if mentioned.

If there IS new info, respond with JSON:
{
  "hasUpdates": true,
  "profile": { "name": "...", "role": "..." },
  "projects": [{ "name": "...", "status": "", "summary": "", "deadline": "" }],
  "people": [{ "name": "...", "role": "", "notes": "" }],
  "priorities": ["..."],
  "tasks": [{ "task": "...", "project": "..." }]
}

For tasks: "task" is the to-do description, "project" is the project name it belongs to (empty string if not associated with a project).

Only include fields with new info. Use empty strings for unknown fields — NEVER guess.

If there is NO new info (questions, casual chat, commands), respond:
{"hasUpdates": false}

Respond ONLY with valid JSON.`;

const KEEL_MD_TEMPLATE = `# Profile
Name: [Your Name]
Role: [Your Role]

# Active Projects
| Project | Status | Deadline | Summary |
|---|---|---|---|

# Current Priorities
1.

# Key People
| Name | Role | Notes |
|---|---|---|

# Conventions
-
`;

interface MemoryUpdate {
  hasUpdates: boolean;
  profile?: { name?: string; role?: string };
  projects?: Array<{ name: string; status?: string; summary?: string; deadline?: string }>;
  people?: Array<{ name: string; role?: string; notes?: string }>;
  priorities?: string[];
  tasks?: Array<{ task: string; project?: string }>;
}

export async function extractAndSaveMemory(
  userId: number,
  recentMessages: any[],
  llmClient: LLMClient
): Promise<void> {
  const lastUserMessages = recentMessages.filter((m: any) => m.role === 'user').slice(-3);
  if (lastUserMessages.length === 0) return;

  const lastMsg = lastUserMessages[lastUserMessages.length - 1].content;
  if (lastMsg.startsWith('/') || lastMsg.length < 10) return;

  try {
    const conversationSlice = recentMessages.slice(-6).map((m: any) => ({
      role: m.role,
      content: m.content,
    }));

    const response = await llmClient.chat(
      [{ role: 'user', content: JSON.stringify(conversationSlice), timestamp: Date.now() }],
      EXTRACT_PROMPT
    );

    const update: MemoryUpdate = JSON.parse(response.trim());
    if (!update.hasUpdates) return;

    // Read or create keel.md
    let keelContent: string;
    try {
      keelContent = await readBrainFile(userId, 'keel.md');
    } catch {
      await writeBrainFile(userId, 'keel.md', KEEL_MD_TEMPLATE);
      keelContent = KEEL_MD_TEMPLATE;
      console.log(`[memory-extract] Created keel.md for user ${userId}`);
    }

    let modified = false;

    // Update profile
    if (update.profile) {
      if (update.profile.name) {
        keelContent = keelContent.replace(/Name: \[Your Name\]|Name: .*/, `Name: ${update.profile.name}`);
        modified = true;
      }
      if (update.profile.role) {
        keelContent = keelContent.replace(/Role: \[Your Role\]|Role: .*/, `Role: ${update.profile.role}`);
        modified = true;
      }
    }

    // Update projects
    if (update.projects && update.projects.length > 0) {
      for (const project of update.projects) {
        const tableRow = `| ${project.name} | ${project.status || 'Active'} | ${project.deadline || ''} | ${project.summary || ''} |`;
        if (keelContent.includes(`| ${project.name} |`)) {
          const rowRegex = new RegExp(`\\| ${project.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\|.*\\|`, 'g');
          keelContent = keelContent.replace(rowRegex, tableRow);
        } else {
          const tableHeaderRegex = /(#+ Active Projects\n\|[^\n]+\|\n\|[-| ]+\|)/;
          if (tableHeaderRegex.test(keelContent)) {
            keelContent = keelContent.replace(tableHeaderRegex, `$1\n${tableRow}`);
          }
        }
        modified = true;
        console.log(`[memory-extract] ${keelContent.includes(project.name) ? 'Updated' : 'Added'} project: ${project.name}`);
      }
    }

    // Update people
    if (update.people && update.people.length > 0) {
      for (const person of update.people) {
        const tableRow = `| ${person.name} | ${person.role || ''} | ${person.notes || ''} |`;
        if (keelContent.includes(`| ${person.name} |`)) {
          const rowRegex = new RegExp(`\\| ${person.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\|.*\\|`, 'g');
          keelContent = keelContent.replace(rowRegex, tableRow);
        } else {
          keelContent = keelContent.replace(
            /(#+ Key People\n\|[^\n]+\|\n\|[-| ]+\|)/,
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
      await writeBrainFile(userId, 'keel.md', keelContent);
      console.log(`[memory-extract] Updated keel.md for user ${userId}`);
    }

    // Save tasks to project context/tasks files
    if (update.tasks && update.tasks.length > 0) {
      // Group tasks by project
      const tasksByProject = new Map<string, string[]>();
      for (const t of update.tasks) {
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
          try {
            await readBrainFile(userId, contextPath);
          } catch {
            await writeBrainFile(userId, contextPath, `# ${projectName}\n\nProject context and notes.\n`);
            console.log(`[memory-extract] Created project context: ${contextPath}`);
          }

          // Append tasks to project tasks file
          const newTasks = tasks.map(t => `- [ ] ${t}`).join('\n');
          try {
            const existing = await readBrainFile(userId, tasksPath);
            // Avoid duplicating tasks already in the file
            const tasksToAdd = tasks.filter(t => !existing.includes(t));
            if (tasksToAdd.length > 0) {
              const newContent = tasksToAdd.map(t => `- [ ] ${t}`).join('\n');
              await writeBrainFile(userId, tasksPath, existing.trimEnd() + '\n' + newContent + '\n');
              console.log(`[memory-extract] Added ${tasksToAdd.length} task(s) to ${tasksPath}`);
            }
          } catch {
            await writeBrainFile(userId, tasksPath, `# ${projectName} — Tasks\n\n${newTasks}\n`);
            console.log(`[memory-extract] Created ${tasksPath} with ${tasks.length} task(s)`);
          }
        } else {
          // Tasks without a project go to a general tasks file
          const tasksPath = 'tasks.md';
          const newTasks = tasks.map(t => `- [ ] ${t}`).join('\n');
          try {
            const existing = await readBrainFile(userId, tasksPath);
            const tasksToAdd = tasks.filter(t => !existing.includes(t));
            if (tasksToAdd.length > 0) {
              const newContent = tasksToAdd.map(t => `- [ ] ${t}`).join('\n');
              await writeBrainFile(userId, tasksPath, existing.trimEnd() + '\n' + newContent + '\n');
            }
          } catch {
            await writeBrainFile(userId, tasksPath, `# Tasks\n\n${newTasks}\n`);
          }
        }
      }
    }
  } catch (err) {
    console.error(`[memory-extract] Failed for user ${userId}:`, err);
  }
}
