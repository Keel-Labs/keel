import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcrypt';
import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { signAccessToken, signRefreshToken, verifyToken } from '../middleware/auth.js';

const SALT_ROUNDS = 12;

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // Register
  app.post('/api/auth/register', async (request, reply) => {
    const { email, password, name } = request.body as {
      email: string;
      password: string;
      name?: string;
    };

    if (!email || !password) {
      return reply.code(400).send({ error: 'Email and password are required' });
    }

    if (password.length < 8) {
      return reply.code(400).send({ error: 'Password must be at least 8 characters' });
    }

    // Check if user exists
    const existing = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email.toLowerCase()))
      .limit(1);

    if (existing.length > 0) {
      return reply.code(409).send({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const [user] = await db
      .insert(schema.users)
      .values({ email: email.toLowerCase(), passwordHash, name: name || null })
      .returning({ id: schema.users.id, email: schema.users.email });

    // Create default settings
    await db.insert(schema.userSettings).values({ userId: user.id });

    // Create default brain files (keel.md template)
    await db.insert(schema.brainFiles).values({
      userId: user.id,
      path: 'keel.md',
      content: KEEL_MD_TEMPLATE,
      hash: '',
    });

    const payload = { userId: user.id, email: user.email };
    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);

    return { accessToken, refreshToken, user: { id: user.id, email: user.email, name } };
  });

  // Login
  app.post('/api/auth/login', async (request, reply) => {
    const { email, password } = request.body as { email: string; password: string };

    if (!email || !password) {
      return reply.code(400).send({ error: 'Email and password are required' });
    }

    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email.toLowerCase()))
      .limit(1);

    if (!user) {
      return reply.code(401).send({ error: 'Invalid email or password' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return reply.code(401).send({ error: 'Invalid email or password' });
    }

    const payload = { userId: user.id, email: user.email };
    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);

    return {
      accessToken,
      refreshToken,
      user: { id: user.id, email: user.email, name: user.name },
    };
  });

  // Refresh token
  app.post('/api/auth/refresh', async (request, reply) => {
    const { refreshToken } = request.body as { refreshToken: string };

    if (!refreshToken) {
      return reply.code(400).send({ error: 'Refresh token is required' });
    }

    try {
      const payload = verifyToken(refreshToken);
      const accessToken = signAccessToken({
        userId: payload.userId,
        email: payload.email,
      });
      return { accessToken };
    } catch {
      return reply.code(401).send({ error: 'Invalid or expired refresh token' });
    }
  });
}

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
