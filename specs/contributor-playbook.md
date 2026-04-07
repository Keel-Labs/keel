# Contributor Playbook

This is a practical guide for making changes in Keel without rediscovering the repo from scratch each time.

## Start With The Current Reality

Before you change anything:

1. read `README.md`
2. read `specs/repository-architecture.md`
3. check whether the spec you are using is active intent or archived history
4. verify the current code path in `electron/main.ts` and the relevant renderer component

The most important repo assumption today is simple: Keel is a desktop-first local app.

## Change Recipes

### Add Or Change A Renderer Feature

Typical files:

- `src/app/App.tsx`
- `src/app/components/*`
- `src/app/styles.css`

If the feature needs new data or native behavior, also update:

- `src/shared/types.ts`
- `electron/preload.ts`
- `electron/main.ts`

### Add A New Workflow

Recommended pattern:

1. implement workflow logic in `src/core/workflows/`
2. wire it into `electron/main.ts`
3. expose it in `electron/preload.ts`
4. add the shared type contract in `src/shared/types.ts`
5. connect the renderer UI

Use existing workflows as templates:

- `capture.ts`
- `autoCapture.ts`
- `dailyBrief.ts`
- `eod.ts`
- `wikiBase.ts`
- `wikiIngest.ts`
- `wikiMaintenance.ts`

### Change Retrieval Or Context Quality

Check these together:

- `src/core/contextAssembler.ts`
- `src/core/embeddings.ts`
- `src/core/vectorStore.ts`
- `src/core/db.ts`
- `src/core/reranker.ts`

Questions to answer before shipping:

- What happens if LanceDB is unavailable?
- What happens if Ollama is unavailable?
- Does SQLite FTS still return useful context?
- Are chunk boundaries still sensible for markdown files?

### Change Wiki Behavior

Keep the workflow layers straight:

- creation: `wikiBase.ts`
- source normalization: `wikiIngest.ts`
- compile and health: `wikiMaintenance.ts`
- reading UX: `WikiWorkspace.tsx`

Rules worth preserving:

- `raw/` is the canonical normalized source layer
- wiki/source pages are readable derivatives
- compile should update synthesis and structured outputs
- health should catch structural gaps rather than silently ignoring them

### Change Settings Or Providers

Update these together:

- `src/core/settings.ts`
- `src/core/llmClient.ts`
- `src/app/components/Settings.tsx`

Be explicit about:

- defaults
- fallback behavior
- when provider-specific controls should appear

### Change Google Integration

Check these files:

- `src/core/connectors/googleAuth.ts`
- `src/core/connectors/googleCalendar.ts`
- `src/core/connectors/googleDocs.ts`
- `electron/main.ts`
- `src/app/components/Settings.tsx`

Do not document or ship behavior that depends on Google access unless the desktop OAuth flow and settings UI still support it end to end.

## Verification Matrix

### Standard Checks

Run for most non-trivial work:

```bash
npm test
npm run build:desktop
```

### When To Go Further

- packaging work: run the relevant `dist:mac*` command
- wiki workflow work: manually exercise create, ingest, compile, and health
- provider work: validate the relevant provider path and a fallback path
- session or streaming work: verify stream lifecycle and session switching behavior

## Common Failure Modes

### Half-wired IPC

Symptom:

- renderer compiles but action is undefined or does nothing

Cause:

- one of `types.ts`, preload, main, or UI wiring was missed

### Desktop Data Assumptions Leaking Into Repo Fixtures

Symptom:

- code works only with one local brain layout or test fixture

Cause:

- assuming repo files are the actual runtime workspace

### Search Regressions Hidden By Happy-Path Embeddings

Symptom:

- retrieval looks good locally with Ollama running, but degrades elsewhere

Cause:

- vector path improved while SQLite fallback got worse or was ignored

### Wiki Drift

Symptom:

- compile outputs are hard to trace back to inputs

Cause:

- source pages, raw packages, and compiled artifacts stopped linking coherently

## What Good Handoffs Should Include

- a short summary of the behavior change
- exact files or subsystems touched
- exact checks run and results
- any risks, especially around storage, provider behavior, or workflow side effects

If the repo understanding itself changed, update the current-state docs in `README.md` or `specs/`.
