# Post-launch: Project KB UX upgrades

Captured during pre-launch polish. Two follow-ups to the per-project knowledge base feature (`/create-kb`, `/refresh-kb`). Both deferred from V1 to keep the launch surface small. Sequenced cheapest-first.

## Context

V1 ships with:
- `/create-kb [project name]` and `/refresh-kb [project name]` slash commands.
- Manifest at `projects/{slug}/.keel-kb.json` tracking ingested files + mtimes.
- IPC handlers in `electron/main.ts` (`keel:project-kb-status/create/refresh`).
- Workflow in `src/core/workflows/projectKnowledgeBase.ts`.
- System prompt instructs the LLM to tell the user to run the slash command when they ask in natural language.

What V1 does **not** do:
- Cannot be invoked from natural language ("create a KB for my X project") — only via the slash command.
- Does not auto-refresh when files change — user has to run `/refresh-kb` manually.

---

## Item A — Auto-refresh

**Goal:** the user never thinks about `/refresh-kb`. KBs stay current as files land.

The `refreshProjectKB` workflow is already idempotent and mtime-skips — re-running it on an unchanged project costs almost nothing. So we just need triggers.

**Recommended approach: watcher + launch sweep.**

1. **Filesystem watcher** (`chokidar`, already a dep)
   - On app start, scan `projects/*/.keel-kb.json` to find projects with KBs.
   - Watch each of those project folders for changes to supported file types (`.md`, `.markdown`, `.txt`, `.pdf`, `.docx`, `.pptx`).
   - Debounce per-project (~30s) to coalesce bursts (e.g. unzipping a folder).
   - On fire, call `refreshProjectKB(slug, fileManager)` and emit a subtle toast or activity-log entry.
   - When a new project KB is created during the session, register its watcher dynamically.

2. **Launch sweep**
   - On app start (after `app.on('ready')` and brain init), iterate every project with a `.keel-kb.json` and call `refreshProjectKB` once. Cheap because of mtime skipping. Catches up anything the watcher missed while the app was closed.

**Files to touch:**
- `electron/main.ts` — register watcher + launch sweep, both during the same init block where existing chokidar watchers live (search for existing `chokidar` usage).
- `src/core/workflows/projectKnowledgeBase.ts` — add a small helper `listProjectsWithKB(fileManager): Promise<string[]>` to enumerate projects with manifests. Trivially: read `projects/`, filter dirs whose `.keel-kb.json` exists.

**Estimate:** ~2 hours.

**Verification:**
- App running, drop a new `.md` into a project with a KB, wait 30s, confirm the wiki base picked it up.
- Quit app, drop a new file, relaunch, confirm launch sweep ingested it.
- Drop 10 files at once, confirm only one refresh runs (debounce).

**Edge cases worth noting:**
- Files written via `/capture` into project folders should trigger the watcher naturally. No extra hook needed.
- A project rename (slug change) — the manifest still references the old wiki base slug, which is fine; the KB doesn't need to rename. But the watcher path needs to track the new project folder. Easiest: rebuild watchers on project rename event.
- Don't auto-refresh during onboarding ingest — there's already a separate ingest path for that and double-ingestion would be wasteful.

---

## Item B — Natural-language invocation via real tool calling

**Goal:** "Build a knowledge base for my Social media project" works without a slash command.

Today the LLM has no tools — `llmClient.ts` calls `messages.create()` with no `tools` parameter on any of the four providers. The system prompt tells it to redirect the user to `/create-kb`, which is a workaround, not the fix.

**Recommended approach: add real Anthropic-style tool calling, scoped to Claude first.**

1. **Tool schema layer**
   - New file: `src/core/agentTools.ts`
   - Define a typed `AgentTool` interface and a registry. Each tool has `name`, `description`, `input_schema`, and a `handler(args, ctx) => Promise<string>` that returns the user-facing message.
   - V1 tools (start small):
     - `create_project_knowledge_base({ project_name })` → calls `ensureProjectKB`
     - `refresh_project_knowledge_base({ project_name })` → calls `refreshProjectKB`
   - Return the same markdown the slash command emits today, so the LLM can summarize it for the user.

2. **LLM client changes**
   - `chatClaude` / `streamClaude` accept `tools` and emit `tool_use` blocks.
   - Multi-turn loop: on `tool_use`, dispatch to the registry, append a `tool_result` user-message, call the model again. Cap at ~3 hops to prevent runaway loops.
   - For OpenAI / OpenRouter: implement equivalent `function_call`. Skip Ollama in V1 — fall back to the slash-command nudge there.

3. **System prompt update**
   - Remove the "tell the user to run /create-kb" guardrail block once tools land.
   - Replace with: "When the user asks to create or refresh a project knowledge base, call the corresponding tool directly."

4. **Streaming UX**
   - While a tool runs, surface a thinking step ("Building knowledge base for Social media…") via the existing `keel:thinking-step` channel.
   - On error, the tool's exception becomes the assistant message.

**Files to touch:**
- New: `src/core/agentTools.ts`
- Edit: `src/core/llmClient.ts` — tool param + multi-turn loop in Claude/OpenAI/OpenRouter paths
- Edit: `electron/main.ts` chat handler — pass the tool registry through to the LLM client, route tool calls
- Edit: `src/core/contextAssembler.ts` — drop the workaround guardrail, add tool-aware instruction

**Estimate:** ~half a day for V1 (Claude only), another half-day for OpenAI/OpenRouter parity, separate effort for Ollama (its tool-calling support varies by model).

**Why this is worth doing post-launch even though slash commands work:**
- Unlocks every other agentic capability after KB — auto-capture, task creation, calendar event creation, etc. Today those are all slash commands too. Tool calling collapses them into natural language.
- Removes a class of hallucinations: when the agent says "I'll do X" and didn't actually do X, that's because there's no tool. Tools fix that structurally.

**Verification:**
- "Can you build a knowledge base for my Social media project?" → agent invokes tool → KB created → agent confirms with the actual result.
- "Refresh the social media KB" → tool called, refresh count surfaced.
- Negative: "Refresh KB for nonexistent project" → tool errors cleanly, agent reports the error.
- Confirm slash commands still work alongside tools (parallel paths, not a replacement).

---

## Sequencing

1. **Item A** first (~2h, lowest risk, biggest day-one UX win).
2. **Item B** second (bigger investment but compounds across the rest of the agentic surface).

Both deferred from pre-launch. Don't bundle them with launch — Item A in the first post-launch dot release, Item B in a follow-up minor.

## Lower-priority adjacent ideas (capture before forgotten)

- **Project KB status indicator** in the KnowledgeBrowser project rows — small chip showing none / fresh / stale, with a one-click refresh.
- **`/delete-kb [project name]`** — currently no slash command for tearing one down; user must delete the wiki base manually.
- **Trigger refresh from `/capture`** — when capture writes into a project with a KB, enqueue a refresh inline rather than waiting on the watcher debounce. Marginal, but removes the latency between "I just saved this" and "it's in the KB."
- **Lazy refresh on wiki workspace open** — when user opens a project KB in the wiki workspace, refresh first. Just-in-time freshness for users who don't keep the app running.
