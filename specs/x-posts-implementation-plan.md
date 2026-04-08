# X Posts Implementation Plan

## Goal

Turn the X integration spec into a staged implementation plan that fits Keel’s current architecture and can land in small reviewable slices.

This plan covers:

- X account connection
- bookmark ingestion
- wiki-base routing
- composer-driven drafting and publishing
- tweet-like source presentation in the wiki

This plan does not assume:

- media upload in v1
- scheduled posting in v1
- autonomous posting in v1

## Guiding Principles

- Reuse existing surfaces before adding new ones.
- Keep external side effects explicit and confirm-first.
- Treat bookmarked posts as durable sources once ingested.
- Keep routing explainable and reviewable.
- Ship the smallest slice that proves the product loop before broad automation.

## Surface Ownership

Use the existing app surfaces as follows:

- `Settings` owns account connection, token state, sync state, and disconnect
- `Wiki` owns X source ingestion and X source presentation
- `Inbox` owns ambiguous routing and sync/publish exceptions
- `Chat` owns draft creation and refinement

Do not add a top-level `X` nav surface in v1.

## Phase 0: Internal Types And Integration Skeleton

Goal:

Create the minimum internal structure needed to add X without wiring all UX at once.

Primary changes:

- add X integration types to shared types
- add Electron-side integration modules under `src/core/integrations/x/`
- add placeholder IPC contracts for connect, sync, draft, and publish flows

Likely files:

- [src/shared/types.ts](/Users/djsam/codex/Keel/src/shared/types.ts)
- [electron/main.ts](/Users/djsam/codex/Keel/electron/main.ts)
- [electron/preload.ts](/Users/djsam/codex/Keel/electron/preload.ts)
- `src/core/integrations/x/xClient.ts`
- `src/core/integrations/x/xAuth.ts`
- `src/core/integrations/x/xBookmarkSync.ts`
- `src/core/integrations/x/xPostNormalize.ts`
- `src/core/integrations/x/xPublisher.ts`

Definition of done:

- app builds the internal X module boundary
- renderer has typed IPC hooks to call into X integration flows
- no user-facing behavior required yet beyond safe stubs

## Phase 1: Settings Integration For X Connection

Goal:

Add a first-class `Integrations / X` section in Settings.

Primary changes:

- add a new settings section ID and nav item
- show connection state, account identity, last sync, and sync health
- add `Connect X`, `Sync now`, and `Disconnect`
- implement OAuth 2.0 PKCE callback handling in Electron

Likely files:

- [src/app/components/Settings.tsx](/Users/djsam/codex/Keel/src/app/components/Settings.tsx)
- [electron/main.ts](/Users/djsam/codex/Keel/electron/main.ts)
- [electron/preload.ts](/Users/djsam/codex/Keel/electron/preload.ts)
- [src/shared/types.ts](/Users/djsam/codex/Keel/src/shared/types.ts)

Data needed:

- X account identity
- token presence and expiry metadata
- last successful bookmark sync
- last sync error if present

Definition of done:

- user can connect and disconnect an X account
- Settings reflects current account and sync state
- tokens are not stored in wiki markdown content

## Phase 2: One-Off Post Import Into Wiki

Goal:

Prove the X-to-wiki ingest path before background sync.

Primary changes:

- extend wiki source ingest with an `X` mode
- support pasting a post URL for one-off import
- normalize the X post into existing raw/source page structures
- tag X-derived sources with provider-specific metadata

Likely files:

- [src/app/components/WikiWorkspace.tsx](/Users/djsam/codex/Keel/src/app/components/WikiWorkspace.tsx)
- [src/app/styles.css](/Users/djsam/codex/Keel/src/app/styles.css)
- [src/core/workflows/wikiIngest.ts](/Users/djsam/codex/Keel/src/core/workflows/wikiIngest.ts)
- [src/core/workflows/wikiBase.ts](/Users/djsam/codex/Keel/src/core/workflows/wikiBase.ts)
- [src/shared/types.ts](/Users/djsam/codex/Keel/src/shared/types.ts)

Definition of done:

- user can import a single X post URL into a chosen wiki base
- the source becomes a raw package plus wiki source page
- provenance is visible in the resulting source page

## Phase 3: Bookmark Backfill And Incremental Sync

Goal:

Turn bookmarks into a capture loop rather than a one-off import path.

Primary changes:

- fetch bookmarked posts for the connected user
- deduplicate by X post ID
- persist bookmark sync checkpoints
- ingest bookmarks into wiki source packages
- expose `Sync now` from Settings

Likely files:

- `src/core/integrations/x/xBookmarkSync.ts`
- [electron/main.ts](/Users/djsam/codex/Keel/electron/main.ts)
- [src/shared/types.ts](/Users/djsam/codex/Keel/src/shared/types.ts)

Definition of done:

- first sync backfills recent bookmarks
- repeated syncs are incremental
- duplicate ingests are avoided by stable X post identity

## Phase 4: Base Routing And Review Queue

Goal:

Route bookmarks into the right base without requiring full manual sorting.

Primary changes:

- add candidate-base generation
- add assignment decision logic
- auto-attach confident matches
- create review items for ambiguous matches
- optionally auto-create bases for obviously novel topics

Likely files:

- `src/core/integrations/x/xTopicRouter.ts`
- [src/core/wikiBaseSummaries.ts](/Users/djsam/codex/Keel/src/core/wikiBaseSummaries.ts)
- [src/core/workflows/wikiBase.ts](/Users/djsam/codex/Keel/src/core/workflows/wikiBase.ts)
- [src/app/App.tsx](/Users/djsam/codex/Keel/src/app/App.tsx)

Definition of done:

- bookmarks can be auto-attached to existing bases
- ambiguous items are surfaced for later review
- new base creation is explicit in metadata when it happens

## Phase 5: Composer Draft Mode For X Posts

Goal:

Add X drafting to the existing composer without turning chat send into auto-publish.

Primary changes:

- add `Draft X Post` to the composer plus-button menu
- add composer draft state for `post`, `reply`, and `quote`
- show a persistent `X Draft` chip in the composer session bar
- preserve the draft chip while the draft mode is active
- let users refine drafts in normal chat flow

Likely files:

- [src/app/components/Chat.tsx](/Users/djsam/codex/Keel/src/app/components/Chat.tsx)
- [src/app/styles.css](/Users/djsam/codex/Keel/src/app/styles.css)
- [src/shared/types.ts](/Users/djsam/codex/Keel/src/shared/types.ts)

Recommended UX details:

- place `Draft X Post` alongside existing plus-menu actions
- stack the `X Draft` chip with the existing wiki-base chip when both are present
- support `Exit Draft` without losing unrelated attachments

Definition of done:

- user can enter draft mode from the plus menu
- the draft mode is visible and persistent above the composer
- normal send still behaves as chat, not direct publish

## Phase 6: Publish Review And Publish Action

Goal:

Separate draft creation from external publication.

Primary changes:

- add a publish review modal or sheet
- show final text, character count, and target mode
- call X publish endpoint only after explicit confirmation
- persist publish results and failures

Likely files:

- [src/app/components/Chat.tsx](/Users/djsam/codex/Keel/src/app/components/Chat.tsx)
- [src/app/App.tsx](/Users/djsam/codex/Keel/src/app/App.tsx)
- [src/app/styles.css](/Users/djsam/codex/Keel/src/app/styles.css)
- `src/core/integrations/x/xPublisher.ts`
- [electron/main.ts](/Users/djsam/codex/Keel/electron/main.ts)

Definition of done:

- user can confirm and publish a drafted post
- failures do not destroy the draft state
- success returns the created post URL and ID

## Phase 7: Tweet-Like Source Presentation

Goal:

Make X-derived sources feel legible and native inside the wiki without cloning the X UI.

Primary changes:

- add provider-aware source rendering in wiki source pages
- add a compact tweet-like card at the top of X-derived source pages
- add a lighter X-specific treatment for X items in the synthesis `Sources` section

Likely files:

- [src/app/components/WikiWorkspace.tsx](/Users/djsam/codex/Keel/src/app/components/WikiWorkspace.tsx)
- [src/app/styles.css](/Users/djsam/codex/Keel/src/app/styles.css)
- [src/shared/types.ts](/Users/djsam/codex/Keel/src/shared/types.ts)

Definition of done:

- X source pages show a recognizable post card
- synthesis cards for X items have provider-specific styling
- the treatment stays clearly within Keel’s existing visual language

## Phase 8: Inbox Review And Recovery

Goal:

Give the user a place to resolve routing mistakes and failed operations.

Primary changes:

- create inbox items for ambiguous routing
- create inbox items for sync failures
- create inbox items for publish failures
- add action handlers for accept, choose base, create base, retry, and dismiss

Likely files:

- [src/app/App.tsx](/Users/djsam/codex/Keel/src/app/App.tsx)
- inbox surface components once they are implemented
- X integration persistence modules

Definition of done:

- the user can resolve ambiguous X ingestion decisions after the fact
- failures are actionable rather than hidden in logs

## Recommended Delivery Order

Ship in this order:

1. X module skeleton and shared types
2. Settings connection flow
3. one-off post import into wiki
4. bookmark sync
5. base routing
6. composer draft mode
7. publish review and publish
8. tweet-like source presentation
9. inbox review and recovery

This order proves the ingestion loop before the publishing loop, and proves both before adding polish.

## Testing Strategy

For each phase:

- add narrow unit tests for normalization and routing logic
- add renderer tests where component behavior is stateful
- prefer targeted checks before full build

Minimum high-signal test areas:

- OAuth callback and token-state handling
- X post normalization into source metadata
- dedupe by X post ID
- base routing decision behavior
- composer draft-chip persistence
- publish confirmation gating

## Risks

- X auth and refresh-token handling is security-sensitive.
- Bookmark limits mean late onboarding can never fully reconstruct old history.
- Over-eager base creation can fragment the wiki.
- Publishing is externally visible and must never be hidden behind normal chat send.
- Inbox is still a stub surface, so review flows may need a temporary holding pattern before full inbox implementation.

## First Implementation Slice

If the goal is to start immediately with the highest-value thin slice, implement:

1. `Integrations / X` connection in Settings
2. one-off `Post URL` import inside Wiki `Add Sources`
3. provider-aware X source rendering in wiki pages

That delivers an end-to-end proof that:

- Keel can connect to X
- Keel can ingest a real X post as knowledge
- Keel can render that source in a way that feels intentional

without yet taking on bookmark sync or publishing risk.
