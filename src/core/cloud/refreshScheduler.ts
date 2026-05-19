// Silent access-token refresh scheduler.
//
// Sessions last ~1 hour by default (Supabase) — that's a bad UX if
// every drain tick risks a 401 and a "please sign in again" toast.
// Refresh tokens are good for ~30 days; we use them to roll the
// access token in the background a few minutes before it expires.
//
// Lifecycle:
//   - start() is called at app boot (if there's a session) and again
//     after every successful sign-in.
//   - It schedules a single timer for (expiresAt - safety window).
//     The timer refreshes, persists, and schedules itself again.
//   - stop() cancels the pending timer. Called on sign-out and on
//     app quit so no orphaned timers fire during shutdown.
//
// We intentionally do NOT log the refresh token or any token bytes —
// the encrypted blob in tokenStore stays the only on-disk copy.

import * as tokenStore from './tokenStore';
import { refreshAccessToken } from './cloudAuth';

// Refresh 5 minutes before the access token expires. tokenStore
// already subtracts a 60s safety margin from the server's expires_at,
// so the effective lead time is ~6 minutes.
const REFRESH_LEAD_MS = 5 * 60 * 1000;

// If a refresh fails transiently (network blip), retry in 30s rather
// than waiting until next expiry.
const REFRESH_RETRY_MS = 30 * 1000;

// If expiresAt is already in the past (e.g. app was asleep), fire
// the refresh on a short delay so we don't recurse synchronously.
const IMMEDIATE_REFRESH_MS = 1000;

interface SchedulerOptions {
  /** How to read the current base URL each time we refresh — honors live changes in Settings → API endpoint override. */
  getBaseUrl: () => string;
  /** Called when refresh permanently fails (401). Caller should clear cloudEnabled and notify the renderer. */
  onUnauthorized?: () => void;
}

let timer: NodeJS.Timeout | null = null;
let options: SchedulerOptions | null = null;

export function start(opts: SchedulerOptions): void {
  options = opts;
  scheduleNext();
}

export function stop(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  options = null;
}

/** Force the scheduler to recompute its next fire time — call after sign-in. */
export function reschedule(): void {
  if (!options) return;
  if (timer) clearTimeout(timer);
  scheduleNext();
}

function scheduleNext(): void {
  if (!options) return;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }

  const session = tokenStore.load();
  if (!session) return;

  const now = Date.now();
  const fireAt = session.expiresAt - REFRESH_LEAD_MS;
  const delay = Math.max(fireAt - now, IMMEDIATE_REFRESH_MS);

  timer = setTimeout(() => { void doRefresh(); }, delay);
}

async function doRefresh(): Promise<void> {
  if (!options) return;
  const session = tokenStore.load();
  if (!session) return;

  try {
    await refreshAccessToken(options.getBaseUrl(), session.refreshToken);
    // Successful refresh persisted a new session; schedule the next.
    scheduleNext();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // refreshAccessToken already cleared the session on 401. Detect
    // that case by re-reading the store: if the session is gone, it
    // was a permanent failure.
    if (!tokenStore.load()) {
      options.onUnauthorized?.();
      stop();
      return;
    }
    // Transient — retry shortly without leaking the message in detail.
    void message; // intentional swallow; surface via logger at the call site if desired
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { void doRefresh(); }, REFRESH_RETRY_MS);
  }
}
