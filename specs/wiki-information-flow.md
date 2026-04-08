# Wiki Information Flow

## Goal

Define the simplest end-to-end user flow for Keel's wiki:

- how the user enters the wiki
- where source ingestion happens
- how bases are discovered
- how synthesized knowledge is read

This spec is the canonical UX flow for wiki navigation and source ingestion.

## Product Decision

Move source ingestion out of `Settings` and into the `Wiki` workspace.

Reasoning:

- ingesting sources is core wiki work, not app configuration
- users should see the result of ingestion in the same place they manage bases
- settings should only hold storage paths, defaults, and advanced behavior

## Core Flow

The wiki should have two primary screens:

1. `Wiki Home`
2. `Synthesis`

### 1. Wiki Home

This is the default landing page when the user enters `Wiki`.

The page should explain what has already been indexed and learned across all wiki bases.

It should answer:

- what wiki bases exist
- what each base is about
- how much has been learned
- what changed recently

Required content:

- page title and short explanation
- primary action: `Add Sources`
- secondary action: `Create Base`
- list of wiki bases

Each wiki base row or card should show:

- base title
- one-line plain-English summary
- source count
- concept count
- open question count
- last updated
- status when relevant

Clicking a base opens that base's `Synthesis` page.

### 2. Synthesis

This is the main reading surface for a single wiki base.

The page should be one continuous scrolling document, not a tabbed dashboard.

Required structure:

1. top banner
2. sticky section nav
3. summary section
4. concepts section
5. sources section
6. open questions section

The sticky section nav should sit directly below the top banner and allow quick jumps to:

- `Summary`
- `Concepts`
- `Sources`
- `Open Questions`

## Sources In Synthesis

`Sources` should be a section inside the synthesis page, not a separate workspace mode.

Each source item should show:

- source title
- short summary
- source type when available
- last updated or captured time when available
- link to the raw normalized source file
- link to the visible wiki source page when useful

The default reading flow should not require opening a separate sources screen.

## Open Questions In Synthesis

`Open Questions` should be visible in the same scrolling page as the summary and concepts.

This is an explicit part of the learned state, not an error mode.

Each question item should show:

- title
- short explanation
- optional linked sources

## Ingestion Flow

Source ingestion should start from `Wiki Home` or from an open `Synthesis` page.

Required actions:

- `Add Sources` on wiki home
- `Add Sources` on a base synthesis page

The flow should support:

- choosing an existing base
- creating a new base inline when needed
- adding a URL, pasted text, or supported file

The user should stay inside the wiki workspace throughout.

## Ingestion Feedback

Ingestion feedback should be lightweight and outcome-focused.

Preferred copy style:

- `Imported 1 source into Cisco Cloud Control`
- `Created source page and linked raw file`
- `Ready to compile`

Avoid exposing pipeline language such as:

- chunking
- embedding
- extraction pipeline
- vector sync

## Design Principles

- keep the wiki home list simple and scannable
- make the synthesis page read like a brief, not a dashboard
- collapse machine detail behind user-facing outcomes
- show provenance without forcing the user into a tooling view
- prefer one primary path over multiple competing navigation systems

## Non-Goals For This Slice

- separate full-screen collection views for sources, concepts, and open questions
- moving raw storage details into primary navigation
- using settings as the main entry point for knowledge work
