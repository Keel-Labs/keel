// Typed HTTP client for the Keel Cloud API.
//
// Single place to:
//   - Read the configured base URL (Settings → cloudApiBase, default
//     https://api.keel.app, overridable for dev → http://localhost:8080)
//   - Attach the Authorization header from tokenStore
//   - Transparently refresh on 401 once before surfacing
//     CloudUnauthorizedError to the caller
//
// Refresh policy: on a 401 from a protected route we try a single
// refresh via refreshAccessToken and retry the original request. If
// the refresh itself fails (or the retry also returns 401), we
// surface CloudUnauthorizedError so the caller can sign the user
// out. This means callers don't need to know about refresh tokens —
// they just see "401 → sign out" or success.

import * as tokenStore from './tokenStore';

export class CloudUnauthorizedError extends Error {
  constructor() { super('Cloud API returned 401 — sign in again'); this.name = 'CloudUnauthorizedError'; }
}

export class CloudError extends Error {
  constructor(public readonly status: number, message: string) { super(message); this.name = 'CloudError'; }
}

interface RequestOptions {
  baseUrl: string;             // settings.cloudApiBase
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;                // e.g. '/captures' (leading slash)
  body?: unknown;              // JSON-serializable
  auth?: boolean;              // default true; false for /auth/* routes
}

export async function request<T>(options: RequestOptions): Promise<T> {
  // First attempt with the current access token.
  let res = await sendOnce(options);

  if (res.status === 401 && options.auth !== false) {
    // Try a single silent refresh, then retry once. Imported lazily
    // to avoid a circular import (cloudAuth imports tokenStore which
    // is imported here).
    const session = tokenStore.load();
    if (session?.refreshToken) {
      try {
        const { refreshAccessToken } = await import('./cloudAuth.js');
        await refreshAccessToken(options.baseUrl, session.refreshToken);
        res = await sendOnce(options);
      } catch {
        throw new CloudUnauthorizedError();
      }
    }
  }

  if (res.status === 401) throw new CloudUnauthorizedError();
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new CloudError(res.status, `${res.status} ${res.statusText}: ${text.slice(0, 200)}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

async function sendOnce(options: RequestOptions): Promise<Response> {
  const url = options.baseUrl.replace(/\/$/, '') + options.path;
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (options.auth !== false) {
    const session = tokenStore.load();
    if (!session) throw new CloudUnauthorizedError();
    headers['authorization'] = `Bearer ${session.accessToken}`;
  }

  return fetch(url, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
}
