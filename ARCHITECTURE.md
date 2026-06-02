# Architecture

This document describes how Keel is organized, how the pieces fit together at runtime, and where to look when making specific kinds of changes. If you're trying to install or use Keel, see [README.md](./README.md). If you're contributing code, see [CONTRIBUTING.md](./CONTRIBUTING.md) for process and this file for the map.

---

## Runtime overview

Keel is an Electron app with a React renderer and a TypeScript core. Three things are happening at any given moment:

1. **The renderer** (`src/app/`) is a React UI — chat, wiki, settings, sidebar — running in Electron's renderer process. It talks to the rest of the app only through `window.keel`, a safe IPC bridge exposed by `electron/preload.ts`.
2. **The main process** (`electron/main.ts`) owns the Electron shell, IPC handlers, the scheduler, and workflow orchestration. This is where requests from the UI get routed to core logic.
3. **The core** (`src/core/`) implements the actual business logic — talking to LLM providers, reading and writing the workspace, indexing, retrieval, capture, wiki compile, and so on. The core has no UI dependencies and could be lifted out and run headless.

User data lives outside the repo, in the workspace path the user picks during onboarding (default `~/Keel`). Settings live in an OS-specific config directory.

### One-minute version

```
React UI (src/app/)
    │
    │  window.keel.*  (typed IPC)
    ▼
preload.ts ──► main.ts ──► src/core/
                              │
                              ├── llmClient.ts        (provider routing, fallback)
                              ├── contextAssembler.ts (system prompt construction)
                              ├── fileManager.ts      (workspace I/O)
                              ├── db.ts               (SQLite + FTS)
                              ├── embeddings.ts       (vectorization)
                              ├── vectorStore.ts      (LanceDB, optional)
                              └── workflows/          (capture, wiki, briefs)
```

---

## Repository structure

| Path | Purpose |
|------|---------|
| `electron/` | Main process, IPC handlers, window management, packaging entry points |
| `src/app/` | React renderer UI — desktop shell, chat, wiki, settings, onboarding |
| `src/core/` | LLM client, storage, retrieval, workflows, wiki logic, integrations |
| `src/shared/` | TypeScript contracts between renderer and main process |
| `docs/` | Design guidance and UI style reference |
| `specs/` | Product specs and contributor playbooks |
| `build/` | Packaging assets, app icons, entitlements |

---

## Key files by area

When making a change, these are the files you'll most often need to touch.

**Chat and desktop UI**
- `src/app/App.tsx`
- `src/app/components/Chat.tsx`
- `src/app/components/Sidebar.tsx`

**IPC and desktop integration**
- `src/shared/types.ts` — typed contract between renderer and main
- `electron/preload.ts` — what `window.keel` exposes
- `electron/main.ts` — handlers and orchestration

**Settings and providers**
- `src/app/components/Settings.tsx`
- `src/core/llmClient.ts`

**Retrieval and memory**
- `src/core/contextAssembler.ts` — builds the system prompt
- `src/core/db.ts` — SQLite schema and FTS
- `src/core/workflows/memoryExtract.ts` — auto-capture logic

**Wiki**
- `src/app/components/WikiWorkspace.tsx`
- `src/core/workflows/wikiIngest.ts`
- `src/core/workflows/wikiMaintenance.ts`

**Google integrations**
- `src/core/connectors/googleAuth.ts`
- `src/core/connectors/googleCalendar.ts`

---

## Storage and indexing

| Concern | Where |
|---------|-------|
| User workspace (markdown, projects, wikis) | `<workspace>` path, default `~/Keel` |
| Chat sessions and reminders | SQLite at `<workspace>/.config/keel.db` |
| Full-text search | SQLite FTS (always on) |
| Vector search | LanceDB at `<workspace>/.config/lancedb` (optional) |
| Settings | OS-specific config dir, see README |

SQLite FTS is the reliable baseline. LanceDB is optional and may not be available on all systems — code that depends on it should degrade gracefully.

---

## Conventions for contributors

A few rules that prevent the most common mistakes:

**IPC changes are four-file changes.** Any new or modified IPC method needs updates in this exact order:
`src/shared/types.ts` → `electron/preload.ts` → `electron/main.ts` → renderer callers. Skipping a step will break the build or fail at runtime.

**Wiki has a strict raw vs. generated split.** The `raw/` subfolder under each knowledge base holds source material the user provided. The `wiki/` subfolder holds compiled output. Never write generated content back to `raw/`, and never expect users to hand-edit `wiki/`.

**The user's workspace is sacred.** The local brain path (`~/Keel` by default) is user-owned. Code should never modify it without explicit user intent — no migrations, no automatic cleanup, no "helpful" reorganization.

**Desktop-first, always.** Assume desktop behavior unless explicitly told otherwise. Web/mobile considerations come later.

---

## Notes for AI agents working in this codebase

If you're an LLM-based assistant making changes here:

- Read this file and `CONTRIBUTING.md` before making non-trivial changes.
- The four-file IPC rule above is the most common failure mode. Check it.
- Preserve the `raw/` vs. `wiki/` distinction in any wiki-related change.
- SQLite FTS is the baseline; do not assume LanceDB is available.
- Never modify the user's workspace path without explicit instruction from the user, even if it looks like cleanup is "obviously" needed.
- When in doubt about scope, prefer a smaller change and a clear note over a sweeping refactor.
