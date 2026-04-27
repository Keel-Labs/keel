# Keel

**Your personal AI chief of staff.**

Keel is a desktop-first AI assistant that runs on your computer. It captures what matters from your conversations, organizes it into projects and wikis, and stays available through a fast chat interface powered by the AI model of your choice.

---

## The Core Idea: Your Context Is Yours. The Model Is Just a Tenant.

Most AI tools invert ownership. Your notes, your history, and the context that makes an assistant useful end up trapped inside someone else's product — tied to a specific model, a specific vendor, a specific subscription. The day that model gets deprecated or that company changes direction, your context goes with it.

Keel flips that. **You own your memories. You own your context.** It all lives on your machine, in plain markdown, in a folder you control. Your projects, your captures, your wikis, your daily logs — they're files, not database rows inside someone else's cloud.

The model is the part that's interchangeable. Claude today, GPT tomorrow, a local Llama model on a flight, Ollama on your laptop when you want privacy — swap providers whenever you want. The assistant changes; your brain doesn't. Your context travels with you, provider to provider, year to year, machine to machine.

**That's the promise:** one portable harness, any model you like, no lock-in.

---

## Why Keel

Most AI tools forget you the moment the tab closes. Keel remembers, because everything lives in a local folder you own, in human-readable markdown, indexed and searchable on your machine. No server round-trips for your notes, no vendor lock-in, no lost context.

---

## Core Features

### A local-first "cortex" you fully own

Keel maintains a workspace on your own disk — typically `~/Keel` — made up of markdown files, project folders, daily logs, and knowledge bases. You can edit it in any editor, back it up yourself, and move it with you. Keel reads and writes it in the background as you work.

### Context-aware chat

Every chat draws on a system prompt assembled from your workspace: relevant project context, recent captures, tasks, and search hits. Ask about a project and Keel already knows who's involved, where you left off, and what's open.

### Multiple AI providers, your choice

Keel speaks to Claude, OpenAI, OpenRouter, and local models via Ollama. Swap providers in settings; fall back automatically when one is unavailable. Use cloud models when you want power, local models when you want privacy.

### Hybrid retrieval that actually works

Keel combines SQLite full-text search with optional LanceDB vector search for semantic recall. Your files stay indexed and searchable the instant they change.

### Auto-capture and memory extraction

When a chat produces something worth keeping — decisions, facts about a project, new tasks — Keel quietly captures it back into your workspace so tomorrow's conversation starts with today's progress baked in.

### Wiki workspaces

Keel ships a first-class wiki experience for building and reading knowledge bases. Each base has a clean homepage, a navigable left rail, and a calm reading surface. Drop in source material, and Keel can ingest it, compile a structured wiki, and run health checks to flag stale or inconsistent pages.

### Daily briefs and end-of-day summaries

Keel generates a morning brief from your workspace and a wrap-up at the end of the day — pulling from your projects, tasks, and the day's captures.

### Tasks and reminders

Tasks live as markdown in your projects with a dedicated inbox view. Reminders and scheduled jobs run on your desktop so Keel can nudge you at the right moment.

### Google integrations

Connect Google Calendar and Google Docs to sync events, read documents directly into context, and export Keel's output to a Doc with one command.

### Ships as a real desktop app

Built on Electron, React, and TypeScript, Keel installs as a proper macOS app via a signed DMG.

---

## How It Works

1. **Install** the desktop app and point Keel at a folder for your workspace.
2. **Chat** — Keel streams responses while pulling in context from your markdown files, tasks, and wiki bases.
3. **Capture** — substantial moments from chat flow back into your projects automatically.
4. **Organize** — build wikis from source material, maintain tasks, and let Keel compile daily summaries.
5. **Own your data** — every note stays on your machine, in plain markdown, forever portable.

---

## Who It's For

Keel isn't tuned to a single role — it's tuned to the way people actually think. If you have a head full of context across work, home, side projects, reading, and everything in between, Keel is built for you. That includes:

- **Professionals** tracking projects, meetings, and decisions across a dozen surfaces.
- **Students and lifelong learners** organizing notes, sources, and what they're reading.
- **Creatives and writers** collecting ideas before they evaporate.
- **Parents, planners, and caregivers** keeping track of the hundred small things nobody else is going to remember.
- **Tinkerers and researchers** building personal knowledge bases from messy source material.
- **Anyone** who's tired of AI assistants with amnesia and wants a tool that learns their world and keeps it on their own machine.

---

## Status

⚠️ **Keel is in active beta.** Core chat, wiki, and task features work. The system is stable on macOS. Some features (mobile, cloud sync) are planned but not yet shipped. [See the roadmap](./specs/README.md) for what's coming.

---

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- macOS, Windows, or Linux desktop
- ~500MB disk space for dependencies
- Optional: Ollama if you want local chat or embedding support

### Install & Run

```bash
git clone https://github.com/Keel-Labs/keel.git
cd keel
npm install
npm run dev:electron
```

This launches Keel in development mode. On first run, you'll choose a workspace location and configure an AI provider.

### Build for Distribution

```bash
npm run dist:mac          # macOS DMG (requires macOS)
npm run build:desktop     # Generic desktop build
```

See [`build/`](./build) for packaging configuration and signing entitlements.

---

## Repository Structure

| Path | Purpose |
|------|---------|
| `electron/` | Main process, IPC handlers, window management, packaging entry points |
| `src/app/` | React renderer UI, desktop shell, chat, wiki, settings, onboarding |
| `src/core/` | LLM client, storage, retrieval, workflows, wiki logic, integrations |
| `src/shared/` | TypeScript contracts between renderer and main process |
| `docs/` | Design guidance and UI style reference |
| `specs/` | Product specs and contributor playbooks |
| `build/` | Packaging assets, app icons, entitlements |

---

## Architecture In One Minute

1. The React renderer (`src/app/`) calls `window.keel` — a safe IPC bridge exposed by `electron/preload.ts`.
2. `electron/main.ts` owns the Electron shell, IPC handlers, scheduler, and workflow orchestration.
3. `src/core/` implements the business logic:
   - `llmClient.ts` chooses the active AI provider and handles fallbacks.
   - `contextAssembler.ts` builds the system prompt from markdown files, tasks, and search results.
   - `fileManager.ts` manages the local brain and wiki filesystem.
   - `db.ts`, `embeddings.ts`, and `vectorStore.ts` handle indexing and retrieval.
   - `workflows/` contains capture, memory extraction, wiki ingest/compile, daily briefs, and end-of-day summaries.
4. User data lives outside the repo in the configured workspace path. Settings live in an OS-specific config directory.

---

## Data Model

### Settings

- **macOS:** `~/Library/Application Support/Keel/settings.json`
- **Windows:** `%APPDATA%/Keel/settings.json`
- **Linux:** `$XDG_CONFIG_HOME/keel/settings.json`

Override with:
- `KEEL_DEFAULT_BRAIN_PATH` — workspace location
- `KEEL_CONFIG_DIR` — config directory

### Brain Workspace

By default, Keel creates `~/Keel` with:

```
keel.md                    # Home page
tasks.md                   # Global task list
projects/                  # Project folders
  {slug}/
    context.md             # Project context
    tasks.md               # Project task list
    .keel-kb.json          # Project knowledge base metadata
daily-log/                 # Daily briefs and summaries
knowledge-bases/           # Wiki bases
  {slug}/
    raw/                   # Source material
    wiki/                  # Generated pages
    outputs/               # Compiled outputs
    health/                # Health check reports
```

### Storage & Indexing

- **Chat sessions & reminders:** SQLite (`<workspace>/.config/keel.db`)
- **Full-text search:** SQLite FTS (baseline)
- **Vector search:** Optional LanceDB (`<workspace>/.config/lancedb`)

---

## For Contributors

### Running Tests

```bash
npm test                   # Run Vitest suite once
npm run test:watch        # Watch mode
```

### Key Files When Making Changes

**Chat & Desktop UI:**
- `src/app/App.tsx`
- `src/app/components/Chat.tsx`
- `src/app/components/Sidebar.tsx`

**IPC & Desktop Integration:**
- `src/shared/types.ts`
- `electron/preload.ts`
- `electron/main.ts`

**Settings & Providers:**
- `src/app/components/Settings.tsx`
- `src/core/llmClient.ts`

**Retrieval & Memory:**
- `src/core/contextAssembler.ts`
- `src/core/db.ts`
- `src/core/workflows/memoryExtract.ts`

**Wiki Features:**
- `src/app/components/WikiWorkspace.tsx`
- `src/core/workflows/wikiIngest.ts`
- `src/core/workflows/wikiMaintenance.ts`

**Google Integrations:**
- `src/core/connectors/googleAuth.ts`
- `src/core/connectors/googleCalendar.ts`

---

## Documentation

- [**CONTRIBUTING.md**](./CONTRIBUTING.md) — Code style, branch discipline, and PR process
- [**Code of Conduct**](./CODE_OF_CONDUCT.md) — Community expectations
- [**docs/UI_STYLE_GUIDE.md**](./docs/UI_STYLE_GUIDE.md) — Typography, spacing, colors
- [**specs/repository-architecture.md**](./specs/repository-architecture.md) — Detailed runtime map
- [**specs/contributor-playbook.md**](./specs/contributor-playbook.md) — Common change recipes

---

## Privacy & Legal

- [**Privacy Policy**](./PRIVACY.md) — How Keel handles your data
- [**Terms of Service**](./TERMS.md) — Usage and liability terms

---

## Support & Feedback

- **Report a bug** or **request a feature:** [Fider board](https://keel.fider.io)
- **Questions?** Open an issue or reach out on GitHub

---

## License

MIT. See [LICENSE](./LICENSE) for full details.

---

## Notes for Agents and Contributors

- Assume desktop-first behavior unless explicitly stated otherwise.
- IPC changes must update: `src/shared/types.ts` → `electron/preload.ts` → `electron/main.ts` → renderer callers.
- When changing wiki behavior, preserve the distinction between `raw/` sources and generated `wiki/` outputs.
- SQLite FTS is the reliable baseline for search; LanceDB is optional and may not be available.
- The local brain path (`~/Keel` by default) is user-owned and should never be modified without explicit intent.
