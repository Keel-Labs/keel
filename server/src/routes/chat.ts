import type { FastifyInstance } from 'fastify';
import { db, schema } from '../db/index.js';
import { eq, desc, and } from 'drizzle-orm';
import { requireAuth, getUser } from '../middleware/auth.js';
import { getLLMClient } from '../services/llm.js';
import { assembleContext } from '../services/context.js';
import { extractAndSaveMemory } from '../services/memory.js';

export async function chatRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  // Stream chat via SSE
  app.post('/api/chat/stream', async (request, reply) => {
    const { userId } = getUser(request);
    const { messages } = request.body as { messages: any[] };

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    const sendEvent = (event: string, data: any) => {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      // Load user settings
      const [settings] = await db
        .select()
        .from(schema.userSettings)
        .where(eq(schema.userSettings.userId, userId))
        .limit(1);

      if (!settings) {
        sendEvent('error', { message: 'Settings not configured' });
        reply.raw.end();
        return;
      }

      // Assemble context
      const systemPrompt = await assembleContext(userId, messages, (step) => {
        sendEvent('thinking', { step });
      });

      sendEvent('thinking', { step: 'Generating response...' });

      // Get LLM client and stream
      const llmClient = getLLMClient(settings);
      let fullResponse = '';

      await llmClient.stream(messages, systemPrompt, (chunk: string) => {
        fullResponse += chunk;
        sendEvent('chunk', { text: chunk });
      });

      sendEvent('done', { content: fullResponse });

      // Memory extraction in background
      const allMessages = [
        ...messages,
        { role: 'assistant', content: fullResponse, timestamp: Date.now() },
      ];
      extractAndSaveMemory(userId, allMessages, llmClient).catch((err) => {
        console.error('[chat] Memory extraction failed:', err);
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown error';
      sendEvent('error', { message });
    } finally {
      reply.raw.end();
    }

    // Prevent Fastify from trying to send a response
    return reply;
  });

  // Non-streaming chat
  app.post('/api/chat', async (request) => {
    const { userId } = getUser(request);
    const { messages } = request.body as { messages: any[] };

    const [settings] = await db
      .select()
      .from(schema.userSettings)
      .where(eq(schema.userSettings.userId, userId))
      .limit(1);

    if (!settings) {
      throw new Error('Settings not configured');
    }

    const systemPrompt = await assembleContext(userId, messages);
    const llmClient = getLLMClient(settings);
    const response = await llmClient.chat(messages, systemPrompt);

    // Memory extraction in background
    const allMessages = [
      ...messages,
      { role: 'assistant', content: response, timestamp: Date.now() },
    ];
    extractAndSaveMemory(userId, allMessages, llmClient).catch(() => {});

    return { content: response };
  });

  // List chat sessions
  app.get('/api/chat/sessions', async (request) => {
    const { userId } = getUser(request);
    const sessions = await db
      .select({
        id: schema.chatSessions.id,
        messages: schema.chatSessions.messages,
        updatedAt: schema.chatSessions.updatedAt,
      })
      .from(schema.chatSessions)
      .where(eq(schema.chatSessions.userId, userId))
      .orderBy(desc(schema.chatSessions.updatedAt))
      .limit(50);

    return sessions.map((s) => {
      const msgs = s.messages as any[];
      const firstUser = msgs.find((m: any) => m.role === 'user');
      return {
        id: s.id,
        title: firstUser ? firstUser.content.slice(0, 60) : 'New Chat',
        updatedAt: s.updatedAt?.getTime() || 0,
      };
    });
  });

  // Get single session
  app.get('/api/chat/sessions/:id', async (request, reply) => {
    const { userId } = getUser(request);
    const { id } = request.params as { id: string };

    const [session] = await db
      .select()
      .from(schema.chatSessions)
      .where(
        and(
          eq(schema.chatSessions.id, id),
          eq(schema.chatSessions.userId, userId)
        )
      )
      .limit(1);

    if (!session) {
      return reply.code(404).send({ error: 'Session not found' });
    }

    return { id: session.id, messages: session.messages, updatedAt: session.updatedAt?.getTime() };
  });

  // Save chat session
  app.put('/api/chat/sessions/:id', async (request) => {
    const { userId } = getUser(request);
    const { id } = request.params as { id: string };
    const { messages } = request.body as { messages: any[] };

    await db
      .insert(schema.chatSessions)
      .values({
        id,
        userId,
        messages,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: schema.chatSessions.id,
        set: { messages, updatedAt: new Date() },
      });

    return { ok: true };
  });

  // Delete session
  app.delete('/api/chat/sessions/:id', async (request) => {
    const { userId } = getUser(request);
    const { id } = request.params as { id: string };

    await db
      .delete(schema.chatSessions)
      .where(
        and(
          eq(schema.chatSessions.id, id),
          eq(schema.chatSessions.userId, userId)
        )
      );

    return { ok: true };
  });

  // Get latest session
  app.get('/api/chat/sessions/latest', async (request) => {
    const { userId } = getUser(request);
    const [session] = await db
      .select({ id: schema.chatSessions.id })
      .from(schema.chatSessions)
      .where(eq(schema.chatSessions.userId, userId))
      .orderBy(desc(schema.chatSessions.updatedAt))
      .limit(1);

    return { id: session?.id || null };
  });
}
