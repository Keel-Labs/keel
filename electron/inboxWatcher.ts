// Mobile companion inbox watcher.
//
// Watches <workspace>/inbox/incoming/ for captures dropped by the Keel mobile
// app (via the user's chosen file sync — iCloud / Dropbox / Drive / OneDrive /
// Syncthing). Validates each file's name and frontmatter, moves it through
// processing → processed/failed, and routes the payload through the existing
// `capture()` workflow (for text/share captures) or `ingestWikiSource()` (for
// KB source additions).
//
// Principle: the Mac workspace is the canonical reconciler. The phone is a
// pre-router that drops raw input into a single directory; this module is the
// reconciler. See docs/mobile-companion-spec.md for the full contract.

import * as fsSync from 'fs';
import * as fs from 'fs/promises';
import * as path from 'path';
import { FileManager } from '../src/core/fileManager';
import { LLMClient } from '../src/core/llmClient';
import { capture } from '../src/core/workflows/capture';
import { ingestWikiSource } from '../src/core/workflows/wikiIngest';
import { listProjectKBs } from '../src/core/workflows/projectKnowledgeBase';
import {
  isInboxSeen,
  markInboxSeen,
  logActivity,
  type InboxOutcome,
} from '../src/core/db';
import {
  parseInboxName,
  parseFrontmatter,
  validateFrontmatter,
  type ParsedInboxName,
  type Frontmatter,
} from '../src/core/mobileInbox';
import type { GoogleOAuthConfig } from '../src/core/connectors/googleAuth';
import type { WikiSourceInput } from '../src/shared/types';
import { logger } from './logger';

// Protocol helpers (filename + frontmatter parsing/validation) live in
// src/core/mobileInbox.ts so they can be unit-tested without electron deps.

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

export interface InboxWatcherDeps {
  fileManager: FileManager;
  llmClient: LLMClient;
  brainPath: string;
  googleConfig?: GoogleOAuthConfig;
}

interface InboxLayout {
  root: string;
  incoming: string;
  processing: string;
  processed: string;
  failed: string;
}

function layoutFor(brainPath: string): InboxLayout {
  const root = path.join(brainPath, 'inbox');
  return {
    root,
    incoming: path.join(root, 'incoming'),
    processing: path.join(root, 'processing'),
    processed: path.join(root, 'processed'),
    failed: path.join(root, 'failed'),
  };
}

// Debounce per filename: cloud sync providers sometimes fire `add` before the
// upload is fully flushed. chokidar's awaitWriteFinish handles most of it; the
// debounce is belt-and-suspenders.
const DEBOUNCE_MS = 1500;
const debounceTimers = new Map<string, NodeJS.Timeout>();
const inFlight = new Set<string>();

// chokidar v5 is ESM-only and loaded via dynamic import; type as the
// minimal surface we use rather than pulling its types in statically.
interface ChokidarLikeWatcher {
  on(event: 'add', handler: (path: string) => void): void;
  close(): Promise<void>;
}
let chokidarWatcher: ChokidarLikeWatcher | null = null;

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export async function startInboxWatcher(deps: InboxWatcherDeps): Promise<void> {
  const layout = layoutFor(deps.brainPath);
  await ensureLayout(layout);

  // Drain anything already sitting in incoming/ from before we started.
  await drainIncoming(deps, layout);

  // Prune processed/ entries older than 30 days. Best-effort.
  prune(layout).catch((err) => logger.error('[inbox] prune failed:', err));

  const chokidar = await import('chokidar');
  chokidarWatcher = chokidar.watch(layout.incoming, {
    ignoreInitial: true,
    // Ignore dotfiles and our own atomic-write staging prefix.
    ignored: [/(^|[/\\])\./, /(^|[/\\])\.tmp__/],
    depth: 0,
    awaitWriteFinish: {
      stabilityThreshold: 800,
      pollInterval: 200,
    },
  }) as unknown as ChokidarLikeWatcher;

  chokidarWatcher.on('add', (full: string) => {
    const name = path.basename(full);
    if (parseInboxName(name) === null) {
      // Conflict copies, garbage, partial writes that escaped the filter.
      return;
    }
    scheduleProcess(deps, layout, name);
  });

  logger.info(`[inbox] watcher started on ${layout.incoming}`);
}

export async function stopInboxWatcher(): Promise<void> {
  if (chokidarWatcher) {
    await chokidarWatcher.close();
    chokidarWatcher = null;
  }
  for (const t of debounceTimers.values()) clearTimeout(t);
  debounceTimers.clear();
}

async function ensureLayout(layout: InboxLayout): Promise<void> {
  await fs.mkdir(layout.incoming, { recursive: true });
  await fs.mkdir(layout.processing, { recursive: true });
  await fs.mkdir(layout.processed, { recursive: true });
  await fs.mkdir(layout.failed, { recursive: true });
}

async function drainIncoming(deps: InboxWatcherDeps, layout: InboxLayout): Promise<void> {
  let entries: string[];
  try {
    entries = await fs.readdir(layout.incoming);
  } catch {
    return;
  }
  for (const name of entries) {
    if (name.startsWith('.') || name.startsWith('.tmp__')) continue;
    if (parseInboxName(name) === null) continue;
    scheduleProcess(deps, layout, name);
  }
}

// ---------------------------------------------------------------------------
// Scheduling
// ---------------------------------------------------------------------------

function scheduleProcess(deps: InboxWatcherDeps, layout: InboxLayout, name: string): void {
  if (inFlight.has(name)) return;
  const existing = debounceTimers.get(name);
  if (existing) clearTimeout(existing);
  debounceTimers.set(
    name,
    setTimeout(() => {
      debounceTimers.delete(name);
      void processOne(deps, layout, name).catch((err) => {
        logger.error(`[inbox] ${name} processing crashed:`, err);
      });
    }, DEBOUNCE_MS)
  );
}

// ---------------------------------------------------------------------------
// Processing
// ---------------------------------------------------------------------------

async function processOne(
  deps: InboxWatcherDeps,
  layout: InboxLayout,
  filename: string
): Promise<void> {
  if (inFlight.has(filename)) return;
  inFlight.add(filename);

  try {
    const parsed = parseInboxName(filename);
    if (!parsed) return;

    const incomingPath = path.join(layout.incoming, filename);

    // Dedupe against the table — cloud sync sometimes resurrects deleted files.
    if (isInboxSeen(deps.brainPath, filename)) {
      await failWith(deps, layout, [incomingPath], filename, parsed.deviceId, 'duplicate', 'duplicate');
      return;
    }

    const raw = await fs.readFile(incomingPath, 'utf-8').catch(() => null);
    if (raw === null) return; // file vanished between event and read

    const { frontmatter, body } = parseFrontmatter(raw);
    const validation = validateFrontmatter(frontmatter);
    if (validation !== null) {
      await failWith(deps, layout, [incomingPath], filename, parsed.deviceId, validation);
      return;
    }

    const kind = String(frontmatter.kind);

    // Move to processing/ atomically before invoking any router.
    const processingPath = path.join(layout.processing, filename);
    await safeRename(incomingPath, processingPath);

    try {
      if (kind === 'capture') {
        await routeCapture(deps, frontmatter, body);
      } else if (kind === 'kb-source') {
        await routeKbSource(deps, frontmatter, body);
      } else {
        // Shouldn't happen — validation rejects unknown kinds.
        throw new Error(`unsupported kind: ${kind}`);
      }

      await archive(layout, [processingPath]);
      markInboxSeen(deps.brainPath, filename, 'processed', parsed.deviceId);
      logActivity(deps.brainPath, 'mobile-capture', `${filename} (${kind})`);
    } catch (err) {
      await failWith(deps, layout, [processingPath], filename, parsed.deviceId, errMsg(err));
    }
  } finally {
    inFlight.delete(filename);
  }
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

async function routeCapture(
  deps: InboxWatcherDeps,
  frontmatter: Frontmatter,
  body: string
): Promise<void> {
  const deviceLabel = String(frontmatter.device || 'mobile');
  const input = `[Captured from ${deviceLabel} via Keel mobile]\n\n${body.trim()}`;
  await capture(input, deps.fileManager, deps.llmClient, deps.googleConfig);
}

async function routeKbSource(
  deps: InboxWatcherDeps,
  frontmatter: Frontmatter,
  body: string
): Promise<void> {
  const targetSlug = String(frontmatter['target-kb'] || '').trim();
  if (!targetSlug) throw new Error('kb-source missing target-kb');

  const allKBs = await listProjectKBs(deps.fileManager);
  const entry = allKBs.find((e) => e.projectSlug === targetSlug);
  if (!entry) throw new Error(`unknown target-kb: ${targetSlug}`);

  const sourceUrl = String(frontmatter['source-url'] || '').trim();
  const deviceLabel = String(frontmatter.device || 'mobile');

  let input: WikiSourceInput;
  if (sourceUrl) {
    input = { sourceType: 'url', url: sourceUrl };
  } else {
    const text = body.trim();
    if (!text) throw new Error('kb-source has neither source-url nor body text');
    const firstLine = text.split(/\r?\n/, 1)[0] || 'Mobile note';
    const title = `${firstLine.slice(0, 60)} (from ${deviceLabel})`;
    input = { sourceType: 'text', title, text };
  }

  await ingestWikiSource(entry.basePath, input, deps.fileManager);
  // The existing KB auto-refresh watcher (electron/main.ts:startKBAutoRefreshWatcher)
  // will notice the new source under projects/<slug>/ and trigger a recompile
  // — we don't need to call compileWikiBase here.
}

// ---------------------------------------------------------------------------
// Move helpers + archive + fail
// ---------------------------------------------------------------------------

async function failWith(
  deps: InboxWatcherDeps,
  layout: InboxLayout,
  sourcePaths: string[],
  filenameForRecord: string,
  deviceId: string,
  reason: string,
  outcome: InboxOutcome = 'failed'
): Promise<void> {
  for (const src of sourcePaths) {
    if (!fsSync.existsSync(src)) continue;
    const dest = path.join(layout.failed, path.basename(src));
    try {
      await safeRename(src, dest);
    } catch (err) {
      logger.error(`[inbox] failed to move ${src} to failed/:`, err);
    }
  }
  const errorPath = path.join(layout.failed, `${filenameForRecord}.error.json`);
  try {
    await fs.writeFile(
      errorPath,
      JSON.stringify({ filename: filenameForRecord, reason, at: new Date().toISOString() }, null, 2),
      'utf-8'
    );
  } catch (err) {
    logger.error('[inbox] could not write .error.json:', err);
  }
  markInboxSeen(deps.brainPath, filenameForRecord, outcome, deviceId);
  logActivity(deps.brainPath, 'mobile-capture-failed', `${filenameForRecord}: ${reason}`);
}

async function archive(layout: InboxLayout, paths: string[]): Promise<void> {
  // Bucket by YYYY-MM so processed/ doesn't grow as one flat directory.
  const now = new Date();
  const bucket = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const dir = path.join(layout.processed, bucket);
  await fs.mkdir(dir, { recursive: true });
  for (const src of paths) {
    if (!fsSync.existsSync(src)) continue;
    const dest = path.join(dir, path.basename(src));
    await safeRename(src, dest);
  }
}

async function safeRename(src: string, dest: string): Promise<void> {
  await fs.mkdir(path.dirname(dest), { recursive: true });
  try {
    await fs.rename(src, dest);
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === 'EXDEV') {
      // Cross-device fallback — shouldn't happen within one workspace volume.
      await fs.copyFile(src, dest);
      await fs.unlink(src);
    } else {
      throw err;
    }
  }
}

async function prune(layout: InboxLayout): Promise<void> {
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  let buckets: string[];
  try {
    buckets = await fs.readdir(layout.processed);
  } catch {
    return;
  }
  for (const bucket of buckets) {
    const bucketDir = path.join(layout.processed, bucket);
    let names: string[];
    try {
      names = await fs.readdir(bucketDir);
    } catch {
      continue;
    }
    for (const name of names) {
      const full = path.join(bucketDir, name);
      try {
        const stat = await fs.stat(full);
        if (stat.mtimeMs < cutoff) await fs.unlink(full);
      } catch {
        /* best-effort */
      }
    }
    try {
      const remaining = await fs.readdir(bucketDir);
      if (remaining.length === 0) await fs.rmdir(bucketDir);
    } catch {
      /* best-effort */
    }
  }
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
