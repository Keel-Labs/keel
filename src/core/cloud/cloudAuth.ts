// Magic-link sign-in flow (callback-based).
//
// New flow vs. the original OTP design:
//   1. The desktop POSTs /auth/magic-link with the user's email and a
//      high-entropy device_nonce. The server emails the user a link
//      containing that nonce.
//   2. The user clicks the link. The web callback finalizes the
//      session server-side, keyed to the nonce.
//   3. Meanwhile the desktop polls /auth/poll?nonce=<nonce> every 2s.
//      When the server returns ready: true with tokens, we persist
//      the session and return to the renderer.
//
// We never embed a Supabase SDK on desktop; the server proxies it.
// The same pattern is used by the iOS companion.

import * as crypto from 'crypto';
import * as tokenStore from './tokenStore';

export interface PollReadyResponse {
  ready: true;
  access_token: string;
  refresh_token: string;
  // UNIX timestamp (seconds since epoch), Supabase convention.
  expires_at?: number;
  user: { id: string; email?: string };
}

export interface PollPendingResponse {
  ready: false;
}

export type PollResponse = PollReadyResponse | PollPendingResponse;

export interface RefreshResponse {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  user_id: string;
}

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes — matches server's 15min nonce TTL with margin

function joinUrl(baseUrl: string, path: string): string {
  return baseUrl.replace(/\/$/, '') + path;
}

function expiresAtMsFromSeconds(expiresAtSec: number | undefined): number {
  // Apply a 60s safety margin so we don't try to use a token that is
  // about to expire mid-request.
  const seconds = expiresAtSec ?? Math.floor(Date.now() / 1000) + 3600;
  return seconds * 1000 - 60_000;
}

/**
 * Kicks off the magic-link sign-in flow. Generates a fresh nonce,
 * asks the server to email the user, and returns the nonce so the
 * caller can poll for completion.
 *
 * Nonce is 48 hex chars (24 random bytes) — sourced from Node's CSPRNG.
 */
export async function startSignIn(baseUrl: string, email: string): Promise<string> {
  const nonce = crypto.randomBytes(24).toString('hex');
  const res = await fetch(joinUrl(baseUrl, '/auth/magic-link'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, device_nonce: nonce }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Could not send sign-in link (${res.status}): ${text.slice(0, 200)}`);
  }
  return nonce;
}

/**
 * Polls /auth/poll until the user clicks the email link and the
 * server finalizes the session, or until the 10-minute timeout.
 *
 * Accepts an AbortSignal so the UI (or app-quit) can cancel cleanly
 * with no orphaned interval.
 */
export async function pollForSession(
  baseUrl: string,
  nonce: string,
  options?: { signal?: AbortSignal }
): Promise<{ email: string }> {
  const start = Date.now();
  const signal = options?.signal;

  while (true) {
    if (signal?.aborted) throw new DOMException('Sign-in cancelled', 'AbortError');
    if (Date.now() - start > POLL_TIMEOUT_MS) {
      throw new Error('Sign-in timed out. Send a new link and try again.');
    }

    let res: Response;
    try {
      res = await fetch(joinUrl(baseUrl, `/auth/poll?nonce=${encodeURIComponent(nonce)}`), {
        method: 'GET',
        signal,
      });
    } catch (err) {
      if ((err as { name?: string }).name === 'AbortError') throw err;
      // Transient network error — back off and try again until timeout.
      await sleep(POLL_INTERVAL_MS, signal);
      continue;
    }

    if (res.status === 404) {
      throw new Error('Sign-in link expired. Send a new one and try again.');
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Sign-in failed (${res.status}): ${text.slice(0, 200)}`);
    }

    const body = (await res.json()) as PollResponse;
    if (body.ready) {
      const email = body.user.email ?? '';
      tokenStore.save({
        accessToken: body.access_token,
        refreshToken: body.refresh_token,
        email,
        expiresAt: expiresAtMsFromSeconds(body.expires_at),
      });
      return { email };
    }

    await sleep(POLL_INTERVAL_MS, signal);
  }
}

/**
 * Exchanges a refresh token for a new access token. Persists the new
 * session and returns the new expiry (ms since epoch).
 *
 * On 401 the refresh token is dead — sign the user out and throw so
 * callers know to prompt for a fresh sign-in.
 */
export async function refreshAccessToken(baseUrl: string, refreshToken: string): Promise<number> {
  const res = await fetch(joinUrl(baseUrl, '/auth/refresh'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  if (res.status === 401) {
    signOut();
    throw new Error('Refresh token rejected — please sign in again.');
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Refresh failed (${res.status}): ${text.slice(0, 200)}`);
  }

  const body = (await res.json()) as RefreshResponse;
  const current = tokenStore.load();
  const expiresAtMs = expiresAtMsFromSeconds(body.expires_at);
  tokenStore.save({
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    // /auth/refresh doesn't return the email — preserve what we have.
    email: current?.email ?? '',
    expiresAt: expiresAtMs,
  });
  return expiresAtMs;
}

export function signOut(): void {
  tokenStore.clear();
}

export function currentEmail(): string | null {
  const session = tokenStore.load();
  return session?.email ?? null;
}

/**
 * Promise-based sleep that resolves early (rejecting with AbortError)
 * if the signal aborts mid-wait. Avoids leaving timers running after
 * cancellation.
 */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      signal?.removeEventListener('abort', onAbort);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort);
  });
}
