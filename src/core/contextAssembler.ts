import { FileManager } from './fileManager';
import { embedText } from './embeddings';
import * as vectorStore from './vectorStore';
import { logActivity, searchChunksFts, type ChunkRow } from './db';
import { rerank, type RankableChunk } from './reranker';
import { getPersonality } from './personalities';

const MAX_CONTEXT_CHARS_V1 = 80_000;
const MAX_CONTEXT_CHARS_V2 = 60_000;
const TOP_K = 8;

const IDENTITY = `You are Keel, the user's personal AI chief of staff. You are not a generic assistant — you are a trusted colleague who has read every document, note, and project file the user has written.`;

const BASE_RULES = `CRITICAL RULES — FOLLOW THESE STRICTLY:
- When the user tells you about themselves, their projects, or priorities: acknowledge in 1-2 sentences. Confirm what you noted. STOP. Do NOT add action items, suggestions, resource links, or next steps unless explicitly asked.
- When the user asks "what are my projects" or similar: list them concisely with only the details they gave you. No elaboration, no action items, no suggested resources.
- NEVER generate URLs, links, or resource recommendations unless the user explicitly asks for them.
- NEVER invent details, descriptions, or goals the user didn't state.
- NEVER add "Action Items", "Resource Links", "Table of Contents", or "Next Steps" sections unless asked.
- Keep responses SHORT. If you can answer in 3 lines, do not write 30.
- When listing items, use bullet points (- or *), not indented paragraphs.
- BIAS TOWARD ACTION: When the user asks you to write, draft, or create something, DO IT immediately using your best judgment. Do not ask clarifying questions unless the request is genuinely ambiguous. Make reasonable decisions and produce the work. The user can always ask you to revise.
- Do NOT ask "would you like me to..." — just do it. Do NOT ask multiple clarifying questions when one would suffice.

Commands the user can use:
- /daily-brief — Generate a morning briefing
- /capture [text or URL] — Save something to the relevant project
- /eod — End-of-day summary
- /remind [time] [message] — Set a reminder (e.g. "/remind 2:00 PM call John", "/remind in 30 minutes check the oven", "/remind tomorrow at 9am standup")
- /remind every day at 9am [message] — Set a recurring reminder (daily, weekly, monthly)
- /reminders — List upcoming reminders
- "delete the [name] reminder" or "delete this reminder" — Delete a reminder by name or the only one if there's just one
- /schedule [time] [title] — Create a Google Calendar event (e.g. "/schedule tomorrow at 9am Meeting with Alex", "/schedule today at 3pm for 2 hours Design review")
- /create-kb [project name] — Build a knowledge base from the files in a project folder (e.g. "/create-kb Social media")
- /refresh-kb [project name] — Re-ingest new or modified files into an existing project knowledge base (e.g. "/refresh-kb Social media")

IMPORTANT: When the user asks you to set a reminder, schedule something, or notify them later, tell them to use the /remind command with the correct syntax. Provide the exact command they should type. You can also suggest /reminders to view upcoming ones. Do NOT say you cannot set reminders — you CAN via the /remind command. When the user asks to delete a reminder, DO NOT ask them to use a special command — the system handles natural language deletion automatically. Just confirm it will be deleted.

IMPORTANT: When the user shares a Google Docs URL, you CAN read it. The document content will be automatically fetched and included in the message. Do NOT say you cannot access external links or Google Docs — if the content appears after the URL, you have it. Read and respond to it directly.

IMPORTANT: You have access to the user's Google Calendar. When the user asks about meetings, schedule, or events, the calendar data will be automatically fetched and included in the message. Do NOT say you don't have access to their calendar — if calendar data appears in the message, use it to answer directly. Present meetings in a clear, organized format.

IMPORTANT: When the user asks you to schedule or create a meeting/event, tell them to use the /schedule command. Provide the exact command they should type. Example: /schedule tomorrow at 9am Meeting with Alex. Do NOT say you cannot create calendar events — you CAN via the /schedule command.

IMPORTANT: When the user asks you to build, create, or set up a knowledge base for a project, you CANNOT do it yourself — but the user CAN, with one command. Tell them to type \`/create-kb [project name]\` (e.g. \`/create-kb Social media\`). Explain briefly: that command creates a wiki base under \`knowledge-bases/\` and ingests every supported file (.md, .txt, .pdf, .docx, .pptx) from the project folder into it. Once it exists, they can run \`/refresh-kb [project name]\` whenever they drop new files in to pull them in incrementally. Do NOT claim you've already created it. Do NOT make up steps about manually creating wiki pages — the slash command does the work.

IMPORTANT: You CAN export content to Google Docs. The system handles Google Doc creation and export automatically — just write the content when asked. Do NOT say you cannot create Google Docs. NEVER include Google Doc URLs, export confirmations, or references to Google Drive in your responses. NEVER say "I've already created this document" — if asked to write something, just write it fresh. The export system is invisible to you.

CONTEXT SOURCES:
- Your personal brain files contain the user's profile, projects, and daily logs.
- Files prefixed with [TEAM] come from the shared team brain. Reference them when relevant, attribute information to team members by name, and respect privacy boundaries.
- The pulse file (pulse.md) contains the user's current priorities and recent activity. Use it for immediate context about what they're working on right now.

TASK RULES:
- Tasks use checkbox format: \`- [ ]\` means open, \`- [x]\` means done.
- ONLY mark a task as done (\`[x]\`) if the user explicitly says it's complete. NEVER decide on your own that a task is done.
- When the user says a task is done, confirm it briefly (e.g., "Marked done: [task name]"). The task file will be updated automatically — do NOT tell the user to edit files manually.
- When the user asks "what are my tasks" (no project specified), show ALL tasks from every project and the general task list, grouped by project with flat checklists.
- When the user asks about tasks for a specific project, only show tasks from that project.
- Do not invent categories like "To Do", "In Progress", "Done" — just show the checkboxes.
- Capture files (projects/captures/*.md) are reference material only. Their action items have already been extracted into the appropriate task files. Do NOT list captures as a separate task section — only show tasks from tasks.md and projects/*/tasks.md files.

Here is everything you know about the user:`;

function buildSystemPrompt(personalityId: string, timezone?: string): string {
  const personality = getPersonality(personalityId);
  const now = new Date();
  const tz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: tz });
  const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: tz });

  return [
    IDENTITY,
    personality.prompt,
    BASE_RULES.replace(
      'Here is everything you know about the user:',
      `Current date and time: ${dateStr}, ${timeStr} (${tz})\n\nHere is everything you know about the user:\n`,
    ),
  ].join('\n\n');
}

export class ContextAssembler {
  private fileManager: FileManager;
  private teamFileManager: FileManager | null = null;
  private useSemanticSearch: boolean;
  private timezone?: string;
  private personality: string;

  constructor(fileManager: FileManager, useSemanticSearch: boolean = false, timezone?: string, personality: string = 'default') {
    this.fileManager = fileManager;
    this.useSemanticSearch = useSemanticSearch;
    this.timezone = timezone;
    this.personality = personality;
  }

  setTimezone(tz: string): void {
    this.timezone = tz || undefined;
  }

  setPersonality(id: string): void {
    this.personality = id;
  }

  setTeamFileManager(tfm: FileManager | null): void {
    this.teamFileManager = tfm;
  }

  enableSemanticSearch(): void {
    this.useSemanticSearch = true;
  }

  async assembleContext(userMessage?: string, onStep?: (step: string) => void): Promise<string> {
    if (this.useSemanticSearch && userMessage) {
      try {
        return await this.assembleV2(userMessage, onStep);
      } catch {
        // Fall back to v1 if semantic search fails
        return this.assembleV1(onStep);
      }
    }
    return this.assembleV1(onStep);
  }

  private async assembleV1(onStep?: (step: string) => void): Promise<string> {
    const systemPrompt = buildSystemPrompt(this.personality, this.timezone);
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
      onStep?.('Reading your profile...');
      const keelContent = await this.fileManager.readFile('keel.md');
      addSection('keel.md', keelContent);
    } catch {
      // keel.md doesn't exist yet
    }

    // 1b. Include pulse.md (current state)
    try {
      const pulseContent = await this.fileManager.readFile('pulse.md');
      addSection('pulse.md', pulseContent);
    } catch {
      // pulse.md doesn't exist yet
    }

    // 2. All project context files
    try {
      const projectFiles = await this.fileManager.listFiles('projects/*/context.md');
      if (projectFiles.length > 0) onStep?.(`Scanning ${projectFiles.length} project(s)...`);
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
      if (recent.length > 0) onStep?.('Loading recent daily logs...');
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

    // 3b. Project task files
    try {
      const taskFiles = await this.fileManager.listFiles('projects/*/tasks.md');
      if (taskFiles.length > 0) onStep?.(`Loading ${taskFiles.length} project task file(s)...`);
      for (const file of taskFiles) {
        try {
          const content = await this.fileManager.readFile(file);
          if (!addSection(file, content)) break;
        } catch {
          // skip unreadable files
        }
      }
    } catch {
      // no task files
    }

    // 3c. General tasks file
    try {
      const tasksContent = await this.fileManager.readFile('tasks.md');
      addSection('tasks.md', tasksContent);
    } catch {
      // no general tasks
    }

    // 3d. Recent captures
    try {
      const captureFiles = await this.fileManager.listFiles('projects/captures/*.md');
      if (captureFiles.length > 0) {
        onStep?.(`Loading ${captureFiles.length} capture(s)...`);
        const recentCaptures = captureFiles.sort().reverse().slice(0, 20);
        for (const file of recentCaptures) {
          try {
            const content = await this.fileManager.readFile(file);
            if (!addSection(file, content)) break;
          } catch {
            // skip unreadable files
          }
        }
      }
    } catch {
      // no captures
    }

    // 4. Team brain context (if configured)
    if (this.teamFileManager) {
      onStep?.('Checking team brain...');
      try {
        const teamContent = await this.teamFileManager.readFile('team.md');
        addSection('[TEAM] team.md', teamContent);
      } catch {
        // no team.md
      }

      // Team project context files
      try {
        const teamProjects = await this.teamFileManager.listFiles('projects/*/context.md');
        for (const file of teamProjects) {
          try {
            const content = await this.teamFileManager.readFile(file);
            if (!addSection(`[TEAM] ${file}`, content)) break;
          } catch {
            // skip
          }
        }
      } catch {
        // no team projects
      }

      // Recent team updates (last 2 days)
      try {
        const teamUpdates = await this.teamFileManager.listFiles('updates/*.md');
        const recentUpdates = teamUpdates.sort().reverse().slice(0, 10);
        for (const file of recentUpdates) {
          try {
            const content = await this.teamFileManager.readFile(file);
            if (!addSection(`[TEAM] ${file}`, content)) break;
          } catch {
            // skip
          }
        }
      } catch {
        // no team updates
      }
    }

    return systemPrompt + sections.join('');
  }

  private async assembleV2(userMessage: string, onStep?: (step: string) => void): Promise<string> {
    const systemPrompt = buildSystemPrompt(this.personality, this.timezone);
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
      onStep?.('Reading your profile...');
      const keelContent = await this.fileManager.readFile('keel.md');
      addSection('keel.md', keelContent);
    } catch {
      // keel.md doesn't exist
    }

    // 1b. Include pulse.md (current state)
    try {
      const pulseContent = await this.fileManager.readFile('pulse.md');
      addSection('pulse.md', pulseContent);
    } catch {
      // pulse.md doesn't exist yet
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

    // 2b. Always include ALL project context files (small, essential for identity)
    try {
      const projectFiles = await this.fileManager.listFiles('projects/*/context.md');
      if (projectFiles.length > 0) onStep?.(`Loading ${projectFiles.length} project(s)...`);
      for (const file of projectFiles) {
        try {
          const content = await this.fileManager.readFile(file);
          addSection(file, content);
        } catch {
          // skip unreadable files
        }
      }
    } catch {
      // no project files
    }

    // 2c. Project task files
    try {
      const taskFiles = await this.fileManager.listFiles('projects/*/tasks.md');
      if (taskFiles.length > 0) onStep?.(`Loading ${taskFiles.length} project task file(s)...`);
      for (const file of taskFiles) {
        try {
          const content = await this.fileManager.readFile(file);
          addSection(file, content);
        } catch {
          // skip unreadable files
        }
      }
    } catch {
      // no task files
    }

    // 2d. General tasks file
    try {
      const tasksContent = await this.fileManager.readFile('tasks.md');
      addSection('tasks.md', tasksContent);
    } catch {
      // no general tasks
    }

    // 2e. Recent captures
    try {
      const captureFiles = await this.fileManager.listFiles('projects/captures/*.md');
      if (captureFiles.length > 0) {
        onStep?.(`Loading ${captureFiles.length} capture(s)...`);
        const recentCaptures = captureFiles.sort().reverse().slice(0, 20);
        for (const file of recentCaptures) {
          try {
            const content = await this.fileManager.readFile(file);
            addSection(file, content);
          } catch {
            // skip unreadable files
          }
        }
      }
    } catch {
      // no captures
    }

    // 3. Retrieve: vector search (top-20) + FTS5 keyword search (top-10), then re-rank
    onStep?.('Searching for relevant context...');

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

    // 4. Team brain search (if configured)
    if (this.teamFileManager) {
      onStep?.('Searching team brain...');
      const teamBrainPath = this.teamFileManager.getBrainPath();

      // Team vector search
      try {
        const queryVector = await embedText(userMessage);
        const teamVectorResults = await vectorStore.search(teamBrainPath, queryVector, 10);
        for (const r of teamVectorResults) {
          const similarity = 1 - (r.score ?? 0);
          const key = `team-${r.chunk.id}`;
          if (!candidateMap.has(key)) {
            candidateMap.set(key, {
              id: key,
              filePath: `[TEAM] ${r.chunk.filePath}`,
              text: r.chunk.text,
              score: Math.max(0, similarity) * 0.8, // lower priority than personal
              updatedAt: undefined,
            });
          }
        }
      } catch {
        // Team embeddings not available
      }

      // Team FTS search
      try {
        const teamFtsResults = searchChunksFts(teamBrainPath, userMessage, 5);
        for (const row of teamFtsResults) {
          const key = `team-fts-${row.id}`;
          if (!candidateMap.has(key)) {
            candidateMap.set(key, {
              id: key,
              filePath: `[TEAM] ${row.filePath}`,
              text: row.content,
              score: 0.4, // lower than personal FTS
              updatedAt: row.updatedAt,
            });
          }
        }
      } catch {
        // Team FTS not available
      }
    }

    const candidates = Array.from(candidateMap.values());
    const reranked = rerank(candidates, TOP_K);
    if (reranked.length > 0) {
      onStep?.(`Found ${reranked.length} relevant section(s)`);
    }

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
