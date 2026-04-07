# Chat Wiki Context Selector Spec

## Goal

Add a new composer action menu in chat that lets the user:

- attach images
- attach a document
- assign a wiki base to the current chat session

Once a wiki base is assigned, Keel should use it as scoped context for that chat session so the assistant can answer against the selected knowledge base instead of treating the wiki as a generic background folder.

This spec also defines a `Dig Deep` mode for chat retrieval:

- default mode: search compiled wiki pages only
- `Dig Deep` on: search compiled pages, raw source packages, and generated outputs

## Resolved Product Decisions

- One wiki base per chat session in V1.
- Wiki-base selection persists for the full current chat session.
- No manual removal in V1.
- The `+` button becomes the primary composer action button.
- The existing image attach action moves into the `+` menu and is labeled `Attach Images`.
- Add a new `Attach Document` action to the same menu.
- Add a new `Add Wiki Base` action to the same menu.
- Chat remains unchanged when no wiki base is selected.
- Wiki-backed answers should show explicit wiki citations.
- Opening behavior should be click-first, not hover-first.

## Scope

This spec covers:

- chat composer UI changes
- wiki-base picker menu and submenu behavior
- session-level persistence of selected wiki base
- retrieval behavior for selected wiki bases
- explicit citation behavior in answers
- minimum renderer, preload, Electron, and core changes needed to support the feature

This spec does not cover:

- multi-wiki chat sessions
- manual removal of a wiki base from an existing session
- cloud/mobile parity
- document attachment extraction details beyond the composer contract

## UX Summary

### Composer Changes

Replace the current single-purpose image button in the chat composer with a new `+` button.

The `+` button opens a menu anchored to the composer. The menu should open upward or downward based on available viewport space. The choice should be automatic and should not require a separate design mode.

Top-level actions:

- `Attach Images`
- `Attach Document`
- `Add Wiki Base`

If the menu cannot fit below the composer, it should render as a drop-up. If it cannot fit above, it should render as a drop-down. The behavior should mirror the existing model menu’s anchoring logic, but with enough room for nested content.

### Wiki Base Submenu

Selecting `Add Wiki Base` opens a nested submenu.

Behavior:

- click is the default open behavior
- on pointer devices, hover may also reveal the submenu once the parent menu is already open
- keyboard navigation must also work

Submenu contents:

- search input at the top
- a scrollable list of matching wiki bases
- if there are only five or six bases, show them all without extra pagination

The search field should filter wiki bases by at least:

- title
- slug
- optional description from `overview.md` if available cheaply

### Selected Wiki Base Display

Once a wiki base is chosen for the chat session, the composer should visibly show that the session is scoped.

Recommended V1 presentation:

- a persistent session chip above or inside the composer footer
- label example: `Wiki Base: Research Base`

V1 rule:

- the selected wiki base cannot be removed from that session
- the selected wiki base also cannot be changed in-place in that session
- choosing a different wiki base requires starting a new chat

This keeps the session context stable and avoids muddy retrieval/memory behavior.

### Dig Deep Toggle

Add a composer-level toggle labeled `Dig Deep`.

Behavior:

- visible only when a wiki base is selected
- off by default for a new chat session
- when off, chat uses compiled wiki pages only
- when on, chat uses compiled wiki pages, raw source packages, and outputs

Assumption for V1:

- `Dig Deep` is sticky within the current chat session and resets to off for a new session

## User Flows

### Flow 1: Normal Chat

1. User opens chat.
2. No wiki base is selected.
3. Composer behaves exactly as it does today.
4. Chat context assembly uses the existing personal and team brain flow only.

### Flow 2: Assign Wiki Base To Session

1. User clicks `+`.
2. User clicks `Add Wiki Base`.
3. User sees the wiki-base submenu with search and a list of available bases.
4. User selects one wiki base.
5. The chat session is marked as scoped to that wiki base.
6. Future messages in that session use the selected wiki base for retrieval.

### Flow 3: Ask With Default Wiki Context

1. User has a wiki base selected.
2. `Dig Deep` is off.
3. User sends a message.
4. Keel retrieves only compiled wiki pages from that base.
5. Answer includes explicit citations to the wiki pages used.

### Flow 4: Ask With Dig Deep

1. User has a wiki base selected.
2. User turns `Dig Deep` on.
3. User sends a message.
4. Keel retrieves from:
   - compiled wiki pages
   - raw source packages
   - outputs
5. Answer includes explicit citations to the sources used.

## Information Architecture And Data Model

### Chat Session Metadata

The current chat session model stores only `messages`.

This feature requires session-level metadata that is not naturally represented as a user message. V1 should introduce structured session metadata for persisted chats.

Recommended session metadata shape:

```ts
type ChatSessionMetadata = {
  wikiBasePath?: string;
  wikiBaseTitle?: string;
  wikiBaseSlug?: string;
  digDeep?: boolean;
};
```

Recommended persisted session shape:

```ts
type StoredChatSession = {
  messages: Message[];
  metadata?: ChatSessionMetadata;
};
```

Backward-compatibility requirement:

- older sessions that contain only message arrays must still load correctly
- missing metadata must be treated as `no wiki base selected`

### Wiki Base Discovery Model

The renderer needs a lightweight wiki-base listing API rather than raw folder inspection in the chat component.

Recommended new type:

```ts
type WikiBaseSummary = {
  basePath: string;
  slug: string;
  title: string;
  description?: string;
  updatedAt: number;
};
```

The source of truth should remain the actual `knowledge-bases/<slug>/` folders.

## Retrieval Model

### Default Chat Behavior

If no wiki base is selected:

- use the existing `ContextAssembler`
- do not change prompt shape
- do not change retrieval behavior

### Wiki-Scoped Chat Behavior

If a wiki base is selected:

- keep the existing personal/team context assembly
- add a wiki-scoped retrieval layer on top
- include only results from the selected wiki base

This should be additive, not a rewrite of the current chat architecture.

### Retrieval Sources By Mode

When a wiki base is selected and `Dig Deep` is off, search only:

- `knowledge-bases/<base>/wiki/index.md`
- `knowledge-bases/<base>/wiki/concepts/**/*.md`
- `knowledge-bases/<base>/wiki/open-questions/**/*.md`
- `knowledge-bases/<base>/wiki/sources/**/*.md`
  Note: in V1 “compiled wiki pages” should mean pages under `wiki/`. That includes wiki-authored source pages, but not raw packages or outputs.

When a wiki base is selected and `Dig Deep` is on, additionally search:

- `knowledge-bases/<base>/raw/**/source.md`
- `knowledge-bases/<base>/outputs/**/*.md`
- optionally `health/latest.md` if useful for completeness or caveats

### Retrieval Depth

The retrieval layer should favor depth and relevance within the selected wiki base, not broad brain-wide recall.

V1 requirements:

- bias ranking toward the selected wiki base over global results
- return fewer, denser chunks rather than many thin snippets
- preserve file-path provenance for every returned chunk
- prefer compiled pages first when scores are similar
- in `Dig Deep`, raw packages and outputs can outrank compiled pages only when materially more relevant

## Prompt And Answering Contract

### System / Retrieval Context

When wiki context is active, the model should receive an explicit scoped context section that states:

- which wiki base is active
- whether `Dig Deep` is enabled
- which retrieved pages were included
- that answers should cite the wiki files used

Recommended instruction shape:

- answer from the selected wiki base when relevant
- if the wiki does not contain enough evidence, say so
- do not imply unsupported certainty
- include explicit citations using the retrieved wiki paths

### Citation Format

V1 answer requirement:

- every wiki-grounded answer should include explicit citations inline or in a short trailing citation block

Recommended citation format:

- `[wiki/concepts/compiled/retrieval-as-memory-infrastructure.md]`
- `[raw/agent-memory/source.md]`
- `[outputs/reports/latest-synthesis.md]`

The format should be plain text or markdown-safe and should not depend on a special renderer.

## Technical Design

### Renderer

Primary file:

- `src/app/components/Chat.tsx`

Expected changes:

- replace the current image button with a `+` action button
- add top-level action menu
- add nested wiki-base submenu with search
- add selected wiki-base session indicator
- add `Dig Deep` toggle
- store chat session metadata alongside messages in component state
- prevent wiki-base mutation once selected for that session

### Shared Types

Primary file:

- `src/shared/types.ts`

Expected additions:

- `ChatSessionMetadata`
- `StoredChatSession`
- `WikiBaseSummary`
- chat IPC request shapes that can carry session metadata

### Preload And IPC

Primary files:

- `electron/preload.ts`
- `electron/main.ts`

Expected additions:

- list wiki-base summaries for the chat composer
- save/load chat sessions with metadata
- accept chat requests that include session metadata and current `Dig Deep` state

### Core Retrieval

Primary files:

- `src/core/contextAssembler.ts`
- new wiki-scoped retrieval helper under `src/core/`
- optionally persistence/index helpers under `src/core/db.ts`

Recommended approach:

- keep `ContextAssembler` for global Keel context
- add a separate wiki context assembly step for selected bases
- merge the wiki section into the final prompt only when a wiki base is active

Recommended helper boundary:

```ts
assembleWikiContext({
  basePath,
  query,
  digDeep,
}): Promise<{
  context: string;
  citations: string[];
}>
```

### Search / Indexing

V1 should reuse existing indexing infrastructure where possible.

Requirements:

- wiki retrieval must be filterable by base path prefix
- wiki retrieval must preserve file path provenance
- `Dig Deep` needs path-based inclusion rules for `raw/` and `outputs/`

If the current DB/vector search layer cannot cleanly scope by base prefix, add that capability before wiring the feature into chat.

## Attach Images And Attach Document

This spec is primarily about wiki-scoped chat, but the `+` menu also becomes the new home for message attachments.

### Attach Images

- preserve current behavior
- relabel the action to `Attach Images`

### Attach Document

V1 expectation:

- opens a native file picker
- attaches a document to the current message flow rather than ingesting it into a wiki base
- document extraction and prompt-enrichment details can follow the same general pattern as existing image enrichment: additive to the outbound user message, not a new persistent knowledge workflow

Accepted file types for V1 can be finalized during implementation, but should align with existing document extraction capabilities where practical.

## Constraints

- No behavior regression for normal chat.
- No multi-wiki retrieval in V1.
- No manual remove/change action once a wiki base is chosen in a session.
- The feature should remain local-first and work against the existing `knowledge-bases/` folder model.
- The UI must be keyboard-accessible and not rely on hover-only interaction.

## Risks

### Session Persistence Risk

The current persisted chat format is messages-only. Adding metadata requires careful backward compatibility.

### Retrieval Quality Risk

If wiki retrieval is not strongly scoped by base and path type, `Dig Deep` could swamp the prompt with low-signal raw material.

### UX Clarity Risk

If the selected wiki base is not visibly persistent in the composer, users will not know why answers changed.

### Citation Drift Risk

If citations are not sourced from the actual retrieved file list, the model may invent references.

## Acceptance Criteria

- A new `+` button exists in the composer and replaces the current standalone image button.
- Clicking `+` shows actions for `Attach Images`, `Attach Document`, and `Add Wiki Base`.
- The action menu automatically opens upward or downward based on available space.
- Clicking `Add Wiki Base` opens a searchable submenu of available wiki bases.
- If there are only a handful of wiki bases, they are all listed directly.
- Selecting a wiki base scopes the current chat session to that base.
- The selected wiki base is visibly shown in the composer.
- The selected wiki base persists when the session is saved and later reopened.
- The selected wiki base cannot be removed or changed within that same chat session in V1.
- When no wiki base is selected, chat behavior is unchanged from today.
- When a wiki base is selected and `Dig Deep` is off, retrieval uses only `wiki/` pages from that base.
- When `Dig Deep` is on, retrieval also includes `raw/` and `outputs/` content from that base.
- Wiki-grounded answers include explicit citations based on retrieved file paths.

## Likely Files

- `src/app/components/Chat.tsx`
- `src/app/styles.css`
- `src/shared/types.ts`
- `electron/preload.ts`
- `electron/main.ts`
- `src/core/contextAssembler.ts`
- `src/core/db.ts`
- new wiki-retrieval helper under `src/core/`

## Recommended Implementation Order

1. Add persisted chat session metadata and backward-compatible load/save behavior.
2. Add wiki-base summary listing API.
3. Build the composer `+` menu and wiki-base submenu UI.
4. Show selected wiki-base session state in the composer.
5. Add `Dig Deep` toggle and pass session metadata with chat requests.
6. Add wiki-scoped retrieval helper and prompt section.
7. Enforce explicit citations from retrieved file paths.
8. Add tests for metadata persistence, scoped retrieval, and no-selection fallback.
