import type { FastifyInstance } from 'fastify';
import { db, schema } from '../db/index.js';
import { eq, and, lte } from 'drizzle-orm';
import { requireAuth, getUser } from '../middleware/auth.js';

export async function reminderRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  // Create reminder
  app.post('/api/reminders', async (request) => {
    const { userId } = getUser(request);
    const { message, dueAt, recurring } = request.body as {
      message: string;
      dueAt: number;
      recurring?: string;
    };

    const [reminder] = await db
      .insert(schema.reminders)
      .values({ userId, message, dueAt, recurring: recurring || null })
      .returning({ id: schema.reminders.id });

    return { id: reminder.id };
  });

  // List upcoming reminders
  app.get('/api/reminders', async (request) => {
    const { userId } = getUser(request);
    const reminders = await db
      .select()
      .from(schema.reminders)
      .where(and(eq(schema.reminders.userId, userId), eq(schema.reminders.fired, false)))
      .orderBy(schema.reminders.dueAt)
      .limit(50);

    return reminders.map((r) => ({
      id: r.id,
      message: r.message,
      dueAt: Number(r.dueAt),
      recurring: r.recurring,
      fired: r.fired,
    }));
  });

  // Delete reminder
  app.delete('/api/reminders/:id', async (request) => {
    const { userId } = getUser(request);
    const { id } = request.params as { id: string };

    await db
      .delete(schema.reminders)
      .where(
        and(
          eq(schema.reminders.id, parseInt(id)),
          eq(schema.reminders.userId, userId)
        )
      );

    return { ok: true };
  });

  // Get due reminders (for polling)
  app.get('/api/reminders/due', async (request) => {
    const { userId } = getUser(request);
    const now = Date.now();

    const due = await db
      .select()
      .from(schema.reminders)
      .where(
        and(
          eq(schema.reminders.userId, userId),
          eq(schema.reminders.fired, false),
          lte(schema.reminders.dueAt, now)
        )
      )
      .orderBy(schema.reminders.dueAt);

    return due.map((r) => ({
      id: r.id,
      message: r.message,
      dueAt: Number(r.dueAt),
      recurring: r.recurring,
    }));
  });

  // Mark reminder as fired
  app.post('/api/reminders/:id/fire', async (request) => {
    const { userId } = getUser(request);
    const { id } = request.params as { id: string };

    await db
      .update(schema.reminders)
      .set({ fired: true })
      .where(
        and(
          eq(schema.reminders.id, parseInt(id)),
          eq(schema.reminders.userId, userId)
        )
      );

    return { ok: true };
  });
}
