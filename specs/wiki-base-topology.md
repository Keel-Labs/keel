# Wiki Base Topology

## Goal

Define a deeper model for how Keel’s wiki should evolve as new sources arrive, especially when:

- ingestion encounters a completely new topic
- a source belongs in a different base than where it first landed
- one base should split into two
- two bases should be combined

This spec assumes the current Keel wiki structure is the starting point, not a blank-slate redesign.

## Recommendation

Treat wiki bases as durable topic containers, but treat sources as portable assets with stable identities.

That implies three layers:

- source identity
- base membership
- synthesized wiki pages

The current system already has strong source packages and base-local wiki pages. The missing piece is explicit topology metadata so sources can move without losing lineage.

## Core Principles

- Raw source material is immutable.
- Source identity should survive base reassignment.
- Base membership can change over time.
- Synthesized pages are derived artifacts and can be regenerated.
- Split and merge operations are higher-risk than ordinary ingest and should be reviewable.

## Current Constraint

Today, sources live physically inside a base:

- `knowledge-bases/<slug>/raw/<sourceSlug>/`
- `knowledge-bases/<slug>/wiki/sources/<sourceSlug>.md`

This is simple for ingest, but it makes split and merge awkward because source storage and base membership are the same thing.

That coupling is acceptable for the current app, but it is the main blocker for safe base topology changes.

## Target Model

Keel should think in terms of four objects:

### 1. Source

An immutable unit of evidence.

Examples:

- one X post
- one article
- one pasted note
- one PDF

Required properties:

- stable `sourceId`
- origin provider
- external identity if available
- capture metadata
- content hash
- current base assignment
- assignment history

### 2. Base

A durable topic home.

Examples:

- `OpenAI API`
- `Keel Product Strategy`
- `SF Local Politics`

Required properties:

- stable `baseId`
- slug
- title
- description
- status
- topic fingerprint
- created-by metadata

### 3. Membership

A source-to-base relationship.

This should be explicit, even if the source still physically lives under a base-local path for now.

Required properties:

- `sourceId`
- `baseId`
- role
- confidence
- assignedAt
- assignedBy
- previousBaseId if moved

### 4. Topology Event

A durable record of structural changes.

Examples:

- base created from ingest
- source reassigned
- base split
- bases merged
- base archived

Required properties:

- event type
- timestamp
- actor
- affected base IDs
- affected source IDs
- rationale

## Recommended Storage Direction

### Near-term

Keep the current filesystem layout, but add explicit machine-readable metadata:

- `knowledge-bases/<slug>/topology.json`
- source-level `sourceId` and assignment metadata in `raw/<sourceSlug>/metadata.json`
- append-only topology events in `knowledge-bases/<slug>/wiki/log.md`

### Long-term

Move raw source packages toward a base-independent registry:

- `knowledge-sources/<sourceId>/`

Bases would then contain references and derived wiki pages, not the only copy of the raw source. That makes split and merge far safer because membership changes stop requiring destructive moves.

This is the deeper architectural direction I recommend, but it does not need to block v1 of X ingestion.

## Ingestion Decision Model

Every new source should produce one of three decisions:

- attach to an existing base
- create a new base
- hold for review

Recommended decision inputs:

- title and summary overlap with existing bases
- embedding similarity to base summaries and concept pages
- shared entities and authors
- source provenance patterns
- existing open questions or concept coverage

Recommended decision outputs:

- `attach`
- `create`
- `review`

Recommended policy:

- auto-attach when confidence is high
- auto-create only when confidence is high that the topic is novel
- review anything structurally ambiguous

## Auto-Creating New Bases

Auto-create is appropriate during ingestion when:

- no existing base is a strong semantic fit
- the topic appears likely to recur
- the source is rich enough to justify a durable topic container

Recommended safeguards:

- generate a tentative title and description from the source
- mark the base as `seeded-by-ingest`
- queue compile and health-check work after creation
- surface a lightweight inbox item so the user can rename or merge later

This keeps ingestion moving without pretending the first title is always right.

## Source Reassignment

Sometimes the first routing decision will be wrong. Reassignment must therefore be first-class.

Recommended behavior:

1. Preserve the source’s stable `sourceId`.
2. Record a topology event with old and new base IDs.
3. Move or re-link the source page to the new base.
4. Recompile both affected bases.
5. Leave an audit trail in both bases’ logs.

Do not silently rewrite history by pretending the source always belonged to the new base.

## Base Split

A split should happen when one base contains multiple coherent topic clusters that are no longer usefully served by one shared summary layer.

Signals for split:

- concept pages naturally cluster into separate themes
- sources link weakly across the cluster boundary
- compile outputs keep producing mixed or muddy summaries
- users repeatedly navigate to the same subset of sources together

Recommended split flow:

1. Detect a candidate cluster inside an existing base.
2. Produce a split plan listing the sources that should move.
3. Create a new destination base.
4. Reassign the selected sources to the new base.
5. Recompile both the original and new base from source truth.
6. Record a topology event and leave cross-links between the two bases.

Recommended safety rule:

- splitting should require human confirmation in v1

The reason is simple: splitting is structurally destructive, even if raw content is preserved.

## Base Merge

A merge should happen when two bases are semantically the same topic or have drifted into duplicate containers.

Signals for merge:

- high overlap in title, description, and concept language
- large overlap in source entities and cited material
- frequent cross-links between the two bases
- users repeatedly jump between both bases for the same task

Recommended merge flow:

1. Generate a merge plan with the candidate bases.
2. Pick a canonical destination base or create a new merged base.
3. Reassign all member sources into the destination.
4. Recompile the destination base from source truth.
5. Archive the old base or leave a redirecting overview.
6. Record lineage in topology metadata.

Recommended safety rule:

- merging should require human confirmation in v1

## Compile Strategy After Structural Changes

Do not try to preserve concept pages by hand across split and merge operations.

Recommended rule:

- preserve raw sources and event history
- regenerate concept pages, open questions, and synthesis outputs after structural changes

This is the cleanest way to avoid stale concepts following the wrong source set.

## Metadata Additions

Recommended base metadata in `topology.json`:

- `baseId`
- `title`
- `slug`
- `description`
- `status`
- `createdBy`
- `createdFromSourceIds`
- `mergedFromBaseIds`
- `splitFromBaseId`
- `archivedIntoBaseId`
- `topicFingerprint`

Recommended source metadata additions:

- `sourceId`
- `provider`
- `externalId`
- `assignedBaseId`
- `assignmentConfidence`
- `assignmentHistory`
- `seededNewBase`

## UX Model

Keel should expose topology changes as reviewable operations, not invisible background magic.

Recommended product surfaces:

- inbox item when a new base was auto-created
- review card when a source was hard to route
- split suggestion card when a base appears internally clustered
- merge suggestion card when two bases look duplicative

Recommended execution rule:

- attach and auto-create can be automatic
- split and merge should be approve-first

## Implementation Path

### Phase 1

- add stable source IDs
- add base topology metadata
- log source reassignment events

### Phase 2

- support source reassignment between bases
- recompile impacted bases automatically
- surface review items for ambiguous routing

### Phase 3

- split suggestion engine
- merge suggestion engine
- approve-first topology actions in the UI

### Phase 4

- optional migration to a global `knowledge-sources/` registry
- base pages become views over portable sources rather than source containers

## Risks And Tradeoffs

- Auto-create improves recall but can create base sprawl.
- Split and merge are powerful but can confuse users if lineage is not visible.
- A global source registry is cleaner architecturally but is a larger migration than v1 needs.
- Keeping base-local raw storage is simpler near-term but continues to tax structural edits.

## Definition Of Done

This spec is satisfied when the wiki model can:

- create a new base during ingestion when a topic is genuinely novel
- reassign a source from one base to another without losing lineage
- propose and execute a split with clear source movement and recompilation
- propose and execute a merge with clear lineage and archival behavior
- regenerate synthesized wiki pages after structural changes from preserved source truth
