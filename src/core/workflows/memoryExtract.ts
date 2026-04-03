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

If there IS new info, respond with JSON:
{
  "hasUpdates": true,
  "profile": { "name": "...", "role": "..." },
  "projects": [{ "name": "...", "status": "", "summary": "", "deadline": "" }],
  "people": [{ "name": "...", "role": "", "notes": "" }],
  "priorities": ["..."]
}

Only include fields with new info. Use empty strings for unknown fields — NEVER guess.

If there is NO new info (questions, casual chat, commands), respond:
{"hasUpdates": false}

Respond ONLY with valid JSON.`;

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
  } catch (err) {
    // Memory extraction is best-effort — never fail the chat
    console.error('[memory-extract] Failed:', err);
  }
}
