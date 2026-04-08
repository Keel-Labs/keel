# Settings Page Reorg

## Goal

Reorganize the settings page into a durable information architecture that can grow over time, starting with a desktop-style left rail and clearer visual distinction between setting types.

The page should feel like a real settings system, not a single long form.

## Layout Direction

Use a desktop-style settings layout:

- Persistent left rail for navigation
- Large main content pane for the selected subsection
- Clear section titles and short one-line intros
- Consistent visual patterns for different setting types

## Top-Level Navigation

- General
- AI
- Knowledge
- Integrations
- Cloud
- Advanced

### Subsections

#### General

- Personal Settings
- Workspace
- Notifications

#### AI

- Provider
- Models
- Local AI

#### Knowledge

- Data Storage
- Wiki Storage
- Team Brain

#### Integrations

- Google

#### Cloud

- Sync & Migration

#### Advanced

- Developer

## Section Intent

### General / Personal Settings

This is the first section under General and should be treated as an expandable home for user-level preferences.

Current settings:

- User name
- Timezone

Future settings:

- What Keel should call you
- Personal response preferences
- Work hours
- Notification defaults

### General / Workspace

Workspace-level behavior and scheduling.

Current settings:

- Daily brief time
- End-of-day summary time

### General / Notifications

Reserved for future notification preferences. If not fully implemented, show a clear placeholder state.

### AI / Provider

Choose the active provider and configure provider credentials.

Current settings:

- Provider
- Anthropic API key
- OpenAI API key
- OpenRouter API key

### AI / Models

Provider-specific model and runtime settings.

Current settings:

- Claude model
- OpenAI model
- OpenRouter model
- OpenRouter base URL

### AI / Local AI

Everything specific to Ollama.

Current settings:

- Ollama model
- Ollama model discovery and runtime status

### Knowledge / Data Storage

Local data storage configuration.

Current settings:

- Brain path

### Knowledge / Wiki Storage

Knowledge-specific storage defaults and diagnostics.

Current settings:

- brain path visibility
- storage diagnostics when needed

Explicit non-goal:

- source ingestion should not live here

### Knowledge / Team Brain

Shared knowledge configuration and team context.

Current settings:

- Team brain path
- Team brain status

### Integrations / Google

Connection state and sync actions for Google integration.

Current settings:

- Connected state
- Connect action
- Disconnect action
- Sync Calendar action

### Cloud / Sync & Migration

Treat cloud migration as a workflow, not a regular settings form.

Current settings:

- Server URL
- Account credentials
- Migration progress and result

### Advanced / Developer

Power-user and future diagnostic controls.

Current settings:

- Possible home for advanced runtime configuration such as custom base URL

## Visual System

The UI must visually distinguish between different kinds of settings instead of rendering everything as the same stack of boxes.

### 1. Field Rows

Use for editable values such as:

- Name
- Timezone
- API key
- Model
- File path

Pattern:

- Label
- Short description when needed
- Input control

### 2. Toggle Rows

Use for binary preferences.

Pattern:

- Label and description on the left
- Switch on the right

### 3. Status Panels

Use for integrations, runtime readiness, and connection state.

Examples:

- Google connected or disconnected
- Ollama running or not running
- Team Brain enabled or disabled

Pattern:

- Title
- Status badge
- One-sentence summary
- Primary and secondary actions

### 4. Workflow Modules

Use for multi-step operations.

Examples:

- Cloud migration

Pattern:

- Title
- Progress or stage indicator
- Inputs for the current step
- Clear primary action
- Result state

### 5. Danger Zone

Use for destructive or disconnect actions.

Pattern:

- Warning title
- Clear explanation of impact
- Destructive action isolated from normal settings

## Behavioral Rules

- Keep autosave for simple fields
- Keep section-local success and error feedback
- Only show provider-specific inputs when relevant
- Put destructive actions at the bottom of a section
- Use small status badges such as Configured, Missing, Connected, Local only, Desktop only, and Coming soon

## Current Schema Mapping

- `userName` -> `General / Personal Settings`
- `timezone` -> `General / Personal Settings`
- `dailyBriefTime` -> `General / Workspace`
- `eodTime` -> `General / Workspace`
- `provider` -> `AI / Provider`
- `anthropicApiKey` -> `AI / Provider`
- `openaiApiKey` -> `AI / Provider`
- `openrouterApiKey` -> `AI / Provider`
- `claudeModel` -> `AI / Models`
- `openaiModel` -> `AI / Models`
- `openrouterModel` -> `AI / Models`
- `openrouterBaseUrl` -> `AI / Models` or `Advanced / Developer`
- `ollamaModel` -> `AI / Local AI`
- `brainPath` -> `Knowledge / Data Storage`
- `teamBrainPath` -> `Knowledge / Team Brain`

## Implementation Order

1. Rebuild the page shell as a left-rail settings layout.
2. Add `General / Personal Settings` and move user-facing preferences there.
3. Move workspace scheduling into `General / Workspace`.
4. Split AI into `Provider`, `Models`, and `Local AI`.
5. Split Knowledge into `Data Storage` and `Team Brain`.
6. Convert Google and Cloud sections into explicit status and workflow modules.
7. Leave room for `General / Notifications` and `Advanced / Developer`.
