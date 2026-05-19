// Typed HTTP client for the Keel Cloud API.
//
// Single place to:
//   - Read the configured base URL (Settings → cloudApiBase, default
//     https://api.keel.app, overridable for dev → http://localhost:8080)
//   - Attach the Authorization header from tokenStore
//   - Surface 401s as a typed error so callers can sign the user out
//
// Intentionally does not retry or refresh tokens in v1. A 401 means
// the access token has expired (Supabase default: 1 hour). The
// renderer reacts by prompting the user to sign in again. Refresh
// token support is a follow-up.

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
  const url = options.baseUrl.replace(/\/$/, '') + options.path;
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (options.auth !== false) {
    const session = tokenStore.load();
    if (!session) throw new CloudUnauthorizedError();
    headers['authorization'] = `Bearer ${session.accessToken}`;
  }

  const res = await fetch(url, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  if (res.status === 401) throw new CloudUnauthorizedError();
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new CloudError(res.status, `${res.status} ${res.statusText}: ${text.slice(0, 200)}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
