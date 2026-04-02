import { FileManager } from './fileManager';
import { embedText } from './embeddings';
import * as vectorStore from './vectorStore';
import { logActivity, searchChunksFts, type ChunkRow } from './db';
import { rerank, type RankableChunk } from './reranker';

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
- When listing items, use bullet points (- or *), not indented paragraphs.

Commands the user can use:
- /daily-brief — Generate a morning briefing
- /capture [text or URL] — Save something to the relevant project
- /eod — End-of-day summary
- /remind [time] [message] — Set a reminder (e.g. "/remind 2:00 PM call John", "/remind in 30 minutes check the oven", "/remind tomorrow at 9am standup")
- /remind every day at 9am [message] — Set a recurring reminder (daily, weekly, monthly)
- /reminders — List upcoming reminders
- /schedule [time] [title] — Create a Google Calendar event (e.g. "/schedule tomorrow at 9am Meeting with Alex", "/schedule today at 3pm for 2 hours Design review")

IMPORTANT: When the user asks you to set a reminder, schedule something, or notify them later, tell them to use the /remind command with the correct syntax. Provide the exact command they should type. You can also suggest /reminders to view upcoming ones. Do NOT say you cannot set reminders — you CAN via the /remind command.

IMPORTANT: When the user shares a Google Docs URL, you CAN read it. The document content will be automatically fetched and included in the message. Do NOT say you cannot access external links or Google Docs — if the content appears after the URL, you have it. Read and respond to it directly.

IMPORTANT: You have access to the user's Google Calendar. When the user asks about meetings, schedule, or events, the calendar data will be automatically fetched and included in the message. Do NOT say you don't have access to their calendar — if calendar data appears in the message, use it to answer directly. Present meetings in a clear, organized format.

IMPORTANT: When the user asks you to schedule or create a meeting/event, tell them to use the /schedule command. Provide the exact command they should type. Example: /schedule tomorrow at 9am Meeting with Alex. Do NOT say you cannot create calendar events — you CAN via the /schedule command.

Here is everything you know about the user:

`;

function buildSystemPrompt(timezone?: string): string {
  const now = new Date();
  const tz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: tz });
  const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: tz });
  return SYSTEM_PROMPT_PREFIX.replace(
    'Here is everything you know about the user:',
    `Current date and time: ${dateStr}, ${timeStr} (${tz})\n\nHere is everything you know about the user:`
  );
}

export class ContextAssembler {
  private fileManager: FileManager;
  private useSemanticSearch: boolean;
  private timezone?: string;

  constructor(fileManager: FileManager, useSemanticSearch: boolean = false, timezone?: string) {
    this.fileManager = fileManager;
    this.useSemanticSearch = useSemanticSearch;
    this.timezone = timezone;
  }

  setTimezone(tz: string): void {
    this.timezone = tz || undefined;
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
    const systemPrompt = buildSystemPrompt(this.timezone);
    const sections: string[] = [];
    let totalChars = systemPrompt.length;

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
      const projectFiles = await this.fileManager.listFiles('projects/*/context.md');
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
      const dailyLogs = await this.fileManager.listFiles('daily-log/*.md');
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

    return systemPrompt + sections.join('');
  }

  private async assembleV2(userMessage: string): Promise<string> {
    const systemPrompt = buildSystemPrompt(this.timezone);
    const brainPath = this.fileManager.getBrainPath();
    const sections: string[] = [];
    let totalChars = systemPrompt.length;

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
        const content = await this.fileManager.readFile(`daily-log/${date}.md`);
        addSection(`daily-log/${date}.md`, content);
      } catch {
        // log doesn't exist
      }
    }

    // 3. Retrieve: vector search (top-20) + FTS5 keyword search (top-10), then re-rank

    // Collect candidates from both sources
    const candidateMap = new Map<string, RankableChunk>();

    // Vector search
    try {
      const queryVector = await embedText(userMessage);
      const vectorResults = await vectorStore.search(brainPath, queryVector, 20);
      for (const r of vectorResults) {
        const similarity = 1 - (r.score ?? 0); // convert distance to similarity
        if (!candidateMap.has(r.chunk.id)) {
          candidateMap.set(r.chunk.id, {
            id: r.chunk.id,
            filePath: r.chunk.filePath,
            text: r.chunk.text,
            score: Math.max(0, similarity),
            updatedAt: undefined,
          });
        }
      }
    } catch {
      // Embeddings not available
    }

    // FTS5 keyword search
    try {
      const ftsResults = searchChunksFts(brainPath, userMessage, 10);
      for (const row of ftsResults) {
        const key = `fts-${row.id}`;
        if (!candidateMap.has(key)) {
          candidateMap.set(key, {
            id: key,
            filePath: row.filePath,
            text: row.content,
            score: 0.5, // moderate base score for keyword matches
            updatedAt: row.updatedAt,
          });
        } else {
          // Boost chunks found in both vector + FTS results
          const existing = candidateMap.get(key)!;
          candidateMap.set(key, { ...existing, score: existing.score * 1.3 });
        }
      }
    } catch {
      // FTS not available
    }

    const candidates = Array.from(candidateMap.values());
    const reranked = rerank(candidates, TOP_K);

    // Group by file and add to context
    const byFile = new Map<string, string[]>();
    for (const chunk of reranked) {
      const existing = byFile.get(chunk.filePath) || [];
      existing.push(chunk.text);
      byFile.set(chunk.filePath, existing);
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
        `Query: "${userMessage.slice(0, 100)}" | Candidates: ${candidates.length} | Kept: ${reranked.length}`
      );
    } catch {
      // Don't fail if logging fails
    }

    return systemPrompt + sections.join('');
  }
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}
