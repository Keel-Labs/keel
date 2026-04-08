# X Posts Integration

## Goal

Add an X integration that lets Keel:

- ingest knowledge from X posts
- backfill and continuously sync bookmarked posts
- route ingested posts into the right wiki base by topic
- create and publish new X posts from inside Keel

This spec is grounded in the X documentation reviewed on April 7, 2026, especially:

- Tools & Libraries
- OAuth 2.0 Authorization Code Flow with PKCE
- Bookmarks lookup and integration guides
- Create or Edit Post

Reference URLs:

- [Tools & Libraries](https://docs.x.com/tools-and-libraries)
- [TypeScript XDK install](https://docs.x.com/xdks/typescript/install)
- [OAuth 2.0 PKCE](https://docs.x.com/fundamentals/authentication/oauth-2-0/user-access-token)
- [Bookmarks](https://docs.x.com/x-api/posts/bookmarks/introduction)
- [Create or Edit Post](https://docs.x.com/x-api/posts/create-post)
- [MCP Servers](https://docs.x.com/tools/mcp)

## Recommendation

Build the product integration on X API v2 using the official TypeScript XDK in the Electron main process.

Use:

- OAuth 2.0 Authorization Code Flow with PKCE for user-context access
- `offline.access` so bookmark sync can continue without repeated re-auth
- the official TypeScript XDK for runtime product code
- `xurl` only for manual debugging and operator workflows
- XMCP only as an optional agent/operator tool, not as the app runtime path

Do not build the production path around raw handcrafted REST calls unless the XDK is missing a required endpoint. The docs position the TypeScript SDK as the official Node-compatible path, with type safety and auth support, which matches Keel’s stack and keeps the integration surface smaller.

## Why This Fits Keel

Keel already has a durable wiki-base model:

- `knowledge-bases/<slug>/raw/`
- `knowledge-bases/<slug>/wiki/sources/`
- `knowledge-bases/<slug>/wiki/concepts/`
- `knowledge-bases/<slug>/wiki/open-questions/`
- compile and health-check workflows

That means the X integration should not invent a second knowledge system. It should normalize X posts into source packages, then reuse the existing wiki ingest and compile model.

The right mental model is:

- X is a source system
- bookmarks are a high-signal capture queue
- Keel is the durable knowledge system
- wiki bases remain the long-term topic containers

## External Constraints From X Docs

### Auth

Use OAuth 2.0 PKCE with user-context scopes. The minimum useful scope set for Keel is:

- `tweet.read`
- `users.read`
- `bookmark.read`
- `tweet.write`
- `offline.access`

Optional later scope:

- `bookmark.write`

Only request `bookmark.write` if Keel will actively add or remove bookmarks on the user’s behalf. It is not needed for passive bookmark ingestion.

### Bookmark Sync Limits

X’s bookmarks integration guide currently says:

- GET bookmarks is rate-limited to 180 requests per 15 minutes per user
- POST and DELETE bookmark calls are rate-limited to 50 requests per 15 minutes per user
- bookmark lookup returns the user’s 800 most recent bookmarked posts

Product implication:

- the first sync after account connect must backfill immediately
- Keel cannot assume older bookmarks are available forever
- if the user connects late, bookmarks older than the most recent 800 may already be unrecoverable through this endpoint

### Publishing

The primary publishing endpoint is `POST /2/tweets`.

It supports:

- plain text posts
- replies
- quote posts
- media references after separate media upload
- other advanced fields Keel does not need in v1

Keel should start with:

- plain text posts
- replies
- quote posts

Media composition can be phase 2.

## Product Behavior

### 1. Connect X Account

From Keel settings or integrations:

1. User clicks Connect X.
2. Keel opens the PKCE authorization flow in the browser.
3. X redirects back to a local callback handled by Electron.
4. Keel exchanges the auth code for access and refresh tokens.
5. Keel resolves the authenticated user with `/2/users/me`.
6. Keel stores account identity and encrypted tokens locally.
7. Keel immediately starts bookmark backfill.

Store tokens outside the brain markdown files. Prefer OS keychain storage. If that is not available yet, keep tokens in a dedicated encrypted local store and treat keychain adoption as a follow-up requirement before general release.

### 2. Bookmark Ingestion

Bookmark ingestion should be the default capture loop.

Flow:

1. Fetch bookmarked posts page by page for the authenticated user.
2. Expand author data and request the post fields Keel needs.
3. Normalize each bookmark into a canonical internal `XPostSource`.
4. Deduplicate by X post ID.
5. Classify the source into an existing wiki base or a new wiki base candidate.
6. Create or update the relevant source package and wiki source page.
7. Queue compile and health-check work for affected bases.

Requested fields should stay lean in v1:

- `created_at`
- `author_id`
- `public_metrics`
- `lang`
- `conversation_id`
- `referenced_tweets`
- `entities`

Requested expansions should stay lean in v1:

- `author_id`
- referenced tweet expansions only if Keel needs quote/reply context

Keel should ingest bookmark text, author, timestamp, URL, public metrics, and relationship metadata. It should not rely on bookmark state alone as the durable truth once the source is ingested.

### 3. Topic Routing

Each bookmarked post should be routed into a wiki base using a two-stage decision:

#### Stage A: Fast candidate generation

Generate likely candidate bases from:

- base title and description keyword overlap
- existing base concept page overlap
- embedding similarity against base summaries
- author affinity if a base is strongly tied to a person or organization

#### Stage B: LLM assignment decision

Ask the model to choose one of:

- attach to an existing base
- create a new base
- mark ambiguous and send to review

Recommended confidence policy:

- `>= 0.75`: auto-attach to the best existing base
- `0.45 - 0.74`: ingest into an inbox/review queue with a proposed base
- `< 0.45`: create a new wiki base if auto-create is enabled, otherwise queue a proposal

This keeps obvious cases automatic while containing fragmentation risk.

### 4. New Base Creation During Ingest

Keel should be allowed to create a new wiki base when a bookmarked post appears materially different from existing knowledge clusters.

Recommended rule:

- auto-create only when the confidence that the post does not belong to any existing base is high
- use the post plus nearby related bookmarks as seed context for the new base title and description
- record that the base was created by routing, not manually

The base should be created through the existing wiki base workflow, not by ad hoc file writes.

### 5. Publishing Posts

Keel should support assisted publishing, not blind autonomous posting.

Recommended UX:

1. User drafts or asks Keel to draft a post.
2. Keel shows a structured preview.
3. User explicitly confirms publication.
4. Keel calls `POST /2/tweets`.
5. Keel stores the returned X post ID and canonical URL.
6. Keel optionally links the published post to a wiki base or output artifact.

Supported publishing modes in v1:

- new post
- reply to an existing post
- quote an existing post

Not in v1:

- scheduled publishing
- media upload workflow
- bookmark mutation after publish
- autonomous posting without user confirmation

## Runtime Design

### Recommended Modules

Add new integration code instead of burying X logic in `electron/main.ts`.

Suggested modules:

- `src/core/integrations/x/xClient.ts`
- `src/core/integrations/x/xAuth.ts`
- `src/core/integrations/x/xBookmarkSync.ts`
- `src/core/integrations/x/xPostNormalize.ts`
- `src/core/integrations/x/xTopicRouter.ts`
- `src/core/integrations/x/xPublisher.ts`

Likely touched existing files:

- `electron/main.ts`
- `src/shared/types.ts`
- `src/core/workflows/wikiBase.ts`
- `src/core/workflows/wikiIngest.ts`
- `src/core/wikiBaseSummaries.ts`

## Internal Data Model

Add durable metadata for the integration instead of overloading markdown alone.

Recommended tables or equivalent persisted records:

- `x_accounts`
- `x_tokens`
- `x_bookmark_sync_state`
- `x_posts`
- `x_post_ingestions`
- `x_publish_history`

Recommended fields:

- X user ID
- username
- token issued/expiry metadata
- last bookmark sync timestamp
- last seen bookmark cursor
- X post ID
- canonical post URL
- author ID
- created-at timestamp
- normalized content hash
- assigned wiki base path
- source slug
- ingestion status
- publish status

## Source Package Shape

Each ingested X post should produce:

- one immutable raw package
- one wiki source page
- one stable external identity tied to the X post ID

Recommended source slug:

- `x-post-<postId>`

Recommended raw metadata additions:

- `provider: "x"`
- `externalId: "<postId>"`
- `externalUrl: "https://x.com/<username>/status/<postId>"`
- `authorHandle`
- `capturedAt`
- `postCreatedAt`
- `bookmarkCapturedAt`
- `conversationId`
- `referencedPostIds`

The raw package should preserve the source text and key metadata even if the bookmark is later removed.

## Sync Semantics

Treat bookmark removal as a source-state change, not as knowledge deletion.

Recommended behavior:

- if a previously ingested post is no longer bookmarked, mark it `unbookmarked` in metadata
- do not delete the wiki source page
- do not silently remove concepts or outputs that already cited it

Keel is building a durable knowledge graph, not a mirror of current bookmark state.

## Implementation Phases

### Phase 1

- connect X account with PKCE
- fetch authenticated user
- manual import of one bookmarked post or one post URL
- normalize into wiki source packages

### Phase 2

- full bookmark backfill
- periodic background sync
- topic routing into existing bases
- optional auto-create for clearly new topics

### Phase 3

- publish new posts, replies, and quote posts
- attach published posts to relevant outputs or bases
- inbox review flow for ambiguous routing decisions

### Phase 4

- media upload
- smarter thread ingestion
- author-level routing signals
- optional operator tools using XMCP or xurl

## Risks And Edge Cases

- The 800-bookmark window means delayed onboarding can permanently miss older bookmarks.
- Protected, deleted, or edited posts may produce partial or stale local knowledge.
- Over-aggressive auto-create can fragment the wiki into too many tiny bases.
- Posting is a high-trust action and must stay explicitly user-confirmed.
- Adding `@xdevplatform/xdk` is a new dependency and needs explicit implementation approval.

## Definition Of Done

This spec is satisfied when an implementation can:

- connect a user’s X account with PKCE
- backfill the user’s recent bookmarks
- ingest each bookmark into the correct wiki base or a new base candidate
- keep syncing new bookmarks incrementally
- let the user draft and explicitly publish a post from Keel
- persist enough metadata to trace every ingested or published post back to its X identity
