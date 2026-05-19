// Capture drain loop.
//
// Every 30 seconds while the desktop is signed in to Keel Cloud:
//   1. GET /captures?unclaimed=true
//   2. For each row: feed through the existing capture() workflow
//      (same as file-sync inbox watcher) with routeTasksToIncoming
//      so the LLM-extracted tasks land in the Inbox triage queue
//      rather than blowing past the user.
//   3. POST /captures/:id/claim — server deletes within 24h.
//
// Idempotency: the server's claim flips claimed_at; subsequent
// GETs filter it out. If we crash between route() and claim, the
// capture is processed twice on retry — accepted trade-off for v1
// (rare; alternative is a local seen-set duplicating server state).

import { FileManager } from '../fileManager';
import { LLMClient } from '../llmClient';
import { capture } from '../workflows/capture';
import * as cloudClient from './cloudClient';
import { logActivity } from '../db';
import type { GoogleOAuthConfig } from '../connectors/googleAuth';

const POLL_INTERVAL_MS = 30_000;

export interface CloudDrainDeps {
  fileManager: FileManager;
  llmClient: LLMClient;
  brainPath: string;
  googleConfig?: GoogleOAuthConfig;
  // Re-read each tick — settings can change without restart.
  getBaseUrl: () => string;
  // Lets main.ts react to an auth failure (clear session, surface to UI).
  onUnauthorized?: () => void;
  // Lets the renderer light up the same toast/badge pipeline the
  // file-sync watcher uses, so cloud + file-sync feel identical.
  onRouted?: (event: { device: string; routedTo: string }) => void;
}

interface CloudCapture {
  id: string;
  text: string;
  source: 'mobile' | 'share-sheet' | 'voice';
  device_id: string | null;
  created_at: string;
}

let interval: NodeJS.Timeout | null = null;
const inFlight = new Set<string>();

export function startCloudCaptureDrain(deps: CloudDrainDeps): void {
  if (interval) return;
  void tick(deps);
  interval = setInterval(() => void tick(deps), POLL_INTERVAL_MS);
  console.log('[cloud] capture drain loop started');
}

export function stopCloudCaptureDrain(): void {
  if (interval) { clearInterval(interval); interval = null; }
}

async function tick(deps: CloudDrainDeps): Promise<void> {
  let response: { captures: CloudCapture[] };
  try {
    response = await cloudClient.request<{ captures: CloudCapture[] }>({
      baseUrl: deps.getBaseUrl(),
      path: '/captures?unclaimed=true',
    });
  } catch (err) {
    if (err instanceof cloudClient.CloudUnauthorizedError) {
      console.error('[cloud] drain unauthorized — stopping until re-sign-in');
      stopCloudCaptureDrain();
      deps.onUnauthorized?.();
      return;
    }
    // Transient (network, 5xx) — log and try again next tick.
    console.error('[cloud] drain fetch failed:', err);
    return;
  }

  for (const row of response.captures) {
    if (inFlight.has(row.id)) continue;
    inFlight.add(row.id);
    try {
      await processOne(deps, row);
    } catch (err) {
      console.error(`[cloud] route failed for capture ${row.id}:`, err);
    } finally {
      inFlight.delete(row.id);
    }
  }
}

async function processOne(deps: CloudDrainDeps, row: CloudCapture): Promise<void> {
  const deviceLabel = row.device_id ? `device ${row.device_id.slice(0, 6)}` : 'mobile';
  const result = await capture(row.text, deps.fileManager, deps.llmClient, deps.googleConfig, {
    routeTasksToIncoming: true,
    sourceLabel: deviceLabel,
  });

  try {
    await cloudClient.request({
      baseUrl: deps.getBaseUrl(),
      method: 'POST',
      path: `/captures/${row.id}/claim`,
    });
  } catch (err) {
    // Claim failed — the row stays unclaimed; next tick will re-route.
    // That's a duplicate route (the body is already written), but
    // capture() de-dupes by exact-task-text so tasks won't double-up.
    console.error(`[cloud] claim failed for ${row.id}:`, err);
    return;
  }

  logActivity(deps.brainPath, 'cloud-capture', `routed ${row.id.slice(0, 8)}`);
  deps.onRouted?.({ device: deviceLabel, routedTo: result.replace(/\*\*/g, '') });
}
