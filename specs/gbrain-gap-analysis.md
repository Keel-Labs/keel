# G-brain Gap Analysis

Source: https://github.com/garrytan/gbrain (Garry Tan / YC president's personal AI memory system)
Analyzed: 2026-04-24

## What G-brain is
Production knowledge management system for AI agents. Stores entities (people, companies, events), their relationships, and an append-only evidence trail. Hybrid vector + keyword search hits 97.9% recall@5. Garry's deployed instance: 17,888 pages, 4,383 people, 723 companies, 21 autonomous cron jobs.

## High Impact, Relatively Achievable

| Gap | G-brain | Keel today |
|---|---|---|
| **Hybrid search** | Vector + keyword + RRF fusion → 97.9% recall@5 | Pure vector similarity (much lower recall) |
| **Email ingestion** | Gmail → auto-extracted facts filed into brain | Not connected (Cortex F12) |
| **Entity graph** | Auto-detects people, companies, events; typed relationships (works_at, attended, invested_in) | No entity graph — flat files only |
| **Backlinks** | Bidirectional links between pages, enforced and queryable | No link graph |

## Medium Impact, Medium Effort

| Gap | G-brain | Keel today |
|---|---|---|
| **Compiled truth + timeline** | Current understanding (mutable) + append-only evidence trail (immutable) | Single file, overwrites |
| **Content deduplication** | Hash-based dedup across all ingested content | Not systematic |
| **Enrichment pipeline** | Progressively enriches stubs → full profiles as evidence accumulates | No progressive enrichment |
| **Brain health dashboard** | Stats, orphan detection, stale content, dead link fixing | No maintenance layer |
| **Knowledge gardening** | Automatic nightly cleanup, stale detection, merge duplicates | Not built (Cortex F17) |

## Lower Priority / Longer Term

| Gap | G-brain | Keel today |
|---|---|---|
| **MCP server** | 30+ tools exposed for Claude Code, Cursor, etc. | No MCP |
| **Version history + revert** | Full page versioning with UI | Git-based but no UI |
| **Publish / share** | Export knowledge as encrypted shareable HTML | PDF/Google Docs export only |
| **Durable background jobs** | Retry, backoff, rate limiting, crash-safe | Basic scheduled jobs |
| **Voice/phone** | Twilio phone calls → brain pages | Meeting recording only |

## Key Recommendations (when revisiting)

1. **Hybrid search** — highest ROI, self-contained change to retrieval layer, no UI work. Jumps recall from ~18% (vector-only) to ~97%. Improves every query: daily brief, capture routing, chat context.

2. **Entity graph** — enables Proactive Alerts (Cortex F10). "You haven't talked to Jake in 3 weeks" requires knowing Jake is a person you interact with.

3. **Email ingestion** — already on Cortex roadmap as F12 (P2).

## G-brain Technical Stack (for reference)
- TypeScript + Bun runtime
- PostgreSQL / PGLite (embedded zero-config)
- pgvector with HNSW for vector search
- OpenAI text-embedding-3-large
- Groq Whisper for transcription
- Twilio + OpenAI Realtime for voice
- S3-compatible file storage
