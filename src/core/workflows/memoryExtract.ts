import { FileManager } from '../fileManager';
import { LLMClient } from '../llmClient';
import { logActivity } from '../db';
import type { Message } from '../../shared/types';

const EXTRACT_PROMPT = `You are a memory extraction system. Analyze the conversation and determine if the user shared any important personal or professional information that should be remembered.

Extract ONLY new factual information that was explicitly stated by the user (not asked as a question). Categories:
- Profile info: name, role, company, team
- Projects: project names, descriptions, status, deadlines
- People: names, roles, relationships
- Priorities: goals, current focus areas
- Preferences: communication style, tools, conventions

If there IS new info to remember, respond with a JSON object:
{
  "hasUpdates": true,
  "profile": { "name": "...", "role": "..." },
  "projects": [{ "name": "...", "status": "...", "summary": "...", "deadline": "..." }],
  "people": [{ "name": "...", "role": "...", "notes": "..." }],
  "priorities": ["..."],
  "conventions": ["..."]
}

Only include fields that have new information. Omit empty fields.

If there is NO new info to remember (general questions, casual chat, commands), respond with:
{"hasUpdates": false}

Respond ONLY with valid JSON, nothing else.`;

interface MemoryUpdate {
  hasUpdates: boolean;
  profile?: { name?: string; role?: string };
  projects?: Array<{ name: string; status?: string; summary?: string; deadline?: string }>;
  people?: Array<{ name: string; role?: string; notes?: string }>;
  priorities?: string[];
  conventions?: string[];
}

export async function extractAndSaveMemory(
  recentMessages: Message[],
  fileManager: FileManager,
  llmClient: LLMClient
): Promise<void> {
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

    const update: MemoryUpdate = JSON.parse(response.trim());
    if (!update.hasUpdates) return;

    // Read current keel.md
    let keelContent: string;
    try {
      keelContent = await fileManager.readFile('keel.md');
    } catch {
      return; // Can't update if keel.md doesn't exist
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
        } else {
          // Add new row after the table header
          keelContent = keelContent.replace(
            /(# Active Projects\n\|.*\|\n\|[-| ]+\|)/,
            `$1\n${tableRow}`
          );
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
    }
  } catch {
    // Memory extraction is best-effort — never fail the chat
  }
}
