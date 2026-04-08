# Specs Index

This folder mixes three kinds of documents:

1. current-state contributor docs
2. active product or implementation specs
3. archived historical reference

Start here before treating any single spec as source of truth.

## Current-State Contributor Docs

- [`repository-architecture.md`](./repository-architecture.md)
  - Current runtime, storage, and module boundaries for the desktop app.
- [`contributor-playbook.md`](./contributor-playbook.md)
  - Practical guidance for common repo changes and verification.
- [`recent-product-evolution.md`](./recent-product-evolution.md)
  - Commit-log-driven timeline of the repo's current shape.

These files are intended to help Codex and human contributors orient quickly.

## Active Product And Implementation Specs

- [`llm-knowledge-bases.md`](./llm-knowledge-bases.md)
  - Product direction for LLM-maintained knowledge bases.
- [`wiki-ux.md`](./wiki-ux.md)
  - UX direction for the wiki workspace.
- [`wiki-information-flow.md`](./wiki-information-flow.md)
  - Canonical wiki home, ingestion, and synthesis-page flow.
- [`wiki-implementation-plan.md`](./wiki-implementation-plan.md)
  - Staged implementation plan for wiki work.
- [`settings-page-reorg.md`](./settings-page-reorg.md)
  - Settings information architecture and design direction.
- [`mac-dmg-packaging.md`](./mac-dmg-packaging.md)
  - Packaging intent and release expectations for macOS distribution.

These are useful for product intent and future work, but parts may still describe planned behavior rather than implemented behavior.

## Archived Historical Reference

- [`cloud-mobile-architecture.md`](./cloud-mobile-architecture.md)
  - Archived after the desktop-only refactor that removed the server, mobile app, and cloud auth runtime.

Use archived docs only when you need background on removed systems or to recover an old approach intentionally.

## Suggested Reading Order

1. [`../README.md`](../README.md)
2. [`repository-architecture.md`](./repository-architecture.md)
3. [`contributor-playbook.md`](./contributor-playbook.md)
4. the relevant product spec for the area you are changing

## Maintenance Rule

When the repo changes materially, update:

- `README.md`
- the relevant current-state doc in this folder
- any active product spec whose assumptions are no longer accurate
