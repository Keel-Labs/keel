import type { FastifyInstance } from 'fastify';
import { db, schema } from '../db/index.js';
import { eq, and } from 'drizzle-orm';
import { requireAuth, getUser } from '../middleware/auth.js';
import { getLLMClient } from '../services/llm.js';
import { readBrainFile, writeBrainFile, listBrainFilesByPattern } from '../services/brain.js';

export async function workflowRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  // Daily brief
  app.post('/api/workflows/daily-brief', async (request) => {
    const { userId } = getUser(request);

    const [settings] = await db
      .select()
      .from(schema.userSettings)
      .where(eq(schema.userSettings.userId, userId))
      .limit(1);

    if (!settings) throw new Error('Settings not configured');

    const llm = getLLMClient(settings);
    const today = formatDate(new Date());
    const yesterday = formatDate(new Date(Date.now() - 86_400_000));

    const parts: string[] = [];

    // Yesterday's log
    try {
      const log = await readBrainFile(userId, `daily-log/${yesterday}.md`);
      parts.push(`## Yesterday's Log (${yesterday})\n${log}`);
    } catch {
      parts.push("## Yesterday's Log\nNo log found for yesterday.");
    }

    // Project task files
    const taskFiles = await listBrainFilesByPattern(userId, 'projects/%/tasks.md');
    for (const file of taskFiles) {
      try {
        const content = await readBrainFile(userId, file);
        parts.push(`## ${file}\n${content}`);
      } catch { /* skip */ }
    }

    // Priorities from keel.md
    try {
      const keelContent = await readBrainFile(userId, 'keel.md');
      const match = keelContent.match(/(# Current Priorities[\s\S]*?)(?=\n# )/);
      if (match) parts.push(`## Current Priorities\n${match[1]}`);
    } catch { /* no keel.md */ }

    const context = parts.join('\n\n---\n\n');

    const brief = await llm.chat(
      [{ role: 'user', content: `Here is my current context:\n\n${context}`, timestamp: Date.now() }],
      BRIEF_PROMPT
    );

    // Write to daily log
    const logPath = `daily-log/${today}.md`;
    const logContent = `## Morning Brief\n\n${brief}\n\n`;
    try {
      const existing = await readBrainFile(userId, logPath);
      await writeBrainFile(userId, logPath, logContent + existing);
    } catch {
      await writeBrainFile(userId, logPath, `# Daily Log — ${today}\n\n${logContent}`);
    }

    // Update pulse.md
    await writeBrainFile(
      userId,
      'pulse.md',
      `# Pulse\nLast updated: ${today} (morning brief)\n\n## Active Focus\n- See today's priorities in morning brief\n\n## Recent Activity\n- Daily brief generated ${today}\n`
    );

    return { content: brief };
  });

  // EOD
  app.post('/api/workflows/eod', async (request) => {
    const { userId } = getUser(request);
    const { chatHistory } = request.body as { chatHistory: any[] };

    const [settings] = await db
      .select()
      .from(schema.userSettings)
      .where(eq(schema.userSettings.userId, userId))
      .limit(1);

    if (!settings) throw new Error('Settings not configured');

    const llm = getLLMClient(settings);
    const today = formatDate(new Date());

    const parts: string[] = [];

    try {
      const todayLog = await readBrainFile(userId, `daily-log/${today}.md`);
      parts.push(`## Today's Morning Brief\n${todayLog}`);
    } catch {
      parts.push("## Today's Morning Brief\nNo morning brief found for today.");
    }

    const recentChat = (chatHistory || []).slice(-20);
    if (recentChat.length > 0) {
      const chatSummary = recentChat
        .map((m: any) => `${m.role === 'user' ? 'User' : 'Keel'}: ${m.content.slice(0, 200)}`)
        .join('\n');
      parts.push(`## Today's Conversations\n${chatSummary}`);
    }

    const context = parts.join('\n\n---\n\n');

    const summary = await llm.chat(
      [{ role: 'user', content: `Here is my context for today:\n\n${context}`, timestamp: Date.now() }],
      EOD_PROMPT
    );

    // Append to daily log
    const logPath = `daily-log/${today}.md`;
    const eodContent = `\n\n## EOD Summary\n\n${summary}\n`;
    try {
      const existing = await readBrainFile(userId, logPath);
      await writeBrainFile(userId, logPath, existing + eodContent);
    } catch {
      await writeBrainFile(userId, logPath, `# Daily Log — ${today}\n${eodContent}`);
    }

    // Update pulse.md
    await writeBrainFile(
      userId,
      'pulse.md',
      `# Pulse\nLast updated: ${today} (EOD)\n\n## Active Focus\n- See tomorrow's priorities in EOD summary\n\n## Recent Activity\n- EOD completed ${today}\n`
    );

    return { content: summary };
  });

  // Capture
  app.post('/api/workflows/capture', async (request) => {
    const { userId } = getUser(request);
    const { input } = request.body as { input: string };

    const [settings] = await db
      .select()
      .from(schema.userSettings)
      .where(eq(schema.userSettings.userId, userId))
      .limit(1);

    if (!settings) throw new Error('Settings not configured');

    const llm = getLLMClient(settings);
    const today = formatDate(new Date());
    const slug = input.slice(0, 30).toLowerCase().replace(/[^a-z0-9]+/g, '-');

    // Simple capture: summarize and store
    const summary = await llm.chat(
      [{ role: 'user', content: `Summarize this for my notes:\n\n${input}`, timestamp: Date.now() }],
      'You are a note-taking assistant. Summarize the provided input concisely in markdown. If it is a URL, say you captured the reference. Be brief.'
    );

    const capturePath = `captures/${today}-${slug}.md`;
    await writeBrainFile(userId, capturePath, `# Capture — ${today}\n\n${summary}\n\n---\nOriginal: ${input}\n`);

    return { content: `Captured: ${summary}` };
  });
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

const BRIEF_PROMPT = `You are Keel, a personal AI chief of staff generating a concise morning briefing.

CRITICAL RULES:
- ONLY use information that is explicitly present in the provided context.
- NEVER invent, assume, or fabricate tasks, priorities, projects, or deadlines.
- If there is genuinely no data to work with, say so honestly.

Based on the provided context, generate a morning briefing that includes:
1. **Top Priorities for Today** — based on REAL open tasks and priorities (skip if none)
2. **Carried Forward** — anything left undone from yesterday (skip if no yesterday log)
3. **Suggested Focus Blocks** — 3 time-boxed blocks for the day (only if you have real tasks)

Be concise and actionable. Use markdown formatting.`;

const EOD_PROMPT = `You are Keel, a personal AI chief of staff writing an end-of-day summary.

CRITICAL: Only reference things that actually happened in the conversations or were explicitly listed in the morning brief. NEVER invent accomplishments, tasks, or priorities.

Based on the morning brief and today's conversations, write an EOD summary that includes:
1. **Accomplished** — what was actually done today (based on conversations)
2. **Left Undone** — anything explicitly mentioned but not finished
3. **Tomorrow's Priorities** — suggested based on real context only

Be concise and actionable. Use markdown formatting.`;
