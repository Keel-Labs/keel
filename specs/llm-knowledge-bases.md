# LLM Knowledge Bases For Keel

## Goal

Make LLM-maintained knowledge bases a first-class Keel capability.

Keel should let a user collect source material, compile it into a linked markdown wiki, query it with an agent, generate durable outputs back into the workspace, and continuously improve the corpus over time.

This should feel like an extension of Keel's existing markdown brain, not a separate product bolted on beside it.

## Why This Matters

Karpathy's workflow is useful because it changes the role of the LLM:

- not just answering questions
- not just storing chat memory
- actively maintaining a durable knowledge artifact

The key product insight is not "RAG over documents". It is:

- raw sources are collected
- the LLM compiles them into a structured wiki
- future questions and outputs build on that wiki
- the corpus gets better every time the user uses it

Keel already has the beginnings of this:

- a markdown-backed personal brain
- local file watching and indexing
- markdown capture from URLs
- semantic search over chunks
- a knowledge browser
- markdown and document export

What is missing is the compiled-knowledge loop.

## Product Principle

Keel should treat knowledge bases as living workspaces with three content layers and one control layer:

1. `raw` sources
2. `wiki` compiled pages
3. `outputs` and `health` derived artifacts
4. `schema` rules that tell the agent how to maintain the base

The user should mostly operate through Keel. The LLM should do most of the writing and maintenance.

## Current State In Keel

Relevant existing surfaces:

- Local markdown brain structure via [src/core/fileManager.ts](/Users/djsam/.codex/worktrees/e0cb/Keel/src/core/fileManager.ts)
- Local indexing and file watching via [electron/main.ts](/Users/djsam/.codex/worktrees/e0cb/Keel/electron/main.ts)
- URL capture and filing via [src/core/workflows/capture.ts](/Users/djsam/.codex/worktrees/e0cb/Keel/src/core/workflows/capture.ts)
- Context assembly and semantic search via [src/core/contextAssembler.ts](/Users/djsam/.codex/worktrees/e0cb/Keel/src/core/contextAssembler.ts)
- Local search/index storage via [src/core/db.ts](/Users/djsam/.codex/worktrees/e0cb/Keel/src/core/db.ts) and [src/core/vectorStore.ts](/Users/djsam/.codex/worktrees/e0cb/Keel/src/core/vectorStore.ts)
- Current knowledge UI via [src/app/components/KnowledgeBrowser.tsx](/Users/djsam/.codex/worktrees/e0cb/Keel/src/app/components/KnowledgeBrowser.tsx)
- Cloud brain file model via [server/src/db/schema.ts](/Users/djsam/.codex/worktrees/e0cb/Keel/server/src/db/schema.ts) and [server/src/routes/brain.ts](/Users/djsam/.codex/worktrees/e0cb/Keel/server/src/routes/brain.ts)

Current gaps:

- no first-class distinction between raw sources and compiled wiki pages
- no research-base abstraction
- no source manifests, ingest jobs, or compile jobs
- no automatic backlinking or concept pages
- no scoped Q&A that writes answers back into the corpus
- no health checks for corpus integrity
- no artifact pipeline for slides, charts, or reusable reports
- current indexing is markdown-only and assumes files are user-authored notes

## User Outcomes

Keel should support these end states:

- "I can create a knowledge base for a topic or project."
- "I can drop in URLs, papers, repos, notes, datasets, and images."
- "Keel turns those into a maintained wiki without me hand-authoring it."
- "I can ask hard questions against that corpus."
- "Keel answers by writing markdown reports, slide decks, or visuals back into the workspace."
- "Those outputs become part of the knowledge base for future work."
- "Keel can audit the corpus for missing links, stale pages, contradictions, and promising follow-up questions."

## Proposed Capability

Introduce a new top-level concept: `Knowledge Base`.

Each knowledge base is a bounded workspace for one topic, initiative, or research thread.

Examples:

- AI coding agents
- customer research for Keel
- competitive intelligence
- team operating model
- a single large project with many reference documents

## Workspace Model

Add a new root folder:

```text
knowledge-bases/
  <base-slug>/
    overview.md
    AGENTS.md
    raw/
      <source-slug>/
        source.md
        metadata.json
        assets/
    wiki/
      index.md
      log.md
      sources/
      concepts/
      timelines/
      open-questions/
    outputs/
      answers/
      slides/
      reports/
      figures/
    health/
      latest.md
    .keel/
      jobs.json
      graph.json
```

Rules:

- `raw/` is immutable source capture plus extracted metadata
- `wiki/` is LLM-maintained compiled knowledge
- `outputs/` is generated work product from questions and analyses
- `health/` stores audit reports and suggested follow-up work
- `AGENTS.md` is the knowledge-base schema and operating manual for the agent
- `wiki/log.md` is append-only history for ingest, query, and maintenance activity
- `.keel/` stores machine state and should not be indexed as user knowledge

## Schema Layer

Karpathy's gist adds an important architectural point: the wiki is not enough by itself. The agent also needs a schema document that tells it how to behave as a disciplined maintainer.

For Keel, that should be a per-base [AGENTS.md](/Users/djsam/.codex/worktrees/e0cb/Keel/AGENTS.md)-style file stored at `knowledge-bases/<base>/AGENTS.md`.

This file should define:

- page types and folder conventions
- ingest workflow
- question-answering workflow
- citation rules
- link and backlink conventions
- frontmatter conventions if used
- when to create a new concept page versus update an existing page
- health-check expectations

This is a real product requirement, not prompt garnish. Without it, the agent will behave like a generic chatbot and the wiki will drift.

## Source Packaging

Every source should become a small source package, not just a single note dumped into a folder.

For each source, Keel stores:

- canonical source title
- source type
- captured timestamp
- provenance URL or import path
- extracted markdown text
- asset references
- optional short human note about why it matters
- ingest status

Supported source types for V1:

- URL article
- pasted text
- existing markdown file
- Google Doc
- PDF
- Microsoft Word (`.docx`)
- Microsoft PowerPoint (`.pptx`)
- screenshots and image captures

Supported source types for V2:

- image set
- local folder import
- Git repo snapshot
- CSV or dataset manifest

## Ingest Architecture

Ingest is the foundation of the product, not a side feature.

Keel should not build a separate end-to-end pipeline for every source type. It should define one canonical ingest contract and let each connector map into it.

### Core Rule

Every imported source must become a normalized source package inside the knowledge base.

That normalized package is what the compiler, search layer, health checks, and query workflows consume.

### Canonical Source Package

Each source package should contain:

- raw artifact or raw capture
- extracted markdown text
- source metadata
- provenance
- linked assets
- ingest status
- extraction warnings or confidence notes when relevant

Recommended shape:

```text
raw/
  <source-slug>/
    source.md
    metadata.json
    assets/
      ...
```

`source.md` should be the normalized semantic representation.

`metadata.json` should include:

- `sourceType`
- `title`
- `origin`
- `capturedAt`
- `importedBy`
- `extractor`
- `contentHash`
- `language`
- `mimeType`
- `warnings[]`
- `assetPaths[]`
- `status`

### Pipeline Stages

Ingest should be implemented as four stages:

1. `Connector`
2. `Extractor`
3. `Normalizer`
4. `Compiler trigger`

#### 1. Connector

The connector fetches or imports the source.

Examples:

- URL fetcher
- Google Doc reader
- local file import
- folder import
- repo import
- image upload

Connector responsibility:

- retrieve the source
- capture source identity
- preserve raw bytes or original content when useful
- avoid making semantic decisions

#### 2. Extractor

The extractor converts the source into usable content.

Examples:

- Readability for articles
- markdown passthrough for existing notes
- PDF text extraction
- OCR for screenshots
- transcript generation for audio
- repo summarization for codebases

Extractor responsibility:

- produce the best available markdown or text representation
- identify embedded assets
- emit warnings when extraction is incomplete or lossy

#### 3. Normalizer

The normalizer maps the extracted content into the canonical source package.

Normalizer responsibility:

- create `source.md`
- create `metadata.json`
- store assets in a predictable place
- generate a stable slug
- compute dedupe hashes
- mark the package ready for compile

#### 4. Compiler Trigger

Once a source package is valid, Keel should enqueue a compile job for the relevant base.

This stage should be explicit so ingest and compile can fail or retry independently.

### Architectural Principles

- Raw is immutable.
  Keel should never silently overwrite source evidence after capture.
- Markdown is the common denominator.
  Most downstream systems should operate on normalized markdown, not source-specific formats.
- Provenance is mandatory.
  Every synthesized claim must be traceable back to a source package.
- Binary storage and semantic storage are different concerns.
  PDFs, images, and audio may be stored, but extracted text should be the indexed default.
- Ingest must be resumable.
  Slow, flaky, or partial imports are normal.
- Source-specific logic should stay at the edge.
  Only connectors and extractors should care whether something came from a URL, PDF, repo, or screenshot.

### Source Categories

Keel should think about sources by extraction difficulty, not only by connector name.

#### V1: Low-friction text-first sources

- URL articles
- pasted text
- markdown files
- Google Docs
- PDFs
- Microsoft Word (`.docx`)
- Microsoft PowerPoint (`.pptx`)
- screenshots

These are enough to prove the loop, and they cover the core real-world research workflow better than a text-only V1.

#### V2: Document-heavy sources

- slide decks
- HTML pages with poor structure
- image sets
- image attachments associated with a source

#### V3: High-variance sources

- repos
- datasets
- screenshots
- audio and voice memos
- email threads
- chat exports

These require more specialized extraction and stronger metadata.

### Source-Type Notes

#### Web articles

Preferred flow:

- fetch page
- extract readable body
- save canonical URL and capture time
- store downloaded images when available

#### Google Docs

Preferred flow:

- use the Docs API as the source of truth
- store doc URL and doc ID
- preserve extracted structure where possible

#### PDFs

Preferred flow:

- store original PDF as an attachment
- extract text into markdown
- record page-count and extraction quality

#### Microsoft Word (`.docx`)

Preferred flow:

- store original `.docx` as an attachment
- extract document structure into markdown
- preserve headings, tables, and lists where feasible
- record extraction warnings when formatting fidelity is partial

#### Microsoft PowerPoint (`.pptx`)

Preferred flow:

- store original `.pptx` as an attachment
- extract slide titles, bullets, speaker notes, and basic slide ordering into markdown
- capture embedded images as assets when practical
- record slide count and extraction quality

#### Images and screenshots

Preferred flow:

- store original image
- run OCR or image captioning
- keep image references in metadata and markdown
- preserve capture time and source context when available

#### Repos

Repos should not be treated like plain text dumps.

A repo package should likely include:

- repo metadata
- top-level README
- file tree summary
- key file excerpts
- generated architectural summary

This should remain V2 or later because it is materially different from document ingest.

### Job Model

Each ingest should produce a tracked job with distinct states:

- `queued`
- `fetching`
- `extracting`
- `normalizing`
- `ready_for_compile`
- `failed`
- `completed`

This should be separate from compile jobs.

Reasons:

- ingest can succeed while compile fails
- extraction retries should not rewrite the raw package
- the UI needs to show where a source is stuck

### Failure Handling

Failure should not be binary.

Keel should support:

- partial success with warnings
- retry from a failed stage
- manual review for lossy extractions
- duplicate detection before compile

Examples:

- URL fetch succeeded but readability extraction was weak
- PDF imported but OCR confidence is low
- repo cloned but summarization failed

### Deduplication

Ingest should perform lightweight dedupe before compile.

Signals:

- canonical URL match
- content hash match
- title plus near-duplicate extracted text

Default behavior:

- flag likely duplicates
- let the user merge or keep both
- do not silently delete either source

### UX Implications

The ingest UI should make source state legible.

For each source, show:

- title
- source type
- ingest status
- extraction warnings
- compile status
- provenance
- last updated time

Primary actions:

- add source
- retry ingest
- open raw package
- compile now
- exclude from compile

### Search Implications

Search should primarily index normalized markdown plus selected metadata.

Index by default:

- `source.md`
- wiki pages
- output artifacts

Filterable metadata later:

- source type
- ingest status
- capture date
- tags
- confidence or warning state

### Recommendation

For Keel, ingest should be built as a stable normalization pipeline with pluggable connectors.

If that layer is clean:

- new source types become incremental additions
- the compiler stays simple
- the wiki stays source-agnostic
- the product can expand without turning into connector spaghetti

## Compiled Wiki Behavior

The compiler should produce and maintain a wiki, not just one summary per source.

Required wiki outputs:

- `wiki/index.md`: map of the base, major themes, and navigation entry points
- `wiki/sources/*.md`: one normalized page per source with summary, key claims, and backlinks
- `wiki/concepts/*.md`: synthesized topic pages across multiple sources
- `wiki/open-questions/*.md`: unresolved issues or gaps
- `wiki/timelines/*.md`: optional chronology pages when the corpus is time-based

Compiler behaviors:

- detect when a new source should create a new concept page
- update index pages incrementally instead of rewriting everything blindly
- maintain backlinks between sources, concepts, and outputs
- cite source pages when synthesizing claims
- preserve stable slugs so links do not churn
- prefer additive edits over destructive rewrites
- allow a single ingest to touch many pages when warranted

Expected ingest behavior:

1. Read the raw source
2. Produce or update a source summary page
3. Update `wiki/index.md`
4. Update affected concept, entity, comparison, or timeline pages
5. Flag contradictions or stale claims
6. Append an event to `wiki/log.md`

## Retrieval Strategy

Do not frame this as "build fancy RAG first".

For the initial implementation, Keel should use:

- filesystem hierarchy as the primary structure
- LLM-maintained index pages as the first navigation layer
- FTS and vector search as accelerators
- targeted source reads after candidate pages are identified

This matches both the X-post and Keel's current architecture.

Expected query flow:

1. Read `overview.md` and `wiki/index.md`
2. Read relevant concept and source index pages
3. Use FTS and semantic search to find missing supporting evidence
4. Pull specific raw or wiki pages into context
5. Answer by producing a durable artifact, not only chat text

At moderate scale, `wiki/index.md` should remain the first navigation layer. Search tooling becomes important later, but should be treated as an accelerator, not the core product abstraction.

## Output Model

Keel should treat "answering a question" as producing a file.

Primary output formats:

- markdown report
- markdown brief
- Marp slide deck
- figure spec plus generated image

Output rules:

- every generated artifact gets saved under `outputs/`
- outputs include source references to the wiki or raw pages used
- the user can optionally "file back" an output into the wiki as a source or concept page
- chat can show the result inline, but the file is the durable product

Expected query behavior:

1. Read the schema and current wiki index
2. Find relevant pages
3. Synthesize an answer with citations
4. Save the result as an artifact
5. Optionally promote the artifact into the wiki if it has lasting value

## Health Checks

Knowledge-base maintenance should be a first-class workflow.

Health check jobs should be able to:

- find missing source metadata
- find orphaned pages with no backlinks
- identify concept pages with weak source grounding
- detect duplicate concepts or near-duplicate source pages
- flag stale wiki pages after raw sources change
- suggest new concept pages
- suggest unresolved questions worth investigating

Health checks should write a markdown report to `health/latest.md` and expose actionable follow-ups in the UI.

Expected lint behavior:

1. Read the schema, index, and recent log entries
2. Scan for consistency and coverage problems
3. Produce a report
4. Optionally stage suggested wiki edits for review or apply safe updates directly

## Indexing And Logging

The gist usefully separates two special files:

- `wiki/index.md`: content-oriented navigation
- `wiki/log.md`: chronological activity history

Keel should adopt both explicitly.

`wiki/index.md` should contain:

- page links
- one-line summaries
- category grouping
- optional metadata such as source counts or last-updated dates

`wiki/log.md` should contain:

- ingest events
- user questions that generated durable outputs
- lint and health-check runs
- major schema changes

Log entries should use a stable parseable format, for example:

```md
## [2026-04-05] ingest | Attention Is All You Need
## [2026-04-05] query | Compare agent memory approaches
## [2026-04-05] lint | Weekly health check
```

This gives both the agent and the user a cheap operational timeline without needing database queries for every inspection.

## UX Direction

This should become a visible product capability, not a hidden folder convention.

### New Surface

Add a dedicated `Knowledge Bases` surface inside the existing Knowledge area.

Primary views:

- all bases
- base overview
- sources
- wiki
- outputs
- health

### Base Overview

Show:

- base description
- source counts
- compile status
- last updated time
- key concept pages
- open questions
- recent outputs

### Ingest Actions

V1 actions:

- add URL
- paste text
- import markdown
- import Google Doc

V2 actions:

- import PDF
- add image assets
- import repo
- import folder

### Ask Mode

The user should be able to ask a question scoped to a base and choose an output format:

- answer as note
- answer as report
- answer as slides

The default should be "write a markdown artifact and show it in chat".

## Suggested File And API Changes

Desktop and local-first changes:

- extend [src/core/fileManager.ts](/Users/djsam/.codex/worktrees/e0cb/Keel/src/core/fileManager.ts) to create and manage `knowledge-bases/`
- extend [electron/main.ts](/Users/djsam/.codex/worktrees/e0cb/Keel/electron/main.ts) indexing rules so base markdown files are watched and indexed
- add knowledge-base workflow modules under `src/core/workflows/`
- extend [src/shared/types.ts](/Users/djsam/.codex/worktrees/e0cb/Keel/src/shared/types.ts) with knowledge-base, source, job, and artifact types
- extend [src/app/components/KnowledgeBrowser.tsx](/Users/djsam/.codex/worktrees/e0cb/Keel/src/app/components/KnowledgeBrowser.tsx) to expose bases as first-class navigable objects
- add per-base schema bootstrapping so every new base gets an agent instruction file

Cloud parity changes:

- add knowledge-base metadata tables instead of relying only on path naming
- add source and artifact registries
- add job status tracking for ingest, compile, and health runs
- keep markdown file contents as canonical artifacts in `brain_files`, but track richer metadata separately

## Data Model

V1 can stay mostly file-first, but should introduce explicit metadata.

Minimum metadata objects:

- `KnowledgeBase`
  - `id`
  - `slug`
  - `title`
  - `summary`
  - `status`
  - `createdAt`
  - `updatedAt`

- `KnowledgeSource`
  - `id`
  - `baseId`
  - `slug`
  - `sourceType`
  - `title`
  - `origin`
  - `capturedAt`
  - `compileState`
  - `rawPath`
  - `assetPaths[]`

- `KnowledgeArtifact`
  - `id`
  - `baseId`
  - `artifactType`
  - `title`
  - `path`
  - `createdAt`
  - `sourceRefs[]`

- `KnowledgeJob`
  - `id`
  - `baseId`
  - `jobType`
  - `status`
  - `startedAt`
  - `finishedAt`
  - `log`

## LLM Responsibilities

The LLM should be responsible for:

- source summarization
- concept extraction
- incremental wiki edits
- backlink suggestions
- answer synthesis
- health-check reporting

The application should be responsible for:

- workspace structure
- job orchestration
- source provenance
- indexing and search
- file durability
- generating and evolving a default schema template
- exposing outputs in UI

This split matters. Keel should not hardcode the ontology of every topic into product code.

## Proposed Commands And Actions

User-facing actions for V1:

- `Create knowledge base`
- `Add source`
- `Compile base`
- `Ask base`
- `Run health check`
- `Export output`

Possible chat-level affordances:

- `/kb create <name>`
- `/kb add <base> <url-or-note>`
- `/kb compile <base>`
- `/kb ask <base> <question>`
- `/kb health <base>`

The UI should exist even if command aliases are added later.

## V1 Scope

V1 should prove the loop, not solve every ingest format.

V1 includes:

- create and list knowledge bases
- ingest URLs, pasted text, markdown, Google Docs, PDFs, `.docx`, `.pptx`, and screenshots
- create source packages under `raw/`
- generate a per-base `AGENTS.md` schema file from a Keel template
- compile source summaries and concept pages into `wiki/`
- maintain `wiki/index.md`
- append `wiki/log.md`
- scoped Q&A that writes markdown outputs under `outputs/answers/`
- health check report generation
- local-first storage and indexing

V1 explicitly does not include:

- full repo ingestion
- dataset parsing beyond metadata capture
- automated figure generation beyond basic markdown artifacts
- collaborative editing semantics
- fine-tuning or synthetic data generation

## V2 Scope

V2 should add breadth and polish:

- repo and folder import
- richer graph navigation and backlinks UI
- Marp slide generation
- figure generation pipeline
- better artifact filing back into the wiki
- structured frontmatter and queryable metadata where it adds clear value
- cloud-backed job orchestration and sync
- team-shared knowledge bases

## Non-Goals

- replacing the personal brain and project/task model
- building a generic enterprise document warehouse
- forcing vector search into the center of the system
- exposing raw chain-of-thought or unstable internal compiler traces
- adding fine-tuning before the core loop is proven

## Risks

### Scope Creep

This can easily expand into:

- document management
- notebook software
- graph database tooling
- enterprise search

V1 should stay focused on the compile-query-improve loop.

### Hallucinated Wiki Drift

If the compiler rewrites too aggressively, the wiki will become untrustworthy.

Mitigations:

- keep raw source packages immutable
- require citations or source refs in synthesized pages
- prefer incremental page updates
- expose stale or low-confidence pages in health checks

### Storage And Asset Sprawl

Raw assets can get large quickly.

Mitigations:

- keep extracted markdown as the indexed default
- allow original binaries as optional attachments
- add retention controls later

### Product Positioning

Keel is currently framed as a personal AI chief of staff.

This feature fits if positioned as:

- a research and reasoning workspace inside the chief-of-staff product

It does not fit if positioned as:

- a totally separate knowledge-management platform

### Query Scaling

The gist is intentionally optimistic about how far index-first navigation can go.

That is directionally right, but only up to moderate scale. Once a base has hundreds of pages, users will want structured filtering, not just file reading.

Implication for Keel:

- V1 can be file-first and index-first
- V2 should add richer metadata, structured search, and better query surfaces
- the markdown wiki remains the human-readable artifact even if metadata becomes database-backed

### Trust And Validation

The gist assumes the LLM can keep the wiki coherent if given a good process.

That is mostly true, but a product needs harder guardrails:

- provenance for every source
- clear distinction between raw evidence and synthesized claims
- stale-page detection after source updates
- visible audit trails for major agent edits

## Recommendation

Ship this as `Knowledge Bases`, not as an invisible upgrade to `projects/`.

That gives Keel:

- a clear mental model
- a durable user-facing feature
- room for scoped UX and job orchestration
- a path from simple markdown brain to agent-maintained knowledge workspace

## First Implementation Slice

The smallest meaningful slice is:

1. Add `knowledge-bases/` to the local workspace model
2. Let the user create one base with `overview.md`
3. Add URL and pasted-text ingest into `raw/<source>/source.md`
4. Add a compile action that creates `wiki/index.md`, `wiki/sources/*`, and `wiki/concepts/*`
5. Add an ask action that writes `outputs/answers/<timestamp>-<slug>.md`
6. Add a health check action that writes `health/latest.md`

If this slice feels good, the rest is an extension problem rather than a product-definition problem.

## Open Questions For Review

- Should knowledge bases live only on desktop at first, or must cloud parity ship in the first release?
- Should outputs automatically become wiki inputs, or should filing back stay explicit?
- Should base creation be scoped to research topics only, or also used for large work projects?
- Should Keel maintain a lightweight metadata registry from day one, or start purely file-first and add DB tables later?
