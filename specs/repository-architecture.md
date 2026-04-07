# Repository Architecture

This document describes the implemented repository shape as of the current desktop-first Keel codebase.

## Snapshot

Keel is a local-first Electron desktop application with:

- a React renderer
- a preload-based desktop API bridge
- an Electron main process that owns native integration and orchestration
- a TypeScript core layer for retrieval, workflows, and storage
- a local markdown workspace plus local SQLite and optional LanceDB indexes

Recent commit history explains the current shape:

- `74ddc4d` removed the old Fly.io server, mobile/Capacitor app, and cloud auth runtime.
- `102edf8`, `9e381ec`, `96d51be`, and `7b4cc90` added the current wiki workspace and lifecycle.
- `9827766`, `93d289d`, `a127c0c`, and `d2d03c4` refined memory extraction, auto-capture, Google Doc export behavior, and response guardrails.

## Runtime Boundaries

### Renderer

Location: `src/app/`

Responsibilities:

- app shell and navigation
- chat experience
- onboarding
- settings UI
- wiki workspace UI
- session state and desktop layout state

Key entrypoints:

- `src/app/index.tsx`
- `src/app/App.tsx`
- `src/app/components/Chat.tsx`
- `src/app/components/WikiWorkspace.tsx`
- `src/app/components/Settings.tsx`

### Preload Bridge

Location: `electron/preload.ts`

Responsibilities:

- exposes `window.keel`
- translates renderer calls into typed IPC invocations
- subscribes to streaming and notification events

This file is the contract bridge between renderer and Electron main.

### Electron Main Process

Location: `electron/main.ts`

Responsibilities:

- application lifecycle and window creation
- utility windows
- tray and shortcuts
- IPC handlers
- workflow orchestration
- file watching and indexing
- notification scheduling
- Google integrations

This is the operational hub of the desktop app.

### Core Logic

Location: `src/core/`

Responsibilities:

- settings and provider selection
- retrieval and context assembly
- markdown workspace management
- embedding and chunk indexing
- wiki workflows
- capture and memory workflows
- Google connector implementation

## Data And Storage Model

### Stable Settings

`src/core/settings.ts` stores settings in an OS-stable config directory and mirrors them into the legacy `<brainPath>/.config/settings.json` path for compatibility.

Important fields:

- provider and model selection
- local workspace path (`brainPath`)
- optional team brain path
- timezone and scheduling preferences

### Local Workspace

Managed by `src/core/fileManager.ts`.

Default structure:

```text
keel.md
tasks.md
projects/
daily-log/
knowledge-bases/
```

Important rules:

- `keel.md` stores the user profile and high-level project context.
- `tasks.md` stores general tasks.
- `projects/*/context.md` and `projects/*/tasks.md` are long-lived project files.
- `knowledge-bases/*/` contains wiki bases with `raw/`, `wiki/`, `outputs/`, and `health/`.
- `TeamFileManager` mirrors similar rules for the optional shared team workspace.

### SQLite

Managed by `src/core/db.ts`, stored at `<brainPath>/.config/keel.db`.

Current tables:

- `file_index`
- `files`
- `chunks`
- `chunks_fts`
- `activity_log`
- `chat_sessions`
- `reminders`
- `sync_state`

Practical meaning:

- markdown files are indexed into chunk records
- search has a dependable FTS path even when vector search is unavailable
- sessions and reminders are database-backed

### Vector Search

Managed by `src/core/embeddings.ts` and `src/core/vectorStore.ts`.

Behavior:

- markdown files are chunked via Markdown AST structure
- Ollama embeddings are used when available
- LanceDB is optional and may be unavailable on some systems
- SQLite chunk storage remains the stable baseline

## Core User Flows

### Chat

Primary files:

- `src/app/components/Chat.tsx`
- `electron/main.ts`
- `src/core/llmClient.ts`
- `src/core/contextAssembler.ts`

Flow:

1. renderer sends messages via `window.keel.chatStream`
2. main process assembles context and calls `LLMClient`
3. stream chunks are sent back over IPC
4. sessions are persisted in SQLite
5. post-response workflows can update memory and auto-capture context

### Memory Extraction And Auto-Capture

Primary files:

- `src/core/workflows/memoryExtract.ts`
- `src/core/workflows/autoCapture.ts`
- `src/core/workflows/capture.ts`

Behavior:

- recent user messages are inspected after chat activity
- explicit facts are written back into `keel.md` and task files
- substantial context can be auto-captured into a project or standalone capture file
- capture can also feed a matching wiki base when one exists

### Wiki Lifecycle

Primary files:

- `src/core/workflows/wikiBase.ts`
- `src/core/workflows/wikiIngest.ts`
- `src/core/workflows/wikiMaintenance.ts`
- `src/app/components/WikiWorkspace.tsx`

Lifecycle:

1. create a base under `knowledge-bases/<slug>/`
2. ingest a source from URL, pasted text, or supported files
3. normalize it into `raw/<source-slug>/`
4. materialize readable wiki pages under `wiki/`
5. compile synthesis, concepts, and open questions into `outputs/` and compiled wiki sections
6. run health checks over raw packages, source pages, backlinks, and staleness

### Daily Briefs, EOD, And Reminders

Primary files:

- `src/core/workflows/dailyBrief.ts`
- `src/core/workflows/eod.ts`
- `src/core/db.ts`
- `electron/main.ts`

Behavior:

- brief and EOD content are generated from the local workspace and recent sessions
- outputs are written to `daily-log/`
- reminders are stored in SQLite and surfaced through desktop notifications

### Google Integrations

Primary files:

- `src/core/connectors/googleAuth.ts`
- `src/core/connectors/googleCalendar.ts`
- `src/core/connectors/googleDocs.ts`

Current uses:

- OAuth connection state
- Calendar sync and event creation
- Google Doc read and export support

## Module Map

### `src/app/`

Use this layer for:

- UI state
- navigation
- presentation logic
- renderer-only interactions with `window.keel`

Do not put filesystem or native process logic here.

### `src/shared/`

Use this layer for:

- shared types
- IPC contracts
- shapes passed across the renderer/main boundary

### `src/core/`

Use this layer for:

- reusable business logic
- storage and retrieval
- workflow orchestration helpers
- provider and connector logic

### `electron/`

Use this layer for:

- OS integration
- windows
- IPC plumbing
- process lifecycle

## Common Change Rules

### Adding A New Desktop Capability

Usually update:

1. `src/shared/types.ts`
2. `electron/preload.ts`
3. `electron/main.ts`
4. the renderer caller

### Changing Retrieval

Check both:

- semantic path: embeddings plus LanceDB
- fallback path: SQLite FTS and chunk records

### Changing Wiki Behavior

Preserve the current distinction between:

- normalized raw packages
- wiki pages
- output artifacts
- health reports

### Changing Settings

Check:

- default values in `src/core/settings.ts`
- persistence and normalization behavior
- UI wiring in `src/app/components/Settings.tsx`
- downstream consumers such as `LLMClient` or workflow modules

## Practical Reading Order For New Contributors

1. `README.md`
2. `src/shared/types.ts`
3. `electron/preload.ts`
4. `electron/main.ts`
5. the relevant `src/core/workflows/*` file for your feature area
6. the renderer component you plan to edit
