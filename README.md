# Keel

**An AI assistant whose memory belongs to you.**

Keel is a local-first Mac app that captures what matters from your conversations into plain markdown files on your disk. Swap between Claude, GPT, OpenRouter, or a local model any time — your context stays with you, not the vendor.

> Open source (MIT). No telemetry. No account required. Bring your own API key.

<!-- TODO: Replace with hero screenshot or 15-second demo GIF. This is the single most important thing on the page. -->
<!-- ![Keel](docs/assets/hero.png) -->

---

## Your context is yours. The model is just a tenant.

Most AI tools invert ownership. Your notes, your history, and the context that makes an assistant useful end up trapped inside someone else's product — tied to a specific model, a specific vendor, a specific subscription. The day that model gets deprecated or that company changes direction, your context goes with it.

Keel flips that. **You own your memories. You own your context.** It all lives on your machine, in plain markdown, in a folder you control. Your projects, your captures, your wikis, your daily logs — they're files, not database rows inside someone else's cloud.

The model is the part that's interchangeable. Claude today, GPT tomorrow, a local Llama on a flight, Ollama when you want privacy — swap providers whenever you want. The assistant changes; your brain doesn't.

**One portable harness, any model you like, no lock-in.**

---

## Download

**[⬇ Download Keel for macOS](https://github.com/Keel-Labs/keel/releases/latest)** — signed DMG, Apple Silicon and Intel.

Windows and Linux builds are not yet shipped. See the [roadmap](#roadmap) below.

After installing, you'll need an API key from at least one provider (Anthropic, OpenAI, or OpenRouter), or [Ollama](https://ollama.com) installed locally. Keel walks you through this on first launch.

---

## What Keel does

**A local-first workspace you fully own.** Keel maintains a folder on your disk — typically `~/Keel` — made up of markdown files, project folders, daily logs, and wiki bases. Edit it in any editor. Back it up yourself. Move it between machines. Keel reads and writes it in the background as you work.

**Context-aware chat.** Every conversation draws on a system prompt assembled from your workspace: relevant project context, recent captures, open tasks, and search hits. Ask about a project and Keel already knows who's involved, where you left off, and what's open.

**Bring your own model.** Keel speaks to Claude, OpenAI, OpenRouter, and local models via Ollama. Swap providers in settings; fall back automatically when one is unavailable.

**Auto-capture.** When a chat produces something worth keeping — a decision, a fact about a project, a new task — Keel quietly saves it back into your workspace so tomorrow's conversation starts with today's progress baked in.

**Per-project knowledge bases.** Turn any project folder into a queryable wiki with `/create-kb` and `/refresh-kb`. Keel ingests markdown and PDFs, compiles them into a structured knowledge base, and keeps it in sync as files change.

**Voice input.** Speak instead of type, using local Whisper or OpenAI's API.

**Daily briefs.** Keel generates a morning brief and end-of-day wrap-up from your workspace.

**Google Workspace and X integrations.** Sync Calendar events into context, read Google Docs into chat, export results back to Docs. Sync your X bookmarks into a searchable wiki, or publish posts directly from chat.

A full feature list and configuration details live in the in-app help.

---

## Status: this is v1

Keel is a working beta and stable enough for daily use on macOS, but it's early. Some things you should know before installing:

**What works today**
- Chat with Claude, OpenAI, OpenRouter, and Ollama
- Local markdown workspace with auto-capture
- Wiki bases with ingestion, compile, and health checks
- Tasks, daily briefs, end-of-day summaries
- Voice input via Whisper or OpenAI
- Google Calendar, Google Docs, and X integrations
- SQLite full-text search; optional LanceDB vector search

**What doesn't work yet**
- Mac only — no Windows or Linux builds
- No mobile app
- No cloud sync — your workspace lives on one machine at a time
- No team or sharing features
- Some integrations (X bookmark sync) require API access you'll need to provision yourself

If you can live with them, Keel is genuinely useful right now.

---

## Roadmap

This is where Keel is going. Order is rough; nothing here is a promise.

**Near-term (next few months)**
- **LLM-maintained knowledge bases** — the core product direction. You collect source material (URLs, PDFs, docs, notes); Keel compiles it into a living wiki, runs health checks to keep it fresh, and answers questions by writing durable markdown artifacts back into your workspace. The wiki gets better every time you use it.
- **Auto-refresh KBs** — knowledge bases update automatically as files change, no `/refresh-kb` needed
- **Natural language for actions** — "build a KB for my project" works without slash commands; real tool-calling so the agent does things, not just describes them
- **Multi-machine workspace sync** — opt-in, end-to-end encrypted
- **Mobile companion** — read your workspace and add quick notes on the go
- **Windows build**
- More integrations (Obsidian, Linear, GitHub issues)

**Medium-term**
- **People graph** — Keel extracts entities from your workspace and builds `people/*.md` automatically; surfaces things like "haven't talked to X in 3 weeks" in your daily brief
- **Smarter onboarding** — folder scanning, project clustering, PARA proposals; Keel comprehends an existing workspace instead of starting from scratch
- **Team workspaces** — optional and paid; the local-first single-user mode stays free and open source forever
- **Linux build**
- **Plugin/extension API** — so the community can add integrations without forking
- **Better long-term memory** — automatic summarization across years of context

**Things I'm explicitly not doing**
- Becoming a general productivity suite. Keel stays focused on memory and context.

---

## A note on this being a one-person project

Keel is built and maintained by one person. That shapes a few things you should know:

- **Issues and feature requests are read but not always answered.** I'll prioritize bugs that block usage and ignore most feature requests until I have bandwidth. 
- **Pull requests are welcome but not guaranteed to be merged.** Before investing significant time in a PR, please open an issue first to discuss the change. Small fixes (typos, obvious bugs, doc improvements) can go straight to PR.
- **Response times will vary.** Sometimes a few hours, sometimes a few weeks. If something is genuinely urgent, say so in the issue title.

If that tradeoff doesn't work, it's MIT licensed and can be forked.

---

## Install from source

If you want to build Keel yourself instead of downloading the DMG:

**Prerequisites**
- Node.js 18+ and npm
- macOS (Windows and Linux builds may work but aren't tested)
- ~500MB disk space
- Optional: [Ollama](https://ollama.com) for local models

**Clone and run**
```bash
git clone https://github.com/Keel-Labs/keel.git
cd keel
npm install
npm run dev:electron
```

**Build a distributable**
```bash
npm run dist:mac          # macOS DMG (requires macOS)
npm run build:desktop     # Generic desktop build
```

See [`build/`](./build) for packaging configuration and signing entitlements.

---

## Where your data lives

Keel never sends your workspace anywhere unless you explicitly ask it to (e.g., exporting to Google Docs, or sending a message to your chosen LLM provider).

**Settings**
- macOS: `~/Library/Application Support/Keel/settings.json`
- Windows: `%APPDATA%/Keel/settings.json`
- Linux: `$XDG_CONFIG_HOME/keel/settings.json`

**Workspace** — by default at `~/Keel`, structured as plain markdown:
```
keel.md                    # Home page
tasks.md                   # Global task list
projects/{slug}/           # Per-project folders
daily-log/                 # Daily briefs and summaries
knowledge-bases/{slug}/    # Wiki bases
```

**Indexes** — SQLite at `<workspace>/.config/keel.db`; optional LanceDB at `<workspace>/.config/lancedb`.

You can move, back up, or version-control any of this yourself.

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for code style, branch discipline, and PR process. See [ARCHITECTURE.md](./ARCHITECTURE.md) for the runtime map, repository layout, and notes for AI agents working in this codebase.

Please read [the note on this being a one-person project](#a-note-on-this-being-a-one-person-project) above before opening a large PR.

---

## Privacy & legal

- [Privacy Policy](./PRIVACY.md)
- [Terms of Service](./TERMS.md)
- [Code of Conduct](./CODE_OF_CONDUCT.md)

---

## Support

- **Bugs and feature requests:** [Fider board](https://keel.fider.io) or [GitHub issues](https://github.com/Keel-Labs/keel/issues)
- **General questions:** open a GitHub issue

---

## License

[MIT](./LICENSE).
