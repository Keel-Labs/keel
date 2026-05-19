// One-way reminder mirror — POSTs each locally-created reminder to
// the cloud server so the cron worker can fire a push notification
// at fire_at even when the Mac is asleep / closed.
//
// Called from the createReminder IPC handler in electron/main.ts
// after the local DB insert succeeds. Failures here do NOT undo the
// local reminder — local-only reminders are a useful fallback when
// the user is offline / cloud is down. We just log and move on; the
// reminder will fire locally as usual.

import * as cloudClient from './cloudClient';

export interface MirrorOptions {
  baseUrl: string;
  message: string;
  dueAt: number;       // ms since epoch
  projectSlug?: string | null;
}

export async function mirrorReminder(options: MirrorOptions): Promise<{ id: string } | null> {
  try {
    const body = {
      fire_at: new Date(options.dueAt).toISOString(),
      payload: {
        title: options.message.slice(0, 256),
        ...(options.projectSlug ? { project_slug: options.projectSlug } : {}),
      },
    };
    const response = await cloudClient.request<{ id: string }>({
      baseUrl: options.baseUrl,
      method: 'POST',
      path: '/reminders',
      body,
    });
    return { id: response.id };
  } catch (err) {
    if (err instanceof cloudClient.CloudUnauthorizedError) {
      // Session expired or revoked — caller should react (sign-out),
      // but we don't want every mirror call to push that decision.
      // Just return null; the cron-firing layer is the canonical
      // 'not signed in' detector.
      return null;
    }
    console.error('[cloud] reminder mirror failed:', err);
    return null;
  }
}
