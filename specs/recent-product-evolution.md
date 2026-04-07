# Recent Product Evolution

This document summarizes the recent repository history so contributors can understand why the codebase looks the way it does today.

Source: recent `git log` on the mainline history.

## April 5, 2026: Wiki Becomes A First-Class Surface

Key commits:

- `be711c9` docs: add wiki product, UX, and implementation specs
- `102edf8` feat: add wiki workspace and sample base
- `9e381ec` feat: refine wiki navigation and reading flow
- `96d51be` feat: add wiki source management and fix desktop openai access
- `7b4cc90` feat: add wiki compile and health workflows

What changed:

- The repo gained a real `knowledge-bases/` workspace model.
- Keel moved beyond a simple knowledge browser into a wiki-oriented product surface.
- Source ingest, compiled outputs, and health-check flows became part of the implementation, not just product intent.

Why it matters now:

- Wiki work is no longer speculative. There is active runtime code for base creation, ingest, compile, and health.
- Product specs in `specs/` are tightly coupled to code added on the same day, but some docs still describe the intended end state rather than the exact current implementation.

## April 5, 2026: Desktop Packaging Hardens

Key commit:

- `3203c4c` feat: add mac dmg packaging workflow

What changed:

- Packaging moved from "developer app" territory toward user-installable desktop distribution.

Why it matters now:

- Release and packaging docs are part of the real contributor surface.
- Build and packaging changes should account for Electron native-module compatibility and macOS artifacts.

## April 6, 2026: Desktop-Only Direction Becomes Explicit

Key commit:

- `74ddc4d` refactor: remove Fly.io server, mobile/Capacitor, and cloud auth

What changed:

- The repo intentionally shed its older multi-surface architecture.
- The active product baseline became the Electron desktop app with local storage and optional integrations.

Why it matters now:

- Older cloud/mobile docs are historical reference only.
- New work should not assume the presence of server routes, JWT auth flows, or mobile UI layers unless those are being reintroduced deliberately.

## April 6, 2026: Chat Memory And Capture Tighten Up

Key commits:

- `9827766` feat: auto-capture substantial context from chat conversations
- `93d289d` fix: robust memory extraction and flat task display
- `529d89e` fix: show unread and streaming chat state
- `a84fac4` fix: preserve chat streams across session switches

What changed:

- Chat became more stateful and operationally reliable.
- Recent user messages can now feed durable workspace updates automatically.
- Session switching and stream lifecycle handling received explicit fixes.

Why it matters now:

- Chat changes have downstream effects on memory, tasks, captures, and session persistence.
- Reviewing only the renderer is usually insufficient for chat features.

## April 6, 2026: Google Doc Export And Capture UX Mature

Key commits:

- `a127c0c` feat: stop button, Google Doc write-and-export, capture redesign, and UX improvements
- `d2d03c4` fix: prevent LLM from mimicking Google Doc export patterns in chat

What changed:

- Google Docs moved from a peripheral integration to an explicit part of the user flow.
- Prompting and response constraints were updated so Keel does the document work without polluting normal chat responses with fake export confirmations.

Why it matters now:

- Prompt and workflow changes are part of product behavior, not just internal implementation detail.
- When changing export or chat behavior, inspect both workflow code and the system prompt/context rules.

## Repository Reading Guidance

If you are new to the repo, interpret the recent history like this:

1. The product is desktop-first and local-first.
2. Wiki work is active and implemented.
3. Chat state, memory, and capture are tightly linked.
4. Google integrations are real user-facing features.
5. Packaging matters because Keel is intended to ship as a desktop app.

That is the current lens to use when deciding where new changes belong.
