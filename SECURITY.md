# Security policy

Keel is a one-person open-source project. This file describes how to report
security issues responsibly.

## Reporting a vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Email **medha.ghati@gmail.com** with:

- A description of the issue and its potential impact
- Steps to reproduce, or a proof of concept
- The Keel version (visible in the app's "About" or in `package.json`)
- Your platform (macOS version, etc.)

You should expect a first response within **5 business days**. Real fixes
land on a best-effort basis given this is a solo-maintained project; high-
severity issues that affect user data or credentials get prioritized over
everything else on the roadmap.

## What's in scope

- Issues that could expose user data (workspace files, API keys, OAuth
  tokens, transcripts, captured content)
- Issues that could let one Keel install affect another, or affect the
  user's broader system, beyond the documented surface area
- Issues with how Keel handles credentials it stores or transmits
- Authentication/authorization bypasses on integrated services (Google,
  X, etc.) that go beyond what the user explicitly authorized via OAuth

## What's NOT a vulnerability (please don't report these)

- **Bundled Google OAuth credentials** in
  [`src/core/connectors/googleConfig.ts`](src/core/connectors/googleConfig.ts).
  These are "Desktop app" OAuth credentials and Google's spec explicitly
  requires them to be embedded in distributed source. The "client secret"
  string is a misnomer for this OAuth client type. See the comment at the
  top of that file for details and the link to Google's documentation.
- **API keys you set in your own settings** being readable from your
  filesystem. Keel stores settings in plain JSON at
  `~/Library/Application Support/Keel/settings.json` so you can edit and
  back them up. This is by design.
- **Workspace files being readable on disk.** Keel's whole product premise
  is that your workspace is plain markdown on your filesystem under your
  control. Filesystem-level access controls are macOS's responsibility.
- **The model provider you choose seeing your prompts.** You bring your
  own API key and choose the provider. Anthropic, OpenAI, OpenRouter, and
  Ollama have their own data-handling policies.

## What you can expect from me

- Acknowledgment of the report within 5 business days
- A coordinated disclosure timeline if the issue warrants one
- Credit in the release notes if you'd like (let me know when reporting)
- No legal action against good-faith security research

## Scope: this repository only

This policy covers `Keel-Labs/keel`. Forks are the responsibility of their
respective owners.
