export const STAR_WARS_WIKI_SLUG = 'star-wars-ecosystem';

export function getStarWarsWikiFiles(): Array<{ path: string; content: string }> {
  const base = `knowledge-bases/${STAR_WARS_WIKI_SLUG}`;

  return [
    {
      path: `${base}/overview.md`,
      content: `# Star Wars Ecosystem

A sample wiki base for testing how Keel renders a dense, interlinked knowledge space. It covers the films, the major plot arcs, characters, planets, vehicles, species, Jedi, and Sith across the wider Star Wars galaxy.

## Key Concepts

- [Film Eras and Movies](wiki/concepts/movies/film-eras.md)
- [Major Galactic Conflicts](wiki/concepts/plots/galactic-conflicts.md)
- [The Jedi Order](wiki/concepts/jedi/jedi-order.md)
- [Sith Lineage](wiki/concepts/sith/sith-lineage.md)

## Key Sources

- [Skywalker Saga Source Guide](wiki/sources/skywalker-saga.md)
- [Clone Wars and Rebels Source Guide](wiki/sources/clone-wars-and-rebels.md)
- [Mandalorian Era Source Guide](wiki/sources/mandalorian-era.md)
- [Galactic Atlas and Craft Catalog](wiki/sources/galactic-atlas.md)

## Open Questions

- [What does balance in the Force actually mean?](wiki/open-questions/force-balance.md)
- [How coherent is post-Empire governance?](wiki/open-questions/post-empire-governance.md)

## Recent Outputs

- [Ecosystem Brief](outputs/reports/ecosystem-brief.md)
- [Jedi and Sith Comparison](outputs/reports/jedi-vs-sith.md)
`,
    },
    {
      path: `${base}/AGENTS.md`,
      content: `# AGENTS.md

This wiki is maintained as a sample Keel knowledge base.

## Structure

- \`overview.md\` is the front door for humans.
- \`wiki/index.md\` is the machine-readable map of important pages.
- \`wiki/log.md\` is the append-only activity log.
- \`wiki/sources/\` stores source summaries.
- \`wiki/concepts/\` stores synthesized concept pages.
- \`wiki/open-questions/\` stores unresolved questions and gaps.
- \`outputs/\` stores durable generated artifacts.
- \`health/\` stores health-check reports.

## Editing Rules

- Prefer updating existing concept pages over creating duplicates.
- Preserve links between movies, plots, characters, planets, species, vehicles, Jedi, and Sith.
- Cite source pages when synthesizing claims.
- Keep the raw source layer immutable.
- Append notable changes to \`wiki/log.md\`.
`,
    },
    {
      path: `${base}/wiki/index.md`,
      content: `# Wiki Index

## Sources

- [Skywalker Saga Source Guide](wiki/sources/skywalker-saga.md)
- [Clone Wars and Rebels Source Guide](wiki/sources/clone-wars-and-rebels.md)
- [Mandalorian Era Source Guide](wiki/sources/mandalorian-era.md)
- [Galactic Atlas and Craft Catalog](wiki/sources/galactic-atlas.md)

## Concepts

- [Film Eras and Movies](wiki/concepts/movies/film-eras.md)
- [Major Galactic Conflicts](wiki/concepts/plots/galactic-conflicts.md)
- [Luke Skywalker](wiki/concepts/characters/luke-skywalker.md)
- [Darth Vader](wiki/concepts/characters/darth-vader.md)
- [Tatooine](wiki/concepts/planets/tatooine.md)
- [Coruscant](wiki/concepts/planets/coruscant.md)
- [Millennium Falcon](wiki/concepts/vehicles/millennium-falcon.md)
- [X-Wing Starfighter](wiki/concepts/vehicles/x-wing-starfighter.md)
- [Wookiees](wiki/concepts/species/wookiees.md)
- [Twi'leks](wiki/concepts/species/twileks.md)
- [The Jedi Order](wiki/concepts/jedi/jedi-order.md)
- [Sith Lineage](wiki/concepts/sith/sith-lineage.md)

## Open Questions

- [Force Balance](wiki/open-questions/force-balance.md)
- [Post-Empire Governance](wiki/open-questions/post-empire-governance.md)

## Outputs

- [Ecosystem Brief](outputs/reports/ecosystem-brief.md)
- [Jedi and Sith Comparison](outputs/reports/jedi-vs-sith.md)
`,
    },
    {
      path: `${base}/wiki/log.md`,
      content: `# Wiki Log

## [2026-04-05] ingest | Sample Star Wars source set
Created sample source summaries for films, animated shows, the Mandalorian era, and reference material.

## [2026-04-05] compile | Initial concept pass
Built cross-linked concept pages for movies, plots, characters, planets, vehicles, species, Jedi, and Sith.

## [2026-04-05] health | Baseline health report
Flagged two open questions where the sample corpus stays intentionally incomplete.
`,
    },
    {
      path: `${base}/wiki/sources/skywalker-saga.md`,
      content: `# Skywalker Saga Source Guide

This source page summarizes the nine episodic films and the central family conflict that connects [Anakin Skywalker / Darth Vader](wiki/concepts/characters/darth-vader.md), [Luke Skywalker](wiki/concepts/characters/luke-skywalker.md), Leia Organa, Ben Solo, and Rey.

## Coverage

- The prequel trilogy establishes the fall of Anakin, the decay of the Republic, and the rise of Palpatine.
- The original trilogy tracks the Rebellion, Luke's growth as a Jedi, and Vader's redemption.
- The sequel trilogy revisits the legacy of the Jedi, the pull of the dark side, and the political vacuum after the Empire.

## Related Concepts

- [Film Eras and Movies](wiki/concepts/movies/film-eras.md)
- [Major Galactic Conflicts](wiki/concepts/plots/galactic-conflicts.md)
- [The Jedi Order](wiki/concepts/jedi/jedi-order.md)
- [Sith Lineage](wiki/concepts/sith/sith-lineage.md)
`,
    },
    {
      path: `${base}/wiki/sources/clone-wars-and-rebels.md`,
      content: `# Clone Wars and Rebels Source Guide

This source page covers the animated era between the prequels and the original trilogy. It expands the war's ground-level impact, the careers of Jedi beyond the films, and the slow formation of the Rebel Alliance.

## Highlights

- The Clone Wars deepen the tragedy behind the fall of the Republic.
- Ahsoka Tano complicates any simple reading of the Jedi Order's collapse.
- Rebels shows how localized resistance movements become a true rebellion.

## Related Concepts

- [Major Galactic Conflicts](wiki/concepts/plots/galactic-conflicts.md)
- [The Jedi Order](wiki/concepts/jedi/jedi-order.md)
- [Coruscant](wiki/concepts/planets/coruscant.md)
`,
    },
    {
      path: `${base}/wiki/sources/mandalorian-era.md`,
      content: `# Mandalorian Era Source Guide

This source page covers the post-Return of the Jedi period seen in The Mandalorian, The Book of Boba Fett, and Ahsoka.

## Highlights

- The New Republic appears administratively thin and strategically overextended.
- Imperial remnants persist in fragmented but dangerous forms.
- Force legacy and Mandalorian identity remain major drivers of conflict.

## Related Concepts

- [Post-Empire Governance](wiki/open-questions/post-empire-governance.md)
- [Tatooine](wiki/concepts/planets/tatooine.md)
- [Millennium Falcon](wiki/concepts/vehicles/millennium-falcon.md)
`,
    },
    {
      path: `${base}/wiki/sources/galactic-atlas.md`,
      content: `# Galactic Atlas and Craft Catalog

This source page acts as a compact reference for recurring places, species, and vehicles in the Star Wars setting.

## Highlights

- [Tatooine](wiki/concepts/planets/tatooine.md) symbolizes frontier survival and criminal influence.
- [Coruscant](wiki/concepts/planets/coruscant.md) represents centralized power and elite governance.
- [Millennium Falcon](wiki/concepts/vehicles/millennium-falcon.md) and [X-Wing Starfighter](wiki/concepts/vehicles/x-wing-starfighter.md) represent two different ideals of mobility: improvised survival and disciplined resistance.
- [Wookiees](wiki/concepts/species/wookiees.md) and [Twi'leks](wiki/concepts/species/twileks.md) show how species identity often intersects with power, labor, and occupation.
`,
    },
    {
      path: `${base}/wiki/concepts/movies/film-eras.md`,
      content: `# Film Eras and Movies

The Star Wars film ecosystem is usually grouped into three trilogies, with each era reframing the struggle between democracy, authoritarianism, Jedi tradition, and Sith ambition.

## Prequel Era

- The Phantom Menace
- Attack of the Clones
- Revenge of the Sith

This era explains the collapse of the Republic, the failures of [The Jedi Order](wiki/concepts/jedi/jedi-order.md), and the rise of [Darth Vader](wiki/concepts/characters/darth-vader.md).

## Original Era

- A New Hope
- The Empire Strikes Back
- Return of the Jedi

This era centers on the Rebellion, the journey of [Luke Skywalker](wiki/concepts/characters/luke-skywalker.md), and the redemption arc of Vader.

## Sequel Era

- The Force Awakens
- The Last Jedi
- The Rise of Skywalker

This era revisits the legacy of the Jedi and Sith while reopening questions about political continuity and institutional memory.

## Related Concepts

- [Major Galactic Conflicts](wiki/concepts/plots/galactic-conflicts.md)
- [Sith Lineage](wiki/concepts/sith/sith-lineage.md)
- [Skywalker Saga Source Guide](wiki/sources/skywalker-saga.md)
`,
    },
    {
      path: `${base}/wiki/concepts/plots/galactic-conflicts.md`,
      content: `# Major Galactic Conflicts

Star Wars repeatedly returns to the same structural plot: concentrated power rises, institutions fail to respond, and a scattered coalition must rebuild legitimacy under pressure.

## Core Conflicts

- Republic to Empire: corruption, war, and fear create the conditions for dictatorship.
- Empire to Rebellion: military occupation produces resistance networks.
- Empire to New Republic remnants: victory in war does not guarantee stable governance.
- Jedi to Sith: spiritual discipline and domination remain the franchise's central moral conflict.

## Related Pages

- [Film Eras and Movies](wiki/concepts/movies/film-eras.md)
- [The Jedi Order](wiki/concepts/jedi/jedi-order.md)
- [Sith Lineage](wiki/concepts/sith/sith-lineage.md)
- [Post-Empire Governance](wiki/open-questions/post-empire-governance.md)
`,
    },
    {
      path: `${base}/wiki/concepts/characters/luke-skywalker.md`,
      content: `# Luke Skywalker

Luke Skywalker is the clearest expression of the original trilogy's hopeful arc. He links farm-boy adventure, Jedi restoration, and filial reconciliation through his conflict with [Darth Vader](wiki/concepts/characters/darth-vader.md).

## Role In The Ecosystem

- central hero of the original trilogy
- symbolic rebuilder of Jedi tradition
- bridge between Anakin's fall and Vader's redemption

## Important Relationships

- [Darth Vader](wiki/concepts/characters/darth-vader.md)
- [The Jedi Order](wiki/concepts/jedi/jedi-order.md)
- [Tatooine](wiki/concepts/planets/tatooine.md)
- [X-Wing Starfighter](wiki/concepts/vehicles/x-wing-starfighter.md)
`,
    },
    {
      path: `${base}/wiki/concepts/characters/darth-vader.md`,
      content: `# Darth Vader

Darth Vader is the franchise's most important hinge character. As Anakin Skywalker, he embodies the fall of a gifted Jedi; as Vader, he becomes the enforcer of imperial order before ultimately returning to the light.

## Role In The Ecosystem

- tragic endpoint of Jedi failure
- primary symbol of Sith power under Palpatine
- personal and political antagonist to [Luke Skywalker](wiki/concepts/characters/luke-skywalker.md)

## Related Pages

- [Sith Lineage](wiki/concepts/sith/sith-lineage.md)
- [The Jedi Order](wiki/concepts/jedi/jedi-order.md)
- [Film Eras and Movies](wiki/concepts/movies/film-eras.md)
`,
    },
    {
      path: `${base}/wiki/concepts/characters/rey.md`,
      content: `# Rey

Rey anchors the sequel trilogy's debate over lineage, belonging, and what it means to inherit a broken legacy. Her story mirrors Luke's discovery arc but takes place in a more institutionally fragmented galaxy.

## Role In The Ecosystem

- main Force-sensitive protagonist of the sequel era
- inheritor of the Jedi legacy
- focal point for the question of whether the old Jedi model can be rebuilt

## Related Pages

- [Film Eras and Movies](wiki/concepts/movies/film-eras.md)
- [The Jedi Order](wiki/concepts/jedi/jedi-order.md)
- [Force Balance](wiki/open-questions/force-balance.md)
`,
    },
    {
      path: `${base}/wiki/concepts/planets/tatooine.md`,
      content: `# Tatooine

Tatooine is the iconic frontier planet of Star Wars. It is remote, under-governed, and deeply tied to smugglers, moisture farmers, bounty hunters, and people trying to survive on the edge of larger political systems.

## Why It Matters

- home world of key character origin stories
- recurring setting for criminal power and informal rule
- contrast point to [Coruscant](wiki/concepts/planets/coruscant.md)

## Related Pages

- [Luke Skywalker](wiki/concepts/characters/luke-skywalker.md)
- [Millennium Falcon](wiki/concepts/vehicles/millennium-falcon.md)
- [Mandalorian Era Source Guide](wiki/sources/mandalorian-era.md)
`,
    },
    {
      path: `${base}/wiki/concepts/planets/coruscant.md`,
      content: `# Coruscant

Coruscant is the center of galactic administration and elite power. It hosts the Senate, the Jedi Temple, and the bureaucratic machinery that eventually hardens into imperial rule.

## Why It Matters

- seat of the Republic and later imperial authority
- symbolic center of institutional scale and detachment
- home of the Jedi at the height of their political integration

## Related Pages

- [The Jedi Order](wiki/concepts/jedi/jedi-order.md)
- [Major Galactic Conflicts](wiki/concepts/plots/galactic-conflicts.md)
- [Clone Wars and Rebels Source Guide](wiki/sources/clone-wars-and-rebels.md)
`,
    },
    {
      path: `${base}/wiki/concepts/vehicles/millennium-falcon.md`,
      content: `# Millennium Falcon

The Millennium Falcon represents improvisation, speed, and survival through chaos. It is less a pristine war machine than a durable expression of smugglers, rebels, and found-family mobility.

## Why It Matters

- flagship vehicle of Han Solo and Chewbacca
- recurring connective tissue across trilogies
- iconic contrast to formal military craft like the [X-Wing Starfighter](wiki/concepts/vehicles/x-wing-starfighter.md)

## Related Pages

- [Wookiees](wiki/concepts/species/wookiees.md)
- [Tatooine](wiki/concepts/planets/tatooine.md)
- [Skywalker Saga Source Guide](wiki/sources/skywalker-saga.md)
`,
    },
    {
      path: `${base}/wiki/concepts/vehicles/x-wing-starfighter.md`,
      content: `# X-Wing Starfighter

The X-wing is the visual shorthand for disciplined rebel resistance. Unlike the Falcon, it belongs to coordinated squadrons and large-scale campaigns against imperial fleets.

## Why It Matters

- signature starfighter of the Rebel Alliance and New Republic
- tied to major battle sequences and pilot heroism
- strongly associated with [Luke Skywalker](wiki/concepts/characters/luke-skywalker.md)

## Related Pages

- [Major Galactic Conflicts](wiki/concepts/plots/galactic-conflicts.md)
- [Film Eras and Movies](wiki/concepts/movies/film-eras.md)
`,
    },
    {
      path: `${base}/wiki/concepts/species/wookiees.md`,
      content: `# Wookiees

Wookiees are one of the clearest examples of species identity carrying political weight in Star Wars. Through Chewbacca and Kashyyyk, they are linked to loyalty, resistance, and the costs of imperial occupation.

## Why They Matter

- central to Rebel-era alliance building
- often represented through themes of friendship and liberation
- tied to the Millennium Falcon crew dynamic

## Related Pages

- [Millennium Falcon](wiki/concepts/vehicles/millennium-falcon.md)
- [Skywalker Saga Source Guide](wiki/sources/skywalker-saga.md)
`,
    },
    {
      path: `${base}/wiki/concepts/species/twileks.md`,
      content: `# Twi'leks

Twi'leks appear across political, criminal, and resistance settings. Their repeated presence makes them useful for tracking how Star Wars depicts class, exploitation, diplomacy, and insurgency.

## Why They Matter

- visible across multiple eras and media
- connect underworld stories to rebellion stories
- often reveal regional and social complexity beyond the core film cast

## Related Pages

- [Clone Wars and Rebels Source Guide](wiki/sources/clone-wars-and-rebels.md)
- [Mandalorian Era Source Guide](wiki/sources/mandalorian-era.md)
`,
    },
    {
      path: `${base}/wiki/concepts/jedi/jedi-order.md`,
      content: `# The Jedi Order

The Jedi Order is both an ethical ideal and a failed institution. Star Wars continually asks whether the Order's discipline, detachment, and political role strengthened the galaxy or made it vulnerable to manipulation.

## Key Themes

- guardianship versus bureaucracy
- discipline versus emotional repression
- spiritual service versus state entanglement

## Related Pages

- [Luke Skywalker](wiki/concepts/characters/luke-skywalker.md)
- [Darth Vader](wiki/concepts/characters/darth-vader.md)
- [Sith Lineage](wiki/concepts/sith/sith-lineage.md)
- [Force Balance](wiki/open-questions/force-balance.md)
`,
    },
    {
      path: `${base}/wiki/concepts/sith/sith-lineage.md`,
      content: `# Sith Lineage

The Sith tradition organizes ambition, secrecy, and domination into a usable political program. In Star Wars, the Sith are rarely just villains; they are a durable counter-model to Jedi restraint.

## Key Themes

- power through fear and hierarchy
- apprenticeship as succession and betrayal
- the dark side as personal temptation and institutional method

## Related Pages

- [Darth Vader](wiki/concepts/characters/darth-vader.md)
- [The Jedi Order](wiki/concepts/jedi/jedi-order.md)
- [Major Galactic Conflicts](wiki/concepts/plots/galactic-conflicts.md)
`,
    },
    {
      path: `${base}/wiki/open-questions/force-balance.md`,
      content: `# Force Balance

The meaning of balance in the Force remains one of the most contested ideas in Star Wars.

## Current Tension

- Some readings treat balance as the defeat of the Sith.
- Others read balance as a more complex reconciliation of light and dark impulses.
- The franchise often uses the term symbolically without fully defining it.

## Related Pages

- [The Jedi Order](wiki/concepts/jedi/jedi-order.md)
- [Sith Lineage](wiki/concepts/sith/sith-lineage.md)
- [Rey](wiki/concepts/characters/rey.md)
`,
    },
    {
      path: `${base}/wiki/open-questions/post-empire-governance.md`,
      content: `# Post-Empire Governance

One persistent open question is why the galaxy appears politically fragile even after the defeat of the Empire.

## Current Tension

- The New Republic is present but thinly enforced.
- Imperial remnants survive longer than a simple victory narrative suggests.
- Later stories imply that military triumph did not produce durable civic legitimacy.

## Related Pages

- [Mandalorian Era Source Guide](wiki/sources/mandalorian-era.md)
- [Major Galactic Conflicts](wiki/concepts/plots/galactic-conflicts.md)
- [Coruscant](wiki/concepts/planets/coruscant.md)
`,
    },
    {
      path: `${base}/outputs/reports/ecosystem-brief.md`,
      content: `# Star Wars Ecosystem Brief

## Executive Summary

The Star Wars ecosystem works because it repeatedly recombines a small set of durable ideas: empire and rebellion, spiritual discipline and temptation, frontier survival and centralized power, inherited legacy and chosen identity.

## Most Important Pages

- [Film Eras and Movies](wiki/concepts/movies/film-eras.md)
- [Major Galactic Conflicts](wiki/concepts/plots/galactic-conflicts.md)
- [The Jedi Order](wiki/concepts/jedi/jedi-order.md)
- [Sith Lineage](wiki/concepts/sith/sith-lineage.md)

## Notable Open Questions

- [Force Balance](wiki/open-questions/force-balance.md)
- [Post-Empire Governance](wiki/open-questions/post-empire-governance.md)
`,
    },
    {
      path: `${base}/outputs/reports/jedi-vs-sith.md`,
      content: `# Jedi and Sith Comparison

## Jedi

- emphasize discipline, service, and restraint
- risk bureaucracy, detachment, and institutional blindness

## Sith

- emphasize will, domination, and emotional intensity
- produce unstable systems built on fear and betrayal

## Comparison

The Jedi and Sith are not just moral opposites. They are two governance models for power itself, and the franchise keeps testing both through characters like [Luke Skywalker](wiki/concepts/characters/luke-skywalker.md) and [Darth Vader](wiki/concepts/characters/darth-vader.md).
`,
    },
    {
      path: `${base}/health/latest.md`,
      content: `# Health Report

## Status

Healthy sample base with broad coverage across the requested Star Wars categories.

## Strong Coverage

- movies and trilogy eras
- central plot conflicts
- major character anchors
- representative planets
- representative vehicles and spacecraft
- representative species
- Jedi and Sith synthesis

## Gaps

- sequel-era institutional politics remain thinly sourced
- species coverage is representative, not exhaustive
- vehicle coverage focuses on iconic craft instead of a full taxonomy

## Recommended Next Pages

- a dedicated Leia Organa page
- a Clone Troopers page
- a Mandalorians page
`,
    },
  ];
}
