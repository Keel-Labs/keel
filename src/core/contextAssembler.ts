import { FileManager } from './fileManager';
import { embedText } from './embeddings';
import * as vectorStore from './vectorStore';
import { logActivity } from './db';

const MAX_CONTEXT_CHARS_V1 = 80_000;
const MAX_CONTEXT_CHARS_V2 = 60_000;
const TOP_K = 8;

const SYSTEM_PROMPT_PREFIX = `You are Keel, the user's personal AI chief of staff. You are not a generic assistant — you are a trusted colleague who has read every document, note, and project file the user has written.

Your personality:
- Warm but efficient. Like a great executive assistant who anticipates needs.
- Speak directly. No filler phrases like "Great question!" or "I'd be happy to help."
- When you know something from the user's files, state it confidently and cite the source.
- When you don't have enough context, say so honestly rather than guessing.
- Use the user's name if you know it from their profile.
- Format responses with markdown when helpful (headers, lists, tables, code blocks).

CRITICAL RULES — FOLLOW THESE STRICTLY:
- When the user tells you about themselves, their projects, or priorities: acknowledge in 1-2 sentences. Confirm what you noted. STOP. Do NOT add action items, suggestions, resource links, or next steps unless explicitly asked.
- When the user asks "what are my projects" or similar: list them concisely with only the details they gave you. No elaboration, no action items, no suggested resources.
- NEVER generate URLs, links, or resource recommendations unless the user explicitly asks for them.
- NEVER invent details, descriptions, or goals the user didn't state.
- NEVER add "Action Items", "Resource Links", "Table of Contents", or "Next Steps" sections unless asked.
- Keep responses SHORT. If you can answer in 3 lines, do not write 30.

Commands the user can use:
- /daily-brief — Generate a morning briefing
- /capture [text or URL] — Save something to the inbox
- /eod — End-of-day summary

Here is everything you know about the user:

`;

export class ContextAssembler {
  private fileManager: FileManager;
  private useSemanticSearch: boolean;

  constructor(fileManager: FileManager, useSemanticSearch: boolean = false) {
    this.fileManager = fileManager;
    this.useSemanticSearch = useSemanticSearch;
  }

  enableSemanticSearch(): void {
    this.useSemanticSearch = true;
  }

  async assembleContext(userMessage?: string): Promise<string> {
    if (this.useSemanticSearch && userMessage) {
      try {
        return await this.assembleV2(userMessage);
      } catch {
        // Fall back to v1 if semantic search fails
        return this.assembleV1();
      }
    }
    return this.assembleV1();
  }

  private async assembleV1(): Promise<string> {
    const sections: string[] = [];
    let totalChars = SYSTEM_PROMPT_PREFIX.length;

    const addSection = (filename: string, content: string): boolean => {
      const section = `\n\n--- ${filename} ---\n\n${content}`;
      if (totalChars + section.length <= MAX_CONTEXT_CHARS_V1) {
        sections.push(section);
        totalChars += section.length;
        return true;
      }
      return false;
    };

    // 1. Always include keel.md
    try {
      const keelContent = await this.fileManager.readFile('keel.md');
      addSection('keel.md', keelContent);
    } catch {
      // keel.md doesn't exist yet
    }

    // 2. All project context files
    try {
      const projectFiles = await this.fileManager.listFiles('01_projects/*/context.md');
      for (const file of projectFiles) {
        try {
          const content = await this.fileManager.readFile(file);
          if (!addSection(file, content)) break;
        } catch {
          // skip unreadable files
        }
      }
    } catch {
      // no project files
    }

    // 3. Last 2 daily logs
    try {
      const dailyLogs = await this.fileManager.listFiles('daily_log/*.md');
      const recent = dailyLogs.sort().reverse().slice(0, 2);
      for (const file of recent) {
        try {
          const content = await this.fileManager.readFile(file);
          if (!addSection(file, content)) break;
        } catch {
          // skip unreadable files
        }
      }
    } catch {
      // no daily logs
    }

    return SYSTEM_PROMPT_PREFIX + sections.join('');
  }

  private async assembleV2(userMessage: string): Promise<string> {
    const brainPath = this.fileManager.getBrainPath();
    const sections: string[] = [];
    let totalChars = SYSTEM_PROMPT_PREFIX.length;

    const addSection = (filename: string, content: string): boolean => {
      const section = `\n\n--- ${filename} ---\n\n${content}`;
      if (totalChars + section.length <= MAX_CONTEXT_CHARS_V2) {
        sections.push(section);
        totalChars += section.length;
        return true;
      }
      return false;
    };

    // 1. Always include keel.md
    try {
      const keelContent = await this.fileManager.readFile('keel.md');
      addSection('keel.md', keelContent);
    } catch {
      // keel.md doesn't exist
    }

    // 2. Today's and yesterday's daily logs
    const today = formatDate(new Date());
    const yesterday = formatDate(new Date(Date.now() - 86_400_000));

    for (const date of [today, yesterday]) {
      try {
        const content = await this.fileManager.readFile(`daily_log/${date}.md`);
        addSection(`daily_log/${date}.md`, content);
      } catch {
        // log doesn't exist
      }
    }

    // 3. Semantic search for relevant chunks
    const queryVector = await embedText(userMessage);
    const results = await vectorStore.search(brainPath, queryVector, TOP_K);

    // Group chunks by file for cleaner display
    const byFile = new Map<string, string[]>();
    for (const result of results) {
      const existing = byFile.get(result.chunk.filePath) || [];
      existing.push(result.chunk.text);
      byFile.set(result.chunk.filePath, existing);
    }

    for (const [filePath, texts] of byFile) {
      const combined = texts.join('\n\n');
      if (!addSection(filePath, combined)) break;
    }

    // Log the assembly
    try {
      logActivity(
        brainPath,
        'context-assembly',
        `Query: "${userMessage.slice(0, 100)}" | Chunks: ${results.length} | Files: ${byFile.size}`
      );
    } catch {
      // Don't fail if logging fails
    }

    return SYSTEM_PROMPT_PREFIX + sections.join('');
  }
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}
