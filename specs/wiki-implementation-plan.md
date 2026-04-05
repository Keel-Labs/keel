# Wiki Implementation Plan

## Goal

Turn the `LLM Knowledge Bases` and `Wiki UX` specs into a staged implementation plan for Keel.

This plan is meant to answer:

- what ships first
- what can be deferred
- which parts of the current app need to change
- how to keep the work reviewable

## Scope

This plan covers:

- renaming the current `Team Brain` shell surface to `Wiki`
- introducing a first-class wiki workspace
- adding knowledge-base storage structure
- supporting V1 ingest formats
- enabling compiled wiki navigation and page viewing

This plan does not assume a full cloud rewrite in the first slice.

## Principles

- Ship a convincing local-first wiki experience before deep cloud parity.
- Keep the first release document-first, not block-editor-first.
- Treat ingest normalization as foundational infrastructure.
- Reuse the current shell where possible.
- Prefer additive layers over rewriting Keel's existing chat architecture.

## Deliverable Shape

The work should land as a series of narrow slices, each of which leaves the app in a usable state.

Recommended sequence:

1. shell rename and placeholder wiki surface
2. local wiki workspace model
3. wiki home and page navigation
4. ingest pipeline and source packages
5. compile and health actions
6. richer views and polish

## Phase 0: Internal Alignment

Outcome:

- approved product direction
- approved UX direction
- approved V1 source list

Inputs:

- [specs/llm-knowledge-bases.md](/Users/djsam/.codex/worktrees/e0cb/Keel/specs/llm-knowledge-bases.md)
- [specs/wiki-ux.md](/Users/djsam/.codex/worktrees/e0cb/Keel/specs/wiki-ux.md)

Exit criteria:

- decide whether V1 is single-base or multi-base
- decide whether cloud parity is required in the first release
- approve `pdf`, `docx`, `pptx`, and screenshots as V1 ingest targets

## Phase 1: Shell Rename And Surface Framing

Goal:

Replace `Team Brain` with `Wiki` in the app shell and create the right product framing before deeper functionality lands.

Primary changes:

- sidebar nav label: `Teams` -> `Wiki`
- desktop top-bar mode: `Team Brain` -> `Wiki`
- app routing and view naming updated to reflect `wiki`
- placeholder copy updated to describe wiki behavior, not team collaboration

Likely files:

- [src/app/components/Sidebar.tsx](/Users/djsam/.codex/worktrees/e0cb/Keel/src/app/components/Sidebar.tsx)
- [src/app/components/DesktopTopBar.tsx](/Users/djsam/.codex/worktrees/e0cb/Keel/src/app/components/DesktopTopBar.tsx)
- [src/app/App.tsx](/Users/djsam/.codex/worktrees/e0cb/Keel/src/app/App.tsx)

Definition of done:

- user can enter a `Wiki` surface from the shell
- no `Team Brain` labels remain in the primary navigation path
- no behavior change required yet beyond framing

## Phase 2: Wiki Workspace Model

Goal:

Introduce a stable local workspace structure for wiki bases.

Primary changes:

- add `knowledge-bases/` root support
- define per-base structure
- bootstrap `overview.md`, `AGENTS.md`, `wiki/index.md`, and `wiki/log.md`
- add base discovery and listing APIs

Likely files:

- [src/core/fileManager.ts](/Users/djsam/.codex/worktrees/e0cb/Keel/src/core/fileManager.ts)
- [src/shared/types.ts](/Users/djsam/.codex/worktrees/e0cb/Keel/src/shared/types.ts)
- [electron/main.ts](/Users/djsam/.codex/worktrees/e0cb/Keel/electron/main.ts)
- [electron/preload.ts](/Users/djsam/.codex/worktrees/e0cb/Keel/electron/preload.ts)

New concepts:

- `WikiBase`
- `WikiPage`
- `WikiSection`

Definition of done:

- app can create and list wiki bases
- each base gets the expected starter structure
- wiki files are readable through the existing local app boundary

## Phase 3: Wiki Navigation And Reading UX

Goal:

Make the `Wiki` surface feel like a real wiki, not a raw file browser.

Primary changes:

- add wiki home page
- add internal wiki left rail
- add base selector
- add grouped wiki sections
- add page tree
- add right rail for page context

Likely files:

- [src/app/components/KnowledgeBrowser.tsx](/Users/djsam/.codex/worktrees/e0cb/Keel/src/app/components/KnowledgeBrowser.tsx)
- [src/app/App.tsx](/Users/djsam/.codex/worktrees/e0cb/Keel/src/app/App.tsx)
- [src/app/styles.css](/Users/djsam/.codex/worktrees/e0cb/Keel/src/app/styles.css)

Suggested approach:

- evolve `KnowledgeBrowser` into a `WikiWorkspace`-style surface instead of building a second competing reader
- keep markdown display simple in V1
- defer rich inline editing

Definition of done:

- opening `Wiki` lands on a wiki home page
- user can switch between major sections
- user can open and read wiki pages with contextual metadata

## Phase 4: Ingest Infrastructure

Goal:

Build the normalization pipeline that turns disparate source types into source packages.

Primary changes:

- implement canonical source package model
- implement ingest job model
- implement connectors and extractors for V1 formats
- store raw artifacts plus normalized markdown

V1 formats:

- URL articles
- pasted text
- markdown files
- Google Docs
- PDFs
- `.docx`
- `.pptx`
- screenshots

Likely modules:

- new workflow modules under `src/core/workflows/`
- file helpers under `src/core/`
- new IPC handlers in [electron/main.ts](/Users/djsam/.codex/worktrees/e0cb/Keel/electron/main.ts)

Recommended new workflow boundaries:

- `ingestSource`
- `extractSource`
- `normalizeSource`
- `queueCompile`

Definition of done:

- user can add a V1 source
- source becomes a normalized package under `raw/`
- failures and warnings are visible
- source is ready for compile without manual file surgery

## Phase 5: Compile And Health Workflows

Goal:

Turn ingested sources into an LLM-maintained wiki.

Primary changes:

- compile action for a base
- source summary generation
- concept page creation and updates
- `wiki/index.md` maintenance
- `wiki/log.md` append behavior
- health check report generation

Likely modules:

- new compile and health workflows under `src/core/workflows/`
- prompt and orchestration logic in existing LLM integration layers

Definition of done:

- compile updates multiple pages when needed
- wiki home has meaningful content
- health check writes a usable report
- log tracks ingest, compile, and health runs

## Phase 6: Collection Views

Goal:

Add dedicated views for sources, concepts, outputs, and health.

Primary changes:

- sources list view
- concepts list view
- outputs list view
- health screen

These should sit on top of the same underlying page and source data, not create parallel storage models.

Definition of done:

- users can browse wiki content by intent, not only by folder path
- the left rail and center pane feel coherent

## Phase 7: Search And Metadata Improvements

Goal:

Improve retrieval once the core file-first flow is working.

Primary changes:

- index wiki pages and normalized source markdown
- expose metadata filters
- improve source-aware search results
- add better backlinks and related-page calculations

Likely files:

- [src/core/db.ts](/Users/djsam/.codex/worktrees/e0cb/Keel/src/core/db.ts)
- [src/core/vectorStore.ts](/Users/djsam/.codex/worktrees/e0cb/Keel/src/core/vectorStore.ts)
- [src/core/contextAssembler.ts](/Users/djsam/.codex/worktrees/e0cb/Keel/src/core/contextAssembler.ts)

Definition of done:

- wiki queries are materially better than plain file browsing
- the app still treats markdown pages as the primary human-readable artifact

## Suggested Milestones

### Milestone A: Shell And Skeleton

Includes:

- Phase 1
- enough of Phase 2 to create a base and render a stub wiki home

User-visible result:

- `Wiki` exists in the shell and feels like a new space

### Milestone B: Readable Wiki

Includes:

- remaining Phase 2
- Phase 3

User-visible result:

- user can navigate a real wiki structure and read pages comfortably

### Milestone C: Real Ingest

Includes:

- Phase 4

User-visible result:

- user can bring in the promised V1 source types

### Milestone D: Compounding Knowledge Loop

Includes:

- Phase 5

User-visible result:

- sources compile into wiki pages and health checks

### Milestone E: Browsable Collections

Includes:

- Phase 6
- selected Phase 7 items

User-visible result:

- wiki feels like a product, not a prototype

## Testing Strategy

### Targeted Checks By Phase

Phase 1:

- component render checks for renamed navigation

Phase 2:

- file-manager tests for base bootstrap and listing
- preload and IPC tests where practical

Phase 3:

- UI tests for wiki navigation and page selection

Phase 4:

- ingestion tests per supported source type
- normalization contract tests
- duplicate and warning-path tests

Phase 5:

- compile workflow smoke tests
- health workflow smoke tests
- index/log update tests

### Default Required Checks

At minimum for each implementation PR:

- targeted tests for touched code
- `npm test` if the touched area is covered by the current test suite
- relevant manual verification for desktop wiki flows

## Risks

### V1 Ingest Breadth

Supporting `pdf`, `docx`, `pptx`, and screenshots in V1 is the right product call, but it increases the infrastructure burden immediately.

Mitigation:

- keep the source package contract simple
- accept partial extraction with warnings
- do not over-promise fidelity

### UX Drift

If the first implementation leans too hard on raw file trees, the feature will feel unfinished.

Mitigation:

- ship the wiki home page early
- keep document reading central

### Over-Coupling To Team Brain

The old surface and data model may pull implementation toward shared-team assumptions.

Mitigation:

- treat `Wiki` as its own product concept
- reuse components, not framing

## Open Decisions

- single-base versus multi-base V1
- how much right-rail context to ship in the first pass
- whether compile happens manually first or automatically after ingest
- whether cloud metadata tables are in scope before local-first V1 is solid

## Recommendation

The best first implementation sequence is:

1. rename and reframe the shell
2. create a real local wiki workspace
3. make it pleasant to browse and read
4. build ingest normalization
5. layer on compile and health

That sequence keeps risk contained while still getting to the actual product loop.
