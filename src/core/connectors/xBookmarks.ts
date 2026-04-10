import { FileManager } from '../fileManager';
import { createWikiBase } from '../workflows/wikiBase';
import { ingestWikiSource } from '../workflows/wikiIngest';
import { listWikiBaseSummaries } from '../wikiBaseSummaries';
import type { XSyncResult } from '../../shared/types';
import { getRecentXBookmarkPostIds, recordXSyncSuccess, recordXSyncTarget } from './xAuth';

const X_BOOKMARKS_BASE_TITLE = 'X Bookmarks';

interface XBookmarksResponse {
  data?: Array<{
    id: string;
    text: string;
    author_id?: string;
    created_at?: string;
    public_metrics?: {
      reply_count?: number;
      retweet_count?: number;
      like_count?: number;
      bookmark_count?: number;
    };
  }>;
  includes?: {
    users?: Array<{
      id: string;
      username: string;
      name?: string;
    }>;
  };
  meta?: {
    next_token?: string;
  };
}

export async function syncXBookmarksToWiki(
  brainPath: string,
  accessToken: string,
  userId: string,
  fileManager: FileManager,
): Promise<XSyncResult> {
  const base = await ensureXBookmarksBase(brainPath, fileManager);
  let paginationToken: string | undefined;
  let fetchedCount = 0;
  let syncedCount = 0;
  let skippedCount = 0;
  let stoppedEarly = false;
  const previousFrontier = new Set(getRecentXBookmarkPostIds(brainPath));
  const nextFrontier: string[] = [];

  do {
    const url = new URL(`https://api.x.com/2/users/${userId}/bookmarks`);
    url.searchParams.set('max_results', '100');
    url.searchParams.set('tweet.fields', 'created_at,public_metrics');
    url.searchParams.set('expansions', 'author_id');
    url.searchParams.set('user.fields', 'name,username');
    if (paginationToken) {
      url.searchParams.set('pagination_token', paginationToken);
    }

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const payload = await response.json() as XBookmarksResponse & { title?: string; detail?: string };
    if (!response.ok) {
      throw new Error(payload.detail || payload.title || 'Failed to fetch bookmarks from X.');
    }

    const usersById = new Map((payload.includes?.users || []).map((user) => [user.id, user]));
    const pagePosts = payload.data || [];
    let pageKnownCount = 0;

    for (const post of pagePosts) {
      fetchedCount += 1;
      if (nextFrontier.length < 100) {
        nextFrontier.push(post.id);
      }
      const author = post.author_id ? usersById.get(post.author_id) : undefined;
      const postUrl = author?.username
        ? `https://x.com/${author.username}/status/${post.id}`
        : `https://x.com/i/web/status/${post.id}`;
      const existingMetadataPath = `${base.basePath}/raw/x-post-${post.id}/metadata.json`;
      const alreadyIngested = await fileManager.fileExists(existingMetadataPath);

      if (alreadyIngested) {
        pageKnownCount += 1;
        skippedCount += 1;
      }

      await ingestWikiSource(base.basePath, {
        sourceType: 'x',
        title: author?.username ? `X post from @${author.username}` : `X post ${post.id}`,
        xPostUrl: postUrl,
        xText: post.text,
        xAuthorHandle: author?.username ? `@${author.username}` : undefined,
        xAuthorName: author?.name,
        xPostedAt: post.created_at,
        xReplyCount: post.public_metrics?.reply_count,
        xRepostCount: post.public_metrics?.retweet_count,
        xLikeCount: post.public_metrics?.like_count,
        xBookmarkCount: post.public_metrics?.bookmark_count,
      }, fileManager);

      if (!alreadyIngested) {
        syncedCount += 1;
      }
    }

    const pageHasKnownFrontierPost = pagePosts.some((post) => previousFrontier.has(post.id));
    if (pagePosts.length > 0 && pageKnownCount === pagePosts.length && pageHasKnownFrontierPost) {
      stoppedEarly = true;
      paginationToken = undefined;
      break;
    }

    paginationToken = payload.meta?.next_token;
  } while (paginationToken);

  recordXSyncTarget(brainPath, base.basePath, base.title);
  recordXSyncSuccess(brainPath, {
    recentBookmarkPostIds: nextFrontier,
    fetchedCount,
    newCount: syncedCount,
    skippedCount,
  });

  return {
    fetchedCount,
    syncedCount,
    skippedCount,
    stoppedEarly,
    targetBasePath: base.basePath,
    targetBaseTitle: base.title,
  };
}

async function ensureXBookmarksBase(brainPath: string, fileManager: FileManager): Promise<{ basePath: string; title: string }> {
  const existing = (await listWikiBaseSummaries(brainPath)).find((base) => base.title === X_BOOKMARKS_BASE_TITLE || base.slug === 'x-bookmarks');
  if (existing) {
    return {
      basePath: existing.basePath,
      title: existing.title,
    };
  }

  const created = await createWikiBase(X_BOOKMARKS_BASE_TITLE, fileManager, {
    description: 'Recent bookmarks synced from X.',
  });

  return {
    basePath: created.basePath,
    title: created.title,
  };
}
