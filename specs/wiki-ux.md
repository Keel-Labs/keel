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

`Wiki` should feel like opening a curated knowledge space, not browsing a folder.

The user should land on:

- a wiki home page first
- a page tree second
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
- fewer collaboration controls in the top bar
- more visibility for agent actions like `Compile`, `Ask`, and `Health Check`
- right-rail metadata focused on sources, backlinks, and update state

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

Inside `Wiki`, add a secondary left rail with:

- base selector
- quick actions
- wiki sections
- page tree

Suggested structure:

- `Home`
- `Sources`
- `Concepts`
- `Open Questions`
- `Outputs`
- `Health`
- `Activity Log`

Below that:

- actual page tree for `wiki/index.md`, concept pages, source pages, outputs, and log pages

This separation matters:

- top section is product navigation
- bottom section is document navigation

## Layout Model

Use a three-column workspace layout.

### Left Rail

Purpose:

- switch bases
- trigger primary actions
- navigate sections
- browse page tree

Contents:

- wiki/base title and selector
- quick actions row
- grouped navigation
- nested page tree

### Center Pane

Purpose:

- show wiki homepage
- show selected page content
- act as the primary reading surface

Contents:

- page header
- page body
- grouped links or document content

### Right Rail

Purpose:

- show page context and machine context without cluttering the document

Contents:

- backlinks
- source references
- related pages
- last updated
- compile state
- page actions

The right rail can collapse on smaller widths.

## Primary Screens

### 1. Wiki Home

This should be the default landing state when a user enters a wiki/base.

It is the most important screen in the experience.

The page should include:

- base icon or badge
- large title
- one-line thesis or description
- quick action row
- summary stats
- grouped link sections

Suggested sections:

- `Key Concepts`
- `Key Sources`
- `Open Questions`
- `Recent Outputs`

Optional lower section:

- `Recent Activity`

The visual inspiration here should come directly from the Notion reference:

- large identity block
- clean two-column or four-section grouped lists
- mostly text links, not dashboard cards

### 2. Page View

When a user opens a page, the page should feel like a document, not a widget canvas.

Structure:

- breadcrumb or path
- large page title
- optional one-line summary or abstract
- content body in a readable document column

Right rail:

- backlinks
- source refs
- related pages
- last updated
- actions like `Ask about this page`, `Open raw sources`, `Compile affected pages`

### 3. Sources View

This is a wiki-specific collection view for all ingested sources.

It should not be only a folder tree.

Show:

- source title
- source type
- ingest status
- compile status
- last updated

Views:

- default list view
- optional grouped-by-type view later

Actions:

- add source
- retry ingest
- open raw package
- compile now

### 4. Concepts View

This is a curated list of synthesized concept pages.

Show:

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
