import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { closeDb } from '../db/index.js';

let app: Awaited<ReturnType<typeof buildApp>>;

beforeAll(async () => {
  app = await buildApp({ logger: false });
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await closeDb();
});

describe('server integration', () => {
  it('returns health status from /api/health', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/health',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: 'ok',
    });
    expect(new Date(response.json().timestamp).toString()).not.toBe('Invalid Date');
  });

  it('rejects unauthenticated settings access', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/settings',
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: 'Missing or invalid Authorization header',
    });
  });
});
