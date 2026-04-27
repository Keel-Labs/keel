# Onboarding Comprehension Roadmap (PR 3–5)

Deferred plan for deepening Keel's onboarding. The MVP that shipped is **PR 1 (folder pick + PARA scaffold) + PR 2 (explicit input: projects, people, doc links)**. We deliberately chose explicit input over automated scanning for the MVP because:

- Folder content is wildly variable in quality — first-impression risk is high
- Cost + latency at the worst possible moment (first 5 minutes with the app)
- LLM categorization can be wrong; user-provided context is high-signal by definition
- Explicit input sets the right mental model: "Keel knows what I tell it"
- Works equally for fresh-folder and existing-folder users
- ½ day of work vs 3+ days

The automated scan / world-model build below is the v2 enhancement, opt-in from a "Reorganize my brain" command after users have built trust.

Saved: 2026-04-24
Status: Deferred. Revisit after we have telemetry on how often users add docs at onboarding vs later.

---

## PR 3 — Project clustering + PARA proposal UI (~5 days)

Goal: propose moves, never execute without consent.

- Embed each file's PR2 summary, cluster via cosine similarity / HDBSCAN
- LLM names each cluster ("Q3 fundraising", "Apartment hunt", "Coursera ML class")
- UI: each cluster as a card with:
  - Member files list (editable — add/remove)
  - Suggested PARA bucket (Projects/Areas/Resources/Archive), editable
  - Cluster name, editable
  - Accept / Reject / Edit-members buttons
- On accept: move files, write `~/Keel/.keel/import-manifest-{timestamp}.json`
  - Manifest schema: `{ timestamp, moves: [{from, to, hash}] }`
- Undo button reads manifest, reverses moves in LIFO order
- Symlink mode (opt-in): leave originals in place, symlink into PARA — for users who can't tolerate moves

Risk areas:
- Files referenced by external tools break when moved → symlink mode mitigates
- Cluster boundaries fuzzy → always allow manual edit before accept
- Cost: embedding 500 files is cheap (~$0.05) but cluster naming adds ~$0.20

## PR 4 — Entity extraction + graph seed (~4 days)

Goal: build the actual world model from user content.

- Per file: structured LLM extraction of `{ people: [], companies: [], projects: [], dates: [], topics: [] }`
- Persist to SQLite (`~/Keel/.keel/entities.db`):
  - `people(id, name, aliases, first_seen, last_mentioned, mention_count)`
  - `companies(id, name, aliases, ...)`
  - `projects(id, name, status, ...)`
  - `mentions(entity_id, entity_type, file_path, context_snippet, date)`
- Dedupe within run: "Sarah Chen" == "Sarah" when co-occurring in same project
- Cross-run dedupe: fuzzy match against existing entity names before insert
- Seed brain files:
  - `people/{slug}.md` with what was learned ("First mentioned: 2024-Q3 fundraising notes. Affiliations: Acme Corp.")
  - `projects/{slug}/context.md` with extracted goals/dates/people
- This unlocks: proactive alerts, "haven't talked to X in N weeks", daily brief context, capture routing

Risk areas:
- Entity dedup is hard — false merges destroy trust. Conservative: require ≥2 signals to merge.
- Privacy — extracted entities should never leave device. Use local model fallback (ollama) when configured.

## PR 5 — Robustness (~3 days)

Goal: production-ready ingest for real-world folders.

- Background job runner with crash recovery
  - Job state in SQLite: `{ files_pending, files_done, current_batch, retries }`
  - Resume from last completed batch on app restart
- Rate limit + exponential backoff on LLM calls (handle 429s gracefully)
- File parsers:
  - PDF: `pdf-parse` (pure JS, no native deps)
  - DOCX: `mammoth`
  - EML/MBOX: `mailparser`
  - HTML: extract readable text only (`@mozilla/readability`)
- Incremental re-scan via filewatcher (`chokidar`):
  - Only process new/modified files since last scan
  - Debounce 30s to avoid thrashing on bulk changes
- Cost estimator before scan:
  - Estimate token count from file sizes
  - Show: "Found 312 files (~2.4M tokens). Estimated cost: $0.40 with Claude Haiku."
  - Require explicit "Start scan" click

Risk areas:
- Large folders (5GB+) — need streaming, not load-into-memory
- Encrypted/locked files — skip gracefully with manifest entry
- Network failures mid-scan — must resume cleanly

---

## Total deferred effort: ~12 working days

After PR 1 + PR 2 ship (~5 days combined), this roadmap delivers the full "Keel comprehends your world" experience over ~12 more days of focused work. Sequence them as separate user-visible releases ("Reorganize my brain", "Build my people graph", "Watch for changes") so users opt in after they've built trust with the basic scan.
