# Keel

**An AI assistant whose memory belongs to you.**

Keel is a local-first Mac app that captures what matters from your conversations into plain markdown files on your disk. Swap between Claude, GPT, OpenRouter, or a local model any time — your context stays with you, not the vendor.

Open source (MIT). No telemetry. No account required. You can bring your own API key.

▶ **[Keel Walkthrough 🚀 — Watch Video](https://www.loom.com/share/29c1407fc2944b1fb5c6c1bbc953831b)**

<img width=80% height=auto alt="Screenshot 2026-04-29 at 12 35 27 PM" src="https://github.com/user-attachments/assets/afdce370-2210-45a0-8008-f078bb893000" />
<img width=80% height=auto alt="Screenshot 2026-04-29 at 12 40 13 PM" src="https://github.com/user-attachments/assets/a76c2ea4-1f7d-4ede-aa19-86aacbf0a1f6" />
<img width=80% height=auto alt="Screenshot 2026-04-29 at 12 43 46 PM" src="https://github.com/user-attachments/assets/dbdbb413-8cb3-4764-81cb-f7933bb3e717" />

---

## Your context is yours. The model is just a tenant.

Most AI tools invert ownership. Your notes, your history, and the context that makes an assistant useful end up trapped inside someone else's product — tied to a specific model, a specific vendor, a specific subscription. The day that model gets deprecated or that company changes direction, your context goes with it.

Keel flips that. **You own your memories. You own your context.** It all lives on your machine, in plain markdown, in a folder you control. Your projects, your captures, your wikis, your daily logs — they're files, not database rows inside someone else's cloud.

The model is the part that's interchangeable. Claude today, GPT tomorrow, a local Llama on a flight, Ollama when you want privacy — swap providers whenever you want. The assistant changes; your brain doesn't.

**One portable harness, any model you like, no lock-in.**

---

## Download

**[⬇ Download Keel for macOS](https://github.com/Keel-Labs/keel/releases/latest)** — universal DMG (Apple Silicon and Intel).

Windows and Linux builds are not yet shipped. See the [roadmap](#roadmap) below.

### Install

1. Open the DMG and drag **Keel** to **Applications**.
2. **First launch will be blocked by macOS** with an "Apple could not verify Keel is free of malware" dialog. The build is ad-hoc signed but not yet notarized, so Gatekeeper requires an extra step.
<img width=20% height=auto alt="Screenshot 2026-04-29 at 4 09 02 PM" src="https://github.com/user-attachments/assets/e22f9d82-faac-42c7-af79-c8a73eb20635" />

   **If you're on macOS 15 (Sequoia) or newer** — Apple removed the "Open Anyway" button from this dialog, so you need one of these:

   **Option A — Terminal one-liner (always works, recommended):**
   ```sh
   xattr -cr /Applications/Keel.app
   ```
   Then double-click Keel as normal.

   **Option B — System Settings (GUI):**
   a. Try to open Keel. The "could not verify" dialog appears — click **Done** to dismiss it.
   b. Open **System Settings → Privacy & Security** and scroll to the **Security** section.
   <img width=45% height=auto alt="Screenshot 2026-04-29 at 4 13 42 PM" src="https://github.com/user-attachments/assets/72238783-331d-45ea-a3d9-b36ff8765cbc" />
   
   c. You'll see *"Keel was blocked from use because it is not from an identified developer"* — click **Open Anyway** and authenticate.
   d. Try opening Keel again. A second dialog will now have an **Open** button — click it.

   **If you're on macOS 14 (Sonoma) or earlier** — the classic flow still works:
   - Right-click **Keel.app** → **Open**. The first dialog will now have an **Open** button — click it. You're done.

3. After launch, you'll need an API key from at least one provider (Anthropic, OpenAI, or OpenRouter), or [Ollama](https://ollama.com) installed locally. Keel walks you through this on first launch.

Notarization is on the roadmap; once it ships, the Gatekeeper dance goes away.

---

## What Keel does

**A local-first workspace you fully own.** Keel maintains a folder on your disk — typically `~/Keel` — made up of markdown files, project folders, daily logs, and wiki bases. Edit it in any editor. Back it up yourself. Move it between machines. Keel reads and writes it in the background as you work.

<img width=70% height=auto alt="Screenshot 2026-04-29 at 12 40 27 PM" src="https://github.com/user-attachments/assets/72ddaf82-9bdf-44ab-b86c-cb370c45a7dd" />

**Bring your own model.** Keel speaks to Claude, OpenAI, OpenRouter, and local models via Ollama. Swap providers in settings; fall back automatically when one is unavailable.

<img width=70% height=auto alt="Screenshot 2026-04-29 at 12 40 13 PM" src="https://github.com/user-attachments/assets/a76c2ea4-1f7d-4ede-aa19-86aacbf0a1f6" />

**Context-aware chat.** Every conversation draws on a system prompt assembled from your workspace: relevant project context, recent captures, open tasks, and search hits. Ask about a project and Keel already knows who's involved, where you left off, and what's open.

**Auto-capture.** When a chat produces something worth keeping — a decision, a fact about a project, a new task — Keel quietly saves it back into your workspace so tomorrow's conversation starts with today's progress baked in.

**Per-project knowledge bases.** Turn any project folder into a queryable wiki with `/create-kb` and `/refresh-kb`. Keel ingests markdown and PDFs, compiles them into a structured knowledge base, and keeps it in sync as files change.

<img width=80% height=auto alt="Screenshot 2026-04-29 at 12 43 58 PM" src="https://github.com/user-attachments/assets/d6cb5cf0-147c-46ab-8254-fad2facec1de" />
<img width=80% height=auto alt="Screenshot 2026-04-29 at 12 46 59 PM" src="https://github.com/user-attachments/assets/90293f2a-8e92-4118-882a-4ee977f07676" />

**Dashboard.** A home view that surfaces your day at a glance — open tasks and reminders, recent activity, the morning brief, weather, and news — so you land somewhere useful instead of an empty chat.
<img width=80% height=auto alt="Dashboard" src="https://github.com/user-attachments/assets/c4e0c2a4-b86b-49ee-8000-2468c01784a8" />

**Tasks and reminders.** First-class to-dos backed by markdown, with due dates, projects, and time-based reminders that fire as desktop notifications.

<img width=80% height=auto alt="Tasks" src="https://github.com/user-attachments/assets/08684877-9d91-4a1d-aa48-a1677e19f8da" />

**Meeting transcription.** Record a meeting (or import audio) and Keel transcribes it locally with Whisper, then writes a structured summary — decisions, action items, attendees — back into the relevant project.
<img width=80% height=auto alt="Screenshot 2026-04-29 at 12 45 49 PM" src="https://github.com/user-attachments/assets/80d6ffa3-a3ce-44f5-800c-93e13aa79936" />

**Voice input.** Speak instead of type, using local Whisper or OpenAI's API.
<img width=60% height=auto alt="Screenshot 2026-04-29 at 1 52 25 PM" src="https://github.com/user-attachments/assets/87ae1da5-775d-496d-8336-667472b213fc" />

**Daily briefs and end-of-day wraps.** Keel generates a morning brief and an EOD summary from your workspace, and "pick up where you left off" pulls yesterday's loose ends into today.
<img width=80% height=auto alt="Screenshot 2026-04-29 at 12 44 46 PM" src="https://github.com/user-attachments/assets/cc734629-f1bc-46ef-b438-a73d2da4f815" />
<img width=80% height=auto alt="Screenshot 2026-04-29 at 12 45 33 PM" src="https://github.com/user-attachments/assets/e9f38e6d-7f00-424b-9512-849cdcd1858f" />

**Scheduled jobs.** Run any prompt or workflow on a recurring schedule — daily digests, weekly reviews, custom check-ins — with results captured back into your workspace.
<img width=80% height=auto alt="Scheduled Jobs" src="https://github.com/user-attachments/assets/79211140-4472-4259-9926-adff5cf35722" />

**Personalities.** Pick the voice your assistant speaks in — default, Butler, Hype Friend, Captain, or Documentary Narrator — or define your own.

<img width=80% height=auto alt="Select a personality for your assistant" src="https://github.com/user-attachments/assets/b8e3e03d-eb81-44b6-8e83-224db4e82a85" />

**Dark mode.** System-aware, with a manual override.
<img width=80% height=auto alt="Dark mode" src="https://github.com/user-attachments/assets/3201e9bc-7d3d-497e-81f7-fb1c5c359ee5" />

**Google Workspace and X integrations.** Sync Calendar events into context, read Google Docs into chat, export results back to Docs. Sync your X bookmarks into a searchable wiki, or publish posts directly from chat.
<img width=80% height=auto alt="Screenshot 2026-04-29 at 12 52 13 PM" src="https://github.com/user-attachments/assets/f0babd41-4c84-42c9-922c-d00b8ba8a281" />

**Other Commands**

<img width=80% height=auto alt="Screenshot 2026-04-29 at 12 45 11 PM" src="https://github.com/user-attachments/assets/35135158-5e05-48a3-820b-a3bca7c625ba" />

A full feature list and configuration details live in the in-app help.

---

## Status: this is v1

Keel is a working beta and stable enough for daily use on macOS, but it's early. Some things you should know before installing:

**What works today**
- Chat with Claude, OpenAI, OpenRouter, and Ollama
- Local markdown workspace with auto-capture
- Dashboard with tasks, reminders, brief, weather, and activity
- Wiki bases with ingestion, compile, and health checks
- Tasks and reminders with desktop notifications
- Meeting recording and local transcription with structured summaries
- Daily briefs, end-of-day wraps, and "pick up where you left off"
- Scheduled jobs for recurring prompts and workflows
- Selectable assistant personalities (and custom)
- Voice input via Whisper or OpenAI
- Google Calendar, Google Docs, and X integrations
- Light and dark mode
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

This is where Keel is going — focused on memory and context, not a general productivity suite. Order is rough; nothing here is a promise.

**Near-term (next few months)**
- **LLM-maintained knowledge bases** — the core product direction. You collect source material (URLs, PDFs, docs, notes); Keel compiles it into a living wiki, runs health checks to keep it fresh, and answers questions by writing durable markdown artifacts back into your workspace. The wiki gets better every time you use it.
- **Auto-refresh KBs** — knowledge bases update automatically as files change, no `/refresh-kb` needed
- **Natural language for actions** — "build a KB for my project" works without slash commands; real tool-calling so the agent does things, not just describes them
- **Multi-machine workspace sync** — opt-in, end-to-end encrypted
- **Mobile companion** — read your workspace and add quick notes on the go
- **Windows build**

**Medium-term**
- **People graph** — Keel extracts entities from your workspace and builds `people/*.md` automatically; surfaces things like "haven't talked to X in 3 weeks" in your daily brief
- **Smarter onboarding** — folder scanning, project clustering, PARA proposals; Keel comprehends an existing workspace instead of starting from scratch
- **Team workspaces** — optional and paid; the local-first single-user mode stays free and open source forever
- **Linux build**
- **Plugin/extension API** — so the community can add integrations without forking

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

See [CONTRIBUTING.md](./CONTRIBUTING.md) for code style, branch discipline, and PR process. See [specs/repository-architecture.md](./specs/repository-architecture.md) for the runtime map and repository layout.

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
