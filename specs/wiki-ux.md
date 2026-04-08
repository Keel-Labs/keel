# Wiki UX Spec

## Goal

Define how `Wiki` should appear in Keel as a first-class workspace, replacing the current `Team Brain` surface with a richer, more navigable knowledge experience.

This spec is about product and interface direction only. It does not propose implementation details or code changes yet.

## Design Reference

This direction is influenced by the overall structure of Notion-style internal wikis, specifically the Blinkist hiring wiki reference the user shared.

The goal is not to clone Notion. The goal is to borrow the parts that make a wiki feel legible and welcoming:

- a calm hierarchical left rail
- a homepage for a wiki, not just a document list
- spacious reading surfaces
- lightweight organization through icons, labels, and grouped links
- minimal toolbar chrome

## Product Decision

Replace the current `Team Brain` app surface with `Wiki`.

### Shell Changes

Current shell language:

- sidebar nav includes `Teams`
- top mode switch includes `Team Brain`

Proposed shell language:

- sidebar nav: `Wiki`
- top mode switch: `Chat | Wiki`

This should be treated as a product capability, not as a team-specific collaboration concept.

## Core UX Thesis

`Wiki` should feel like opening a curated knowledge space, not browsing a folder or configuring a pipeline.

The user should land on:

- a wiki home page first
- a base synthesis page second
- raw file browsing only when needed

The reading experience should be primary. The storage model should stay in the background.

## What To Borrow From Notion

### Keep

- secondary left rail inside the workspace
- visible page hierarchy
- strong wiki homepage with grouped links
- large page title with generous top spacing
- subtle disclosure triangles and hover states
- lightweight icons or emoji for orientation

### Do Not Copy

- database-first UI everywhere
- extremely flat or washed-out contrast
- generic workspace metaphors detached from Keel's agent workflows
- overly abstract page furniture that makes reading feel secondary

## Keel-Specific Interpretation

Keel should merge Notion's wiki readability with a more agent-native workflow.

That means:

- cleaner, more editorial page surfaces
- stronger contrast than Notion
- fewer collaboration controls and fewer first-class system actions
- source ingestion happens inside the wiki workspace, not settings
- right-rail metadata focuses on provenance and update state when it adds value

## Information Architecture

The Wiki experience should have two navigation layers:

1. app-level navigation
2. wiki-level navigation

### 1. App-Level Navigation

Keel keeps the main shell:

- Search
- Chats
- Wiki
- Inbox
- Settings

### 2. Wiki-Level Navigation

Inside `Wiki`, prioritize:

- a home view for all bases
- a clear current-base synthesis page
- lightweight support navigation only where needed

Avoid making `Sources`, `Concepts`, and `Open Questions` feel like equal top-level modes in V1. They should primarily live inside the synthesis page.

## Layout Model

Use a simpler home-plus-synthesis layout in V1.

### Center Pane

Purpose:

- show wiki home
- show a base-level synthesis page
- act as the primary reading surface

### Optional Support Rail

Purpose:

- show page context and machine context without cluttering the document

Contents:

- source references
- related pages
- last updated
- compile state

The support rail can collapse on smaller widths.

## Primary Screens

### 1. Wiki Home

This should be the default landing state when a user enters `Wiki`.

It is the most important screen in the experience.

The page should include:

- `Wiki` title
- one-sentence explanation
- primary action: `Add Sources`
- secondary action: `Create Base`
- a scannable list of all wiki bases

Each base should present:

- title
- short summary
- source, concept, and open-question counts
- updated state

The visual tone should feel calm and editorial. The main job is to orient the user quickly.

### 2. Synthesis Page

When a user opens a base, the page should feel like a synthesized brief, not a widget canvas.

Structure:

- top banner with title and short description
- compact action row
- sticky section nav directly below the banner
- one continuous document flow

Required sections:

- `Summary`
- `Concepts`
- `Sources`
- `Open Questions`

Actions can include:

- `Add Sources`
- `Compile`
- `Health Check`

`Sources` and `Open Questions` should be visible inline, not hidden behind top-level tabs.

### 3. Raw Source Access

Raw source files remain important, but they should appear as provenance links inside the synthesis experience rather than as a primary navigation mode.

Each source item should expose:

- the visible wiki source page
- the raw normalized source file
- origin metadata when useful

- concept title
- one-line summary
- number of source refs
- last updated

This should feel browsable and editorial, closer to a table of contents than a file explorer.

### 5. Outputs View

This is where generated reports, answers, decks, and figures live.

Show:

- title
- output type
- date
- related pages

Outputs should feel like durable artifacts, not chat exhaust.

### 6. Health View

This page should show the state of the wiki as maintained by the agent.

Show:

- last health check
- warnings
- stale pages
- orphan pages
- suggested new pages

This can begin as a single rich report page in V1.

## Visual Language

### Tone

Calm, editorial, intentional.

The interface should feel like:

- a private research library
- a maintained notebook
- a document workspace

It should not feel like:

- a generic SaaS dashboard
- a busy productivity app
- a devtools panel

### Typography

Use clear hierarchy:

- large, assertive page titles
- quiet section labels
- readable body text
- restrained metadata styling

Titles and grouped headings should have more presence than in the current Knowledge Browser.

### Density

Use moderate density.

- left rail can be compact
- center pane should breathe
- right rail should stay light and scannable

### Iconography

Use icons sparingly:

- wiki/base icon
- section icons if helpful
- page-type icons in the tree

Icons should orient the user, not decorate every row.

### Surfaces

Recommended surface behavior:

- slightly muted left rail
- bright reading surface in center
- subtle utility rail on right

This creates a stronger sense of place than a single uniform background.

## Interaction Model

### Entering Wiki

When the user clicks `Wiki`, they should see:

- the last-opened base
- its home page
- the page tree expanded to the relevant section

If no base exists:

- show an empty state with `Create Wiki`

### Opening A Page

When a page is selected:

- load it into the center pane
- highlight its tree node
- populate the right rail
- preserve the wiki section context

### Switching Bases

Base switching should happen from the top of the left rail.

If multiple bases exist, show:

- current base name
- small icon
- dropdown affordance

### Quick Actions

At the top of the wiki surface, show:

- `Add Source`
- `Compile`
- `Ask`
- `Health Check`

These are not generic document actions. They are the key behaviors that make the wiki feel agentic.

## Proposed Wireframes

### Desktop Shell

```text
+----------------------------------------------------------------------------------+
| [Keel sidebar]        | Wiki                                                     |
| Search                |-----------------------------------------------------------|
| Chats                 | [Base: AI Research v]   Add Source  Compile  Ask  Health |
| Wiki                  |-----------------------------------------------------------|
| Inbox                 | +----------------------+--------------------------------+ |
| Settings              | | Home                 |                                | |
|                       | | Sources              |   [badge] AI Research Wiki     | |
|                       | | Concepts             |                                | |
|                       | | Open Questions       |   Big title                    | |
|                       | | Outputs              |   One-line thesis              | |
|                       | | Health               |                                | |
|                       | | Activity Log         |   Key Concepts | Key Sources   | |
|                       | |----------------------|   Open Questions | Outputs     | |
|                       | | index.md             |                                | |
|                       | | concepts/...         |   grouped link sections        | |
|                       | | sources/...          |                                | |
|                       | | log.md               |                                | |
|                       | +----------------------+--------------------------------+ |
|                       |                                         | Backlinks     | |
|                       |                                         | Source refs   | |
|                       |                                         | Related pages | |
|                       |                                         | Last updated  | |
+-----------------------+----------------------------------------------------------+
```

### Wiki Home

```text
+----------------------------------------------------------------------------------+
| [badge] AI Research Wiki                                                         |
|                                                                                  |
| AI-maintained research space for memory systems, agent workflows, and product    |
| direction.                                                                       |
|                                                                                  |
| [Add Source] [Compile Base] [Ask This Wiki] [Run Health Check]                   |
|                                                                                  |
| Sources 42   Concepts 18   Outputs 9   Last compile 2h ago                      |
|                                                                                  |
| Key Concepts                         Key Sources                                 |
| - Compiled Wiki                      - Karpathy LLM Wiki gist                    |
| - Ingest Architecture                - Agent memory survey                       |
| - Query Scaling                      - Long-context benchmark notes              |
|                                                                                  |
| Open Questions                       Recent Outputs                              |
| - When should outputs become pages?  - Comparison of memory approaches           |
| - How should repo ingest work?       - Slides for product review                 |
+----------------------------------------------------------------------------------+
```

### Page View

```text
+----------------------------------------------------------------------------------+
| AI Research / Concepts / Ingest Architecture                                     |
|----------------------------------------------------------------------------------|
| # Ingest Architecture                                                            |
|                                                                                  |
| Ingest is the foundation of the product...                                       |
|                                                                                  |
| ## Canonical Source Package                                                      |
| ...                                                                              |
|                                                                                  |
|                                                     Backlinks                    |
|                                                     - index.md                   |
|                                                     - Query Scaling              |
|                                                                                  |
|                                                     Source Refs                  |
|                                                     - karpathy gist              |
|                                                     - internal notes             |
|                                                                                  |
|                                                     Actions                      |
|                                                     [Ask about page]             |
|                                                     [Open raw sources]           |
+----------------------------------------------------------------------------------+
```

## V1 Scope

V1 should focus on making the wiki legible and navigable.

V1 includes:

- shell rename from `Team Brain` to `Wiki`
- wiki landing page
- secondary left rail
- grouped wiki sections
- page tree
- page reading surface
- right-rail metadata
- base selector
- top-level wiki actions

V1 should not try to include:

- rich inline block editing
- Notion-style databases everywhere
- drag-and-drop page layout builders
- deep collaboration UI
- complex multi-view toggles

## Open Questions

- Should `Wiki` support one base in the shell initially, or multiple bases from day one?
- Should `Sources`, `Concepts`, and `Outputs` each get dedicated collection views in V1, or should some of them begin as simple filtered page trees?
- Should the right rail stay always visible on desktop, or appear only for page views?
- How much emoji or iconography is appropriate before it stops feeling like Keel?

## Recommendation

The best first move is not "show wiki files".

The best first move is:

- rename the shell surface to `Wiki`
- create a strong wiki homepage
- add a Notion-like internal rail for structure
- keep the center pane document-first
- make agent workflows visible through a few deliberate actions

That will make the feature feel like a real knowledge workspace instead of a markdown browser.
