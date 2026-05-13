# Keel Mobile Companion — Spec (v0)

Status: draft. Tracks [Keel-Labs/keel#96](https://github.com/Keel-Labs/keel/issues/96).

This document is the contract between the Keel Mac app and a thin mobile companion (iOS first, Android to follow). It defines the on-disk format, the atomic-write protocol, and how the Mac ingests what the phone drops. The mobile app lives in a separate repo (`keel-mobile`); this spec is the only thing both sides must agree on.

## Principles

1. **No Keel-operated server.** No account, no relay, no rendezvous.
2. **The Mac workspace is the canonical reconciler.** The phone may write into `inbox/incoming/` and may read anywhere in the workspace, but it never decides truth. The Mac merges, dedupes, indexes, and routes.
3. **No telemetry.** Same bar as desktop.
4. **User owns the transport.** Whichever file-sync provider (iCloud / Dropbox / Google Drive / OneDrive / Syncthing) the user picks.

## v0 scope

Five use cases. Capture (write) on the left; surfaces (read) on the right.

| Capture | | Read |
|---|---|---|
| Text note (typed or OS-dictated) | | Today's brief |
| Share-sheet capture (URL / text from any app) | | Open tasks |
| Add a URL or text source to an existing KB | | Recent captures |
| | | Compiled KB pages |

Explicitly **out** of v0: voice memos as audio files (OS keyboard dictation covers it), photo capture, live chat, push notifications routed through our infra.

## Architecture

```
[ phone ] ──writes──▶ <workspace>/inbox/incoming/<file>
                                     │
                              user-chosen file sync
                                     │
                                     ▼
[ Mac watcher ] ──atomically renames──▶ <workspace>/inbox/processing/<file>
       │
       ├── kind: capture     → src/core/workflows/capture.ts (LLM routes)
       │                        ├── projects/<slug>/context.md
       │                        ├── projects/captures/...md
       │                        └── tasks.md / projects/<slug>/tasks.md
       │
       └── kind: kb-source   → src/core/workflows/wikiIngest.ts
                                ingestWikiSource(target-slug, url-or-body)
                                  → existing KB auto-refresh watcher
                                    recompiles automatically

[ phone read-only ] ◀──reads── <workspace>/{daily-log,tasks.md,projects,knowledge-bases}
                                (markdown rendered locally on the phone)
```

The phone writes only into `inbox/incoming/`. It reads from the rest of the workspace, but never writes there.

## On-disk layout

```
<workspace>/
  inbox/
    incoming/        # phone writes here, Mac reads
    processing/      # Mac moves files here while routing
    processed/<YYYY-MM>/   # Mac moves here after successful ingest, pruned after 30 days
    failed/          # Mac moves here on routing error, with sibling .error.json
  attachments/
    mobile/          # reserved for future media; created lazily
```

The Mac creates these directories on first run.

## File naming

Every capture is one file. Filename pattern:

```
<utc-iso-basic>__<device-id>__<nonce>.md
```

- `<utc-iso-basic>` — UTC timestamp in `YYYYMMDDTHHMMSSZ` form. Example: `20260509T142233Z`.
- `<device-id>` — 8 hex chars, random per install, stored in the app's local prefs. Not tied to Apple ID / IDFA. Resets on reinstall.
- `<nonce>` — 4 hex chars, random per file.

Example: `20260509T142233Z__a1b2c3d4__9f0e.md`

The Mac watcher ignores any filename that doesn't match this exact pattern — including cloud-sync "conflicted copy" suffixes (e.g. `... (conflicted copy 2026-05-09).md`).

## Frontmatter

Every file is UTF-8 markdown with required YAML frontmatter. Two `kind` values are supported in v0.

### `kind: capture` — text note or share-sheet capture

```markdown
---
keel-capture: 1
kind: capture
captured-at: 2026-05-09T14:22:33Z
device: iPhone 15 Pro     # human-readable, optional
---

The body of the capture, free-form markdown. URLs in the body are
handled by the existing capture() workflow — no special field needed.
```

In-app text and share-sheet captures use the **same shape**. The share extension just writes one of these files with the shared URL or selected text as the body.

### `kind: kb-source` — add a source to an existing KB

```markdown
---
keel-capture: 1
kind: kb-source
target-kb: pool-servicing      # project slug; must match an existing project with a .keel-kb.json manifest
source-url: https://...        # optional. If present, Mac fetches and ingests this URL.
captured-at: 2026-05-09T14:22:33Z
device: iPhone 15 Pro
---

Optional body. If `source-url` is absent, the body is ingested as raw text.
If `source-url` is present, the body is ignored (treat as a user note for debugging).
```

The Mac watcher resolves `target-kb` against the list of projects that have a `.keel-kb.json` manifest. If no match, the file goes to `failed/` with reason `unknown target-kb: <slug>`.

## Atomic write protocol (phone side)

Cloud sync providers will happily upload a half-written file. To prevent the Mac from seeing partial captures:

1. Phone writes to `incoming/.tmp__<finalname>`.
2. Phone calls `fsync` (or `NSFileCoordinator` on iOS).
3. Phone renames `.tmp__<finalname>` → `<finalname>` atomically (same directory, same volume).

The Mac watcher ignores filenames starting with `.tmp__` or `.`.

## Mac watcher behavior

Watcher lives at `electron/inboxWatcher.ts`.

1. On startup and on file-system change events, scan `inbox/incoming/`.
2. Skip files starting with `.` or `.tmp__`, and any name that doesn't match the canonical pattern.
3. For each candidate, look up the basename in the `inbox_seen` dedupe table. If present, move to `failed/` with reason `duplicate` — never re-routed.
4. Read the file, validate frontmatter (`keel-capture: 1`, recognized `kind`).
5. Atomically rename to `inbox/processing/`.
6. Dispatch by `kind`:
   - **capture** → prepend `[Captured from <device> via Keel mobile]\n\n` to the body, call `capture()` from `src/core/workflows/capture.ts`. LLM router decides project / inbox / tasks.
   - **kb-source** → resolve `target-kb` to a project slug with a KB manifest. If `source-url`, fetch and ingest via `ingestWikiSource({ sourceType: 'url', url })`. Otherwise ingest the body via `{ sourceType: 'text', title: '...', text: body }`. The existing KB auto-refresh watcher will pick up the new source and recompile.
7. On success, move to `inbox/processed/<YYYY-MM>/` and record `processed` in `inbox_seen`. On failure, move to `inbox/failed/`, write a sibling `<basename>.error.json`, and record `failed`.
8. Prune `processed/` entries older than 30 days on each app launch.

## Phone read surfaces

The phone renders these files locally — no Mac-side API, no protocol. It just reads the workspace folder via the OS folder picker (Document Picker on iOS, SAF on Android).

| Surface | Source files |
|---|---|
| Today's brief | `daily-log/<YYYY-MM-DD>.md` (or the most recent file in `daily-log/`) |
| Open tasks | `tasks.md` at workspace root, plus `projects/*/tasks.md` |
| Recent captures | Most recent N files in `projects/captures/`, sorted by mtime |
| Compiled KB pages | `knowledge-bases/<base>/*.md` and `projects/<slug>/wiki-*.md` (whatever the desktop produces) |

The phone parses GitHub-flavored markdown and renders. It does not modify, move, or delete any of these files.

## De-duplication

Filenames are unique by construction (timestamp + device-id + nonce). The Mac maintains a small SQLite table `inbox_seen(filename PRIMARY KEY, processed_at, device_id, outcome)` in `keel.db`. Any filename that appears in `incoming/` after already being recorded is moved straight to `failed/` with reason `duplicate` — never re-routed.

## Conflict resolution

- Two phones at the same UTC second: filenames differ via `device-id` + `nonce`.
- Same phone, resurrected file: caught by the dedupe table.
- Sync provider "conflict copy" filenames: don't match the canonical regex, so the watcher ignores them. We surface a one-time toast suggesting the user review them in their sync provider.

## Phone UI surface (v0)

Four screens:

1. **Capture** — text field (works with system mic / dictation), send button. Writes a `kind: capture` file.
2. **Read** — tabs for Today's brief / Tasks / Recent captures / KBs. Read-only markdown rendering.
3. **Add KB source** — pick a KB from the list (read from `projects/*/.keel-kb.json`), paste a URL or text. Writes a `kind: kb-source` file.
4. **Settings** — pick the workspace folder (one-time), show the picked folder, "test write" button drops a marker file the Mac picks up to confirm the pipe.

Plus a **share extension** that writes a `kind: capture` file from outside the app (e.g. share a URL from Safari).

## What the phone never does in v0

- No model calls (no API keys on device).
- No writes outside `inbox/incoming/`.
- No background sync triggers (relies entirely on OS file-provider sync).
- No analytics, no auto-phone-home crash reporters.
- No push notifications routed through APNs with our certificate.

## Security & privacy notes (for PRIVACY.md)

- The Mac sees nothing the phone didn't deliberately write to `incoming/`.
- The phone's file picker grants access to a single folder (the workspace root); the OS enforces that scope.
- Captures travel through whichever sync provider the user chose. The provider sees them — same as today if `~/Keel` is on iCloud Drive on desktop.
- The `device-id` in filenames is random per install, not tied to Apple ID, IDFA, or anything user-identifying. Reset by reinstalling the app.

## Resolved decisions

1. **No audio file uploads.** OS keyboard dictation (iOS / Android Gboard) covers voice-to-text on the phone; the dictated text flows through the normal text-capture path. Whisper-on-the-Mac is not invoked from the watcher.
2. **No photo capture in v0.** Defer to v0.1+.
3. **Share-sheet captures are identical to in-app text captures.** Same `.md` format, same `kind: capture`, no `source` discriminator. The body may be a URL; the existing capture() router already handles URLs.
4. **KB target identified by project slug** (e.g. `pool-servicing`). The phone enumerates `projects/*/.keel-kb.json` to list available KBs; the user picks one; the slug goes in the `target-kb` frontmatter field.
5. **Watcher scope:** Mac watches `incoming/` only. Routed captures surface through the existing in-app activity feed.
6. **Device provenance:** `device` (human-readable) is included in the routed capture body so projects can show "captured from iPhone." The `device-id` is recorded in the dedupe table but not surfaced in markdown.

## Verification plan

1. Install mobile app on iOS, point it at an iCloud-synced workspace.
2. Drop one text capture, one share-sheet capture (URL), and one KB source addition.
3. Confirm Mac watcher moves all three through `incoming` → `processing` → `processed`.
4. Confirm text/share captures land in the LLM-routed destination (project or inbox).
5. Confirm KB-source addition shows up inside the target project's KB and triggers an auto-recompile via the existing KB auto-refresh watcher.
6. Confirm dedupe: copy a file from `processed/` back into `incoming/` manually, verify it lands in `failed/` with reason `duplicate`.
7. Confirm conflict-copy handling: rename a file in `incoming/` to include `(conflicted copy 2026-05-09)`, verify watcher ignores it.
8. Confirm phone read surfaces: today's brief, tasks, recent captures, and a compiled KB page all render correctly.
9. Confirm phone never reads any file outside the workspace by inspecting the iOS file-provider access log.
