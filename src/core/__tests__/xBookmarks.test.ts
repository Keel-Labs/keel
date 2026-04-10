import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { FileManager } from '../fileManager';

const xAuthMocks = vi.hoisted(() => ({
  recordXSyncSuccess: vi.fn(),
  recordXSyncTarget: vi.fn(),
  getRecentXBookmarkPostIds: vi.fn(),
}));

vi.mock('../connectors/xAuth', () => ({
  recordXSyncSuccess: xAuthMocks.recordXSyncSuccess,
  recordXSyncTarget: xAuthMocks.recordXSyncTarget,
  getRecentXBookmarkPostIds: xAuthMocks.getRecentXBookmarkPostIds,
}));

import { syncXBookmarksToWiki } from '../connectors/xBookmarks';

let tmpDir: string;
let fileManager: FileManager;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-x-bookmarks-'));
  fileManager = new FileManager(tmpDir);
  await fileManager.ensureDirectoryStructure();
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('syncXBookmarksToWiki', () => {
  it('counts only new bookmark ingests on repeated syncs and stores sync stats', async () => {
    xAuthMocks.getRecentXBookmarkPostIds
      .mockReturnValueOnce([])
      .mockReturnValueOnce(['12345']);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{
          id: '12345',
          text: 'A kept bookmark',
          author_id: 'user-1',
          created_at: '2026-04-09T10:00:00.000Z',
          public_metrics: {
            reply_count: 1,
            retweet_count: 2,
            like_count: 3,
            bookmark_count: 4,
          },
        }],
        includes: {
          users: [{
            id: 'user-1',
            username: 'keel',
            name: 'Keel',
          }],
        },
        meta: {},
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const first = await syncXBookmarksToWiki(tmpDir, 'token', 'user-1', fileManager);
    const second = await syncXBookmarksToWiki(tmpDir, 'token', 'user-1', fileManager);

    expect(first.fetchedCount).toBe(1);
    expect(first.syncedCount).toBe(1);
    expect(first.skippedCount).toBe(0);

    expect(second.fetchedCount).toBe(1);
    expect(second.syncedCount).toBe(0);
    expect(second.skippedCount).toBe(1);
    expect(second.stoppedEarly).toBe(true);

    const sourcePage = await fileManager.readFile('knowledge-bases/x-bookmarks/wiki/sources/x-post-12345.md');
    expect(sourcePage).toContain('A kept bookmark');

    expect(xAuthMocks.recordXSyncTarget).toHaveBeenCalledWith(
      tmpDir,
      'knowledge-bases/x-bookmarks',
      'X Bookmarks',
    );
    expect(xAuthMocks.recordXSyncSuccess).toHaveBeenLastCalledWith(tmpDir, expect.objectContaining({
      recentBookmarkPostIds: ['12345'],
      fetchedCount: 1,
      newCount: 0,
      skippedCount: 1,
    }));
  });
});
