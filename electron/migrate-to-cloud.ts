/**
 * Desktop → Cloud data migration.
 *
 * Reads all local data (settings, brain files, chat sessions, reminders,
 * activity log) and uploads it to the cloud server via the bulk import API.
 */

import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';
import { loadSettings } from '../src/core/settings';
import {
  getDb,
  listChatSessions,
  loadChatSession,
  listUpcomingReminders,
  getRecentActivity,
} from '../src/core/db';

export interface MigrationResult {
  ok: boolean;
  imported?: {
    settings: boolean;
    brainFiles: number;
    chatSessions: number;
    reminders: number;
    activityLog: number;
  };
  error?: string;
}

export interface MigrationProgress {
  step: string;
  current: number;
  total: number;
}

/**
 * Export all local data into a migration payload.
 */
export async function exportLocalData(
  brainPath: string,
  onProgress?: (p: MigrationProgress) => void,
): Promise<{
  settings: Record<string, any>;
  brainFiles: Array<{ path: string; content: string }>;
  chatSessions: Array<{ id: string; messages: any[]; createdAt: number; updatedAt: number }>;
  reminders: Array<{ message: string; dueAt: number; recurring: string | null; fired: boolean }>;
  activityLog: Array<{ action: string; detail?: string; createdAt: number }>;
}> {
  const report = (step: string, current: number, total: number) => {
    onProgress?.({ step, current, total });
  };

  // 1. Settings
  report('Exporting settings', 0, 1);
  const settings = loadSettings();
  const { brainPath: _bp, teamBrainPath: _tbp, ...settingsData } = settings;
  report('Exporting settings', 1, 1);

  // 2. Brain files — all markdown and text files in the brain directory
  report('Scanning brain files', 0, 0);
  const brainPatterns = [
    '*.md',
    'projects/**/*.md',
    'daily-log/**/*.md',
    'projects/**/*.txt',
  ];

  const brainFiles: Array<{ path: string; content: string }> = [];
  const allPaths = new Set<string>();

  for (const pattern of brainPatterns) {
    const matches = await glob(pattern, { cwd: brainPath, nodir: true });
    matches.forEach((m) => allPaths.add(m));
  }

  const pathList = [...allPaths].sort();
  for (let i = 0; i < pathList.length; i++) {
    report('Exporting brain files', i, pathList.length);
    const relPath = pathList[i];
    try {
      const content = fs.readFileSync(path.join(brainPath, relPath), 'utf-8');
      brainFiles.push({ path: relPath, content });
    } catch {
      // Skip unreadable files
    }
  }
  report('Exporting brain files', pathList.length, pathList.length);

  // 3. Chat sessions
  report('Exporting chat sessions', 0, 0);
  const sessionList = listChatSessions(brainPath, 200); // Get up to 200 sessions
  const chatSessions: Array<{ id: string; messages: any[]; createdAt: number; updatedAt: number }> = [];

  for (let i = 0; i < sessionList.length; i++) {
    report('Exporting chat sessions', i, sessionList.length);
    const s = sessionList[i];
    const messages = loadChatSession(brainPath, s.id);
    if (messages && messages.length > 0) {
      chatSessions.push({
        id: s.id,
        messages,
        createdAt: s.updatedAt, // Desktop doesn't store separate createdAt in listing
        updatedAt: s.updatedAt,
      });
    }
  }
  report('Exporting chat sessions', sessionList.length, sessionList.length);

  // 4. Reminders
  report('Exporting reminders', 0, 1);
  const reminderRows = listUpcomingReminders(brainPath, 100);
  const reminders = reminderRows.map((r) => ({
    message: r.message,
    dueAt: r.dueAt,
    recurring: r.recurring,
    fired: r.fired,
  }));
  report('Exporting reminders', 1, 1);

  // 5. Activity log (recent 200 entries)
  report('Exporting activity log', 0, 1);
  const activityEntries = getRecentActivity(brainPath, 200);
  const activityLog = activityEntries.map((e) => ({
    action: e.action,
    detail: e.detail || undefined,
    createdAt: e.createdAt,
  }));
  report('Exporting activity log', 1, 1);

  return {
    settings: settingsData,
    brainFiles,
    chatSessions,
    reminders,
    activityLog,
  };
}

/**
 * Upload exported data to the cloud server.
 */
export async function uploadToCloud(
  serverUrl: string,
  accessToken: string,
  payload: Awaited<ReturnType<typeof exportLocalData>>,
): Promise<MigrationResult> {
  const response = await fetch(`${serverUrl}/api/migrate/import`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const err = await response.text();
    return { ok: false, error: `Server returned ${response.status}: ${err}` };
  }

  const result = await response.json() as any;
  return {
    ok: result.ok,
    imported: result.imported,
  };
}

/**
 * Full migration: export local data → upload to cloud.
 */
export async function migrateToCloud(
  brainPath: string,
  serverUrl: string,
  accessToken: string,
  onProgress?: (p: MigrationProgress) => void,
): Promise<MigrationResult> {
  try {
    onProgress?.({ step: 'Preparing data export...', current: 0, total: 0 });

    const payload = await exportLocalData(brainPath, onProgress);

    onProgress?.({
      step: 'Uploading to cloud...',
      current: 0,
      total:
        payload.brainFiles.length +
        payload.chatSessions.length +
        payload.reminders.length,
    });

    const result = await uploadToCloud(serverUrl, accessToken, payload);

    if (result.ok) {
      onProgress?.({ step: 'Migration complete!', current: 1, total: 1 });
    }

    return result;
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}
