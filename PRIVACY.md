# Privacy Policy

**Last Updated:** April 2026

## Overview

Keel is a desktop-first application designed with privacy as a core principle. **Your data lives on your machine.** Keel does not operate a server that stores your personal information, does not track you, and does not sell your data.

This policy explains what data Keel collects, how it's used, and your rights.

---

## What Data Keel Collects

### Data You Create and Control

Everything you create in Keel — chat messages, captures, project context, tasks, daily logs, and wiki bases — is stored **locally on your computer** in a folder you designate (typically `~/Keel`).

- **No cloud backup by default.** Your data stays on your machine unless you explicitly choose to sync it or back it up yourself.
- **You own the files.** All data is stored in plain markdown and JSON files that you can read, edit, copy, or delete at any time.
- **Portable.** You can move your entire Keel workspace to another machine, another app, or another service.

### Configuration Data

Keel stores your settings locally, including:
- Workspace location
- Theme preference (system, dark, light)
- AI model preferences (Claude, OpenAI, etc.)
- Timezone
- Your name

Settings are stored at:
- **macOS:** `~/Library/Application Support/Keel/settings.json`
- **Windows:** `%APPDATA%/Keel/settings.json`
- **Linux:** `$XDG_CONFIG_HOME/keel/settings.json`

### API Keys

If you configure API keys for Claude, OpenAI, OpenRouter, or other providers, those keys are:
- **Stored locally** in your settings file (plaintext)
- **Never sent to Keel servers** (because there are none)
- **Only used** to make requests to the third-party provider you've chosen
- **Your responsibility to protect.** If your computer is compromised, treat your API keys as compromised.

**Recommendation:** Use restricted API keys from your providers where possible (e.g., Claude API keys with per-minute rate limits).

### Chat Sessions

Chat history is stored locally in an SQLite database:
- **Location:** `<workspace>/.config/keel.db`
- **Ownership:** You own this file
- **No automatic sync:** Unless you manually export or sync, this data stays on your machine

---

## What Data Keel Sends

### To AI Providers

When you send a chat message, Keel sends:
- Your message
- Relevant context assembled from your workspace (project notes, tasks, recent captures)
- System prompt customized for your situation

**To which providers?** Whichever you've configured in settings.

**Example providers and their policies:**
- **Claude (Anthropic):** See [Anthropic's Privacy Policy](https://www.anthropic.com/privacy)
- **OpenAI:** See [OpenAI's Privacy Policy](https://openai.com/privacy/)
- **OpenRouter:** See [OpenRouter's Privacy Policy](https://openrouter.ai/privacy)
- **Ollama:** Local model; no data sent elsewhere

### To Google Services (Optional)

If you connect your Google account:
- **Google Calendar:** Keel reads upcoming events to include in daily briefs. No events are modified or sent anywhere except your calendar.
- **Google Docs:** Keel can read docs you share and export Keel's outputs to Google Docs. This uses OAuth 2.0; you can revoke access anytime in your Google account settings.

**No permanent sync:** Keel reads Google services on-demand. Events and docs are fetched fresh each time and not stored in Keel's database.

### To Keel

**Keel does not operate a server and does not collect telemetry.** Your usage, settings, and data are not sent to medha.ghati@gmail.com or any third party unless you explicitly choose to share something (e.g., exporting a doc, creating feedback on the Fider board).

---

## How Your Data Is Used

- **To power chat:** Your messages and workspace context are assembled into a prompt and sent to your chosen AI provider.
- **To improve your experience:** Keel indexes your markdown files for full-text and semantic search so chat has relevant context.
- **To help you stay organized:** Auto-capture extracts decisions and tasks from chat and writes them back to your workspace.
- **To notify you:** Reminders and daily briefs run locally on your machine.

**Your data is not used for:**
- Training AI models (unless you've shared it with an AI provider in a separate agreement)
- Building profiles or marketing segments
- Selling or trading with third parties
- Analytics or usage tracking

---

## Data Retention

You decide when data is deleted.

- **Chat sessions:** Delete from the app's session list, or delete the database file (`<workspace>/.config/keel.db`).
- **Captured notes:** Edit or delete files in your workspace folder.
- **Workspace files:** Delete the entire `~/Keel` folder to remove all data.

**There is no "Keel account"** to delete. Because everything is local, deleting your workspace folder is sufficient.

---

## Your Rights

### Access
You have complete access to your data. All files are plain text or JSON; you can read them in any editor.

### Portability
You can export, copy, or move your entire workspace at any time. Keel does not lock you in.

### Deletion
Delete any file or the entire workspace whenever you want. There's no "recovery" process — Keel respects your deletion.

### Correction
Edit any file directly. Keel reads and writes markdown; you're in control.

---

## Third-Party Services

Keel integrates with:

| Service | Data Shared | Their Privacy Policy |
|---------|-------------|----------------------|
| Claude / Anthropic | Chat messages + context | [Anthropic Privacy](https://www.anthropic.com/privacy) |
| OpenAI | Chat messages + context | [OpenAI Privacy](https://openai.com/privacy/) |
| OpenRouter | Chat messages + context | [OpenRouter Privacy](https://openrouter.ai/privacy) |
| Ollama | None (local only) | N/A |
| Google Calendar | Event calendar reads | [Google Privacy](https://policies.google.com/privacy) |
| Google Docs | Document reads & exports | [Google Privacy](https://policies.google.com/privacy) |
| Fider | Feedback posts you submit | [Fider Privacy](https://docs.fider.io/privacy) |

---

## Security

### On Your Machine
- Keel stores settings and data in files readable by your user account (standard file permissions).
- **No encryption at rest** (files are plaintext). This is intentional — it keeps your data portable and readable.
- If your computer is compromised, treat your API keys and chat history as compromised.

### In Transit
- Requests to AI providers and Google services use HTTPS.
- Keel does not operate a server; there's no Keel-to-server transmission.

### Recommendations
- Use a password-protected user account on your machine.
- Keep your operating system and dependencies updated.
- Use strong, unique API keys from your AI providers.
- Back up your workspace folder regularly (to an external drive, cloud storage you trust, etc.).

---

## Changes to This Policy

Keel is in beta. As features change, this policy may be updated. You'll be notified of material changes.

---

## Contact

Questions about this policy or your privacy? Reach out:

- **GitHub Issues:** [Keel repository](https://github.com/Keel-Labs/keel/issues)
- **Feedback Board:** [Keel Fider](https://keel.fider.io)
- **Email:** medha.ghati@gmail.com

---

## Summary

**The short version:** Your data is yours. It lives on your computer in files you own. Keel doesn't run a server, doesn't track you, and doesn't sell your data. When you talk to an AI provider, that provider sees your message and context — check their privacy policies. You can delete everything anytime.
