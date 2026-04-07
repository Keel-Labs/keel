# Contributing to Keel

Read [`AGENTS.md`](./AGENTS.md) first. This file is the repo-specific companion for engineers and coding agents.

## Working Expectations

- Do not work directly on `main`.
- Keep changes narrow and reviewable.
- Prefer behavior changes and refactors in separate commits when practical.
- Treat older product specs as intent documents, not guaranteed implementation truth.
- Report the exact checks you ran before handoff.

## Codebase Shape

Keel is a local-first Electron desktop app:

- Renderer UI: `src/app/`
- Shared contracts: `src/shared/`
- Desktop boundary: `electron/`
- Core logic, storage, workflows, and connectors: `src/core/`

The repo no longer includes the old server/mobile/cloud-auth runtime as active code. The current contribution baseline is the desktop app plus its local workspace.

## Common Change Areas

| If you need to change... | Start here | Usually also check |
| --- | --- | --- |
| Chat shell or message UI | `src/app/App.tsx`, `src/app/components/Chat.tsx` | `electron/main.ts`, `src/core/contextAssembler.ts` |
| Sidebar or navigation | `src/app/components/Sidebar.tsx` | `src/app/components/DesktopTopBar.tsx`, `src/app/components/WikiWorkspace.tsx` |
| A new desktop action or command | `src/shared/types.ts` | `electron/preload.ts`, `electron/main.ts`, renderer call sites |
| Settings or provider configuration | `src/app/components/Settings.tsx` | `src/core/settings.ts`, `src/core/llmClient.ts` |
| Retrieval or search quality | `src/core/contextAssembler.ts` | `src/core/db.ts`, `src/core/embeddings.ts`, `src/core/vectorStore.ts`, `src/core/reranker.ts` |
| Capture or memory updates | `src/core/workflows/capture.ts` | `src/core/workflows/autoCapture.ts`, `src/core/workflows/memoryExtract.ts` |
| Wiki behavior | `src/core/workflows/wikiBase.ts` | `src/core/workflows/wikiIngest.ts`, `src/core/workflows/wikiMaintenance.ts`, `src/app/components/WikiWorkspace.tsx` |
| Google integrations | `src/core/connectors/googleAuth.ts` | `src/core/connectors/googleCalendar.ts`, `src/core/connectors/googleDocs.ts`, `electron/main.ts` |
| macOS packaging | `electron-builder.config.mjs` | `build/`, `scripts/build-mac-icon.sh`, `package.json` |

## Repo-Specific Gotchas

### IPC changes are multi-file changes

If you add or rename a desktop capability, you usually need to update all of these:

1. `src/shared/types.ts`
2. `electron/preload.ts`
3. `electron/main.ts`
4. the renderer component or hook using `window.keel`

Missing one of those layers is the fastest way to ship a half-wired feature.

### The user's "brain" lives outside the repo

Most durable product data is stored in the configured brain path, not under version control. Be careful not to assume a repo-local fixture when you are changing file layout or data migration logic.

### Retrieval is intentionally hybrid

- SQLite FTS is the reliable floor.
- LanceDB embeddings improve semantic retrieval when available.
- Ollama is used for embeddings and can be unavailable.

If you change retrieval, preserve a useful fallback path.

### Wiki bases have mutable and immutable layers

- `raw/` is the normalized source package layer
- `wiki/`, `outputs/`, and `health/` are generated or curated layers

Do not casually rewrite or repurpose `raw/` files.

### Specs are mixed-purpose

The `specs/` folder now contains:

- current-state contributor docs
- active product specs
- archived reference material

Start at [`specs/README.md`](./specs/README.md) before using a spec as implementation truth.

## Verification Expectations

For most non-trivial changes, run:

```bash
npm test
npm run build:desktop
```

Also run feature-specific validation when relevant:

- wiki changes: exercise base creation, source ingest, compile, and health paths
- provider/settings changes: verify save/load behavior and provider fallback assumptions
- packaging changes: run the relevant packaging command

If you cannot run a check, call that out explicitly in handoff.

## Documentation Discipline

Update docs when you change:

- IPC or renderer-to-main contracts
- workspace layout or storage paths
- contributor workflows
- product surfaces that materially alter how the repo should be understood

At minimum, keep the root [`README.md`](./README.md) and the current-state specs in sync with reality.
