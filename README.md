# Keel

Keel is a desktop-first personal AI chief of staff built with Electron, React, and TypeScript. It keeps a local markdown workspace, assembles context from that workspace at chat time, supports wiki-style knowledge bases, and layers capture, reminders, Google integrations, and packaging workflows on top.

This repository is in an active transition phase. The recent commit history matters:

- `74ddc4d` removed the old Fly.io server, mobile/Capacitor app, and cloud auth paths.
- `102edf8`, `9e381ec`, `96d51be`, and `7b4cc90` introduced the current wiki workspace, source ingest, compile, and health-check flow.
- `9827766`, `93d289d`, `a127c0c`, and `d2d03c4` tightened chat memory extraction, auto-capture, Google Doc export behavior, and response guardrails.
- `3203c4c` added Mac DMG packaging support.

If you are contributing, treat Keel as a local desktop app first. Older specs may describe ideas that are still useful, but they are not always the implemented state.

## What Keel Does Today

- Streams AI chat through a desktop Electron shell.
- Stores user context in a local markdown "brain" outside the repo.
- Persists chat sessions, reminders, file indexes, and search chunks in SQLite.
- Uses hybrid retrieval: SQLite FTS is the baseline and LanceDB vector search is optional.
- Supports multiple AI backends: Claude, OpenAI, OpenRouter, and Ollama.
- Auto-captures substantial chat context back into the user's workspace.
- Generates daily briefs and end-of-day summaries from the local workspace.
- Supports local wiki bases with source ingest, compile, and health-check workflows.
- Integrates with Google Calendar and Google Docs for sync, export, and document reads.
- Packages the desktop app for macOS via `electron-builder`.

## Repository Map

| Path | Responsibility |
| --- | --- |
| `electron/` | Main-process app shell, IPC handlers, desktop integration, packaging entrypoints |
| `src/app/` | React renderer, desktop shell UI, onboarding, settings, chat, wiki workspace |
| `src/core/` | LLM client, storage, retrieval, workflows, wiki logic, connectors |
| `src/shared/` | Shared TypeScript contracts between renderer and Electron |
| `docs/` | Design guidance and durable reference docs |
| `specs/` | Product specs plus current-state contributor docs |
| `build/` | Packaging assets and entitlements |
| `scripts/` | Small build helpers |

## Architecture In One Minute

1. The React renderer in `src/app/` renders the shell and calls `window.keel`.
2. `electron/preload.ts` exposes that safe IPC bridge to the renderer.
3. `electron/main.ts` owns app startup, windows, IPC handlers, scheduling, and workflow orchestration.
4. `src/core/` implements the business logic:
   - `llmClient.ts` chooses the active AI provider and falls back when needed.
   - `contextAssembler.ts` builds the system prompt context from markdown files plus search.
   - `fileManager.ts` owns the local brain and wiki filesystem structure.
   - `db.ts`, `embeddings.ts`, and `vectorStore.ts` power indexing and retrieval.
   - `workflows/` contains capture, memory extraction, wiki ingest/compile/health, daily brief, and EOD flows.
5. User data lives outside the repo in the configured brain path, while settings live in a stable OS-specific config directory.

## Local Data Model

### Settings

- Stable config path:
  - macOS: `~/Library/Application Support/Keel/settings.json`
  - Windows: `%APPDATA%/Keel/settings.json`
  - Linux: `$XDG_CONFIG_HOME/keel/settings.json`
- Legacy compatibility copy: `<brainPath>/.config/settings.json`
- Overrides:
  - `KEEL_DEFAULT_BRAIN_PATH`
  - `KEEL_CONFIG_DIR`

### Brain Workspace

By default Keel creates a local workspace such as `~/Keel` with:

```text
keel.md
tasks.md
projects/
daily-log/
knowledge-bases/
```

Important substructures:

- `projects/*/context.md`: long-lived project context
- `projects/*/tasks.md`: project task lists
- `projects/captures/`: standalone captures
- `daily-log/*.md`: daily brief and EOD output
- `knowledge-bases/*/`: wiki bases with `raw/`, `wiki/`, `outputs/`, and `health/`

### Search And Persistence

- SQLite database: `<brainPath>/.config/keel.db`
- Optional LanceDB vector index: `<brainPath>/.config/lancedb`
- Chat sessions and reminders are stored in SQLite, not in repo files.

## Getting Started

### Prerequisites

- A recent Node.js and npm install
- macOS desktop build tooling if you plan to package the app
- Optional: Ollama if you want local chat or embedding support

### Install

```bash
npm install
```

### Run The Desktop App In Development

```bash
npm run dev:electron
```

This starts:

- the Vite renderer dev server
- the Electron TypeScript watcher
- the Electron desktop shell

### Common Commands

```bash
npm test
npm run build:desktop
npm run dist:mac
```

- `npm test`: runs the Vitest suite
- `npm run build:desktop`: builds the renderer and Electron main process
- `npm run dist:mac`: creates a macOS DMG build

## Where To Start When Changing Things

- Chat UI or desktop shell behavior:
  - `src/app/App.tsx`
  - `src/app/components/Chat.tsx`
  - `src/app/components/Sidebar.tsx`
  - `src/app/components/DesktopTopBar.tsx`
- IPC surface or desktop integrations:
  - `src/shared/types.ts`
  - `electron/preload.ts`
  - `electron/main.ts`
- Settings and provider behavior:
  - `src/app/components/Settings.tsx`
  - `src/core/settings.ts`
  - `src/core/llmClient.ts`
- Retrieval, indexing, and memory behavior:
  - `src/core/contextAssembler.ts`
  - `src/core/db.ts`
  - `src/core/embeddings.ts`
  - `src/core/vectorStore.ts`
  - `src/core/workflows/memoryExtract.ts`
  - `src/core/workflows/autoCapture.ts`
- Wiki features:
  - `src/app/components/WikiWorkspace.tsx`
  - `src/core/workflows/wikiBase.ts`
  - `src/core/workflows/wikiIngest.ts`
  - `src/core/workflows/wikiMaintenance.ts`
- Google integrations:
  - `src/core/connectors/googleAuth.ts`
  - `src/core/connectors/googleCalendar.ts`
  - `src/core/connectors/googleDocs.ts`

## Documentation Map

- [`AGENTS.md`](./AGENTS.md): repo operating rules and branch discipline
- [`CONTRIBUTING.md`](./CONTRIBUTING.md): codebase-specific contributor guidance
- [`specs/README.md`](./specs/README.md): specs index with active vs archived docs
- [`specs/repository-architecture.md`](./specs/repository-architecture.md): current runtime and storage map
- [`specs/contributor-playbook.md`](./specs/contributor-playbook.md): change recipes and repo-specific gotchas
- [`specs/recent-product-evolution.md`](./specs/recent-product-evolution.md): commit-log-based repository timeline
- [`docs/UI_STYLE_GUIDE.md`](./docs/UI_STYLE_GUIDE.md): current UI styling reference

## Notes For Codex And Other Agents

- Assume desktop-first behavior unless a spec explicitly says otherwise.
- Treat `specs/cloud-mobile-architecture.md` as historical reference, not current implementation.
- When you change IPC, update the shared type, preload bridge, main-process handler, and renderer callers together.
- When you change wiki behavior, preserve the distinction between `raw/` source packages and generated wiki/output files.
- When you change retrieval, remember SQLite FTS is the reliable baseline and LanceDB may be unavailable on some setups.
