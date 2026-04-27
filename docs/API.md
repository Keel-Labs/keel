# Keel IPC API Reference

This document describes the `window.keel` API available to the Renderer process. The API is exposed via Electron's IPC (Inter-Process Communication) bridge.

**Accessing the API:**
```typescript
// In any React component or Renderer-side code
const settings = await window.keel.getSettings();
```

---

## Table of Contents

1. [Chat](#chat)
2. [Settings](#settings)
3. [Workspace & Brain](#workspace--brain)
4. [Sessions](#sessions)
5. [Projects](#projects)
6. [Tasks](#tasks)
7. [Reminders](#reminders)
8. [Wiki Bases](#wiki-bases)
9. [Knowledge Bases (Project KB)](#knowledge-bases-project-kb)
10. [File Management](#file-management)
11. [Google Integration](#google-integration)
12. [X (Twitter) Integration](#x-twitter-integration)
13. [AI Provider Management](#ai-provider-management)
14. [Meetings & Transcription](#meetings--transcription)
15. [Scheduled Jobs](#scheduled-jobs)
16. [Activity & Dashboard](#activity--dashboard)
17. [Utilities](#utilities)

---

## Chat

### `chat(request: ChatRequest) → Promise<string>`

Send a synchronous (non-streaming) chat request and await the full response.

**Parameters:**
- `request.messages`: Array of `Message` objects (user + assistant messages)
- `request.sessionMetadata`: Optional metadata (wiki context, draft metadata, etc.)

**Returns:** Complete response text

**Example:**
```typescript
const response = await window.keel.chat({
  messages: [
    { role: 'user', content: 'What are my upcoming tasks?', timestamp: Date.now() }
  ]
});
```

---

### `chatStream(request: ChatRequest, requestId: string) → Promise<void>`

Start a streaming chat request. Subscribe to events with `onStreamChunk`, `onStreamDone`, `onStreamError`.

**Parameters:**
- `request`: ChatRequest (same as `chat`)
- `requestId`: Unique identifier for this request (used in event callbacks)

**Example:**
```typescript
const requestId = crypto.randomUUID();

window.keel.onStreamChunk(({ requestId: id, chunk }) => {
  if (id === requestId) {
    console.log('Chunk:', chunk);
  }
});

await window.keel.chatStream({
  messages: [{ role: 'user', content: 'Hello', timestamp: Date.now() }]
}, requestId);
```

---

### `onStreamChunk(callback) → () => void`

Listen for incoming chat stream chunks. Returns unsubscribe function.

**Callback parameter:**
- `requestId`: Request UUID
- `chunk`: Partial response text

---

### `onStreamDone(callback) → () => void`

Listen for stream completion. Called when the full response is done.

**Callback parameter:**
- `requestId`: Request UUID

---

### `onStreamError(callback) → () => void`

Listen for stream errors (e.g., API failure, context assembly error).

**Callback parameter:**
- `requestId`: Request UUID
- `error`: Error message

---

### `onThinkingStep(callback) → () => void`

Listen for Claude extended thinking steps (when using models with native thinking).

**Callback parameter:**
- `requestId`: Request UUID
- `step`: Step description (e.g., "Analyzing context")

---

### `onThinkingDelta(callback) → () => void`

Listen for streaming thinking content updates.

**Callback parameter:**
- `requestId`: Request UUID
- `text`: Thinking text update

---

### `cancelStream(requestId: string) → Promise<void>`

Cancel an in-progress streaming request.

---

## Settings

### `getSettings() → Promise<Settings>`

Fetch the current user settings (provider, API keys, theme, etc.).

**Returns:**
```typescript
{
  theme: 'system' | 'dark' | 'light';
  hasCompletedOnboarding: boolean;
  provider: 'claude' | 'openai' | 'openrouter' | 'ollama';
  anthropicApiKey: string;
  claudeModel: string;
  openaiApiKey: string;
  openaiModel: string;
  openrouterApiKey: string;
  openrouterModel: string;
  openrouterBaseUrl: string;
  ollamaModel: string;
  personality: string;
  brainPath: string;
  userName: string;
  timezone: string;
}
```

---

### `saveSettings(settings: Settings) → Promise<void>`

Update user settings. Changes are persisted to disk.

**Example:**
```typescript
const settings = await window.keel.getSettings();
settings.theme = 'dark';
await window.keel.saveSettings(settings);
```

---

### `getAppVersion() → Promise<string>`

Get the Keel app version (e.g., "0.1.0").

---

## Workspace & Brain

### `ensureBrain() → Promise<void>`

Ensure the workspace directory exists and is properly initialized. Creates `keel.md`, `tasks.md`, `projects/`, `daily-log/`, `knowledge-bases/` if missing.

---

### `resetProfile() → Promise<void>`

Hard reset: clears all settings, sessions, and workspace state. **Destructive.**

---

### `capture(input: string) → Promise<string>`

Capture a user input (thought, task, note) and process it through memory extraction. Returns a summary of what was captured.

**Example:**
```typescript
const summary = await window.keel.capture('Remember: John wants the report by Friday');
```

---

## Sessions

### `saveChat(sessionId: string, session: StoredChatSession) → Promise<void>`

Save a chat session to disk.

**Parameters:**
- `sessionId`: Unique session identifier
- `session.messages`: Array of Message objects
- `session.metadata`: Optional session metadata (wiki context, etc.)

---

### `loadChat(sessionId: string) → Promise<StoredChatSession | null>`

Load a previously saved chat session.

---

### `getLatestSession() → Promise<string | null>`

Get the ID of the most recently accessed chat session.

---

### `listSessions() → Promise<Array<{ id, title, updatedAt }>>`

List all saved chat sessions with metadata.

---

## Projects

### `createProject(name: string) → Promise<string>`

Create a new project folder. Returns the project slug.

**Example:**
```typescript
const slug = await window.keel.createProject('Website Redesign');
// Creates: ~/Keel/projects/website-redesign/
```

---

### `renameProject(oldSlug: string, newName: string) → Promise<string>`

Rename a project. Returns the new slug.

---

### `deleteProject(slug: string, moveTasks: boolean) → Promise<void>`

Delete a project folder.

**Parameters:**
- `moveTasks`: If true, moves tasks to the inbox instead of deleting them

---

## Tasks

### `listTasks() → Promise<TaskGroup[]>`

List all tasks organized by project/inbox.

**Returns:**
```typescript
[
  {
    groupId: string;        // 'inbox' or project slug
    groupName: string;      // 'Inbox' or project name
    groupPath: string;      // File path
    tasks: Task[];
  }
]
```

---

### `createTask(filePath: string, text: string) → Promise<void>`

Create a new task in a specific file (markdown).

**Example:**
```typescript
await window.keel.createTask('~/Keel/tasks.md', '[ ] Review proposal');
```

---

### `toggleTask(filePath: string, taskText: string, completed: boolean) → Promise<void>`

Mark a task as complete/incomplete.

---

### `moveTask(sourceFilePath: string, targetFilePath: string, taskText: string, completed: boolean) → Promise<void>`

Move a task between files (e.g., from inbox to a project).

---

### `listIncomingTasks() → Promise<IncomingTask[]>`

List tasks detected in captured messages or external sources (not yet accepted).

---

### `acceptIncomingTask(id: number) → Promise<void>`

Accept an incoming task and add it to the project.

---

### `dismissIncomingTask(id: number) → Promise<void>`

Dismiss an incoming task without adding it.

---

## Reminders

### `createReminder(message: string, dueAt: number, recurring?: string) → Promise<number>`

Create a reminder notification.

**Parameters:**
- `message`: Reminder text
- `dueAt`: Unix timestamp (ms)
- `recurring`: Optional recurrence rule (e.g., "every day at 9am")

**Returns:** Reminder ID

---

### `listReminders() → Promise<Reminder[]>`

List all active reminders.

---

### `deleteReminder(id: number) → Promise<void>`

Delete a reminder.

---

## Wiki Bases

### `createWikiBase(title: string, description?: string) → Promise<WikiBaseCreateResult>`

Create a new wiki base.

**Returns:**
```typescript
{
  slug: string;            // e.g., 'my-wiki'
  path: string;            // Full filesystem path
}
```

---

### `ingestWikiSource(basePath: string, input: WikiSourceInput) → Promise<WikiIngestResult>`

Ingest source material (markdown, PDF, etc.) into a wiki base.

**Parameters:**
- `basePath`: Wiki base path
- `input.kind`: 'file' | 'folder' | 'text'
- `input.path` or `input.text`: Source material

**Returns:**
```typescript
{
  slug: string;           // Source slug
  sourceCount: number;
  chunkCount: number;
}
```

---

### `deleteWikiSource(basePath: string, sourceSlug: string) → Promise<{ deleted: string }>`

Remove a source from a wiki base.

---

### `startWikiCompile(basePath: string) → Promise<WikiJob>`

Trigger wiki compilation (converts raw sources to formatted wiki pages).

---

### `startWikiHealthCheck(basePath: string) → Promise<WikiJob>`

Run a health check on a wiki (checks for broken links, orphaned pages, etc.).

---

### `listWikiJobs(basePath?: string) → Promise<WikiJob[]>`

List in-progress or completed wiki jobs (compile, health check).

---

### `listWikiBases() → Promise<WikiBaseSummary[]>`

List all wiki bases in the workspace.

---

## Knowledge Bases (Project KB)

### `getProjectKbStatus(projectSlug: string) → Promise<ProjectKBStatus>`

Check if a project has a knowledge base and get its status.

**Returns:**
```typescript
{
  hasKB: boolean;
  slug?: string;           // KB slug if exists
  lastRefreshed?: number;  // Unix timestamp
  ingestedCount?: number;  // Number of sources
}
```

---

### `createProjectKb(projectName: string) → Promise<...>`

Create a knowledge base for a project. Ingests existing context and files.

**Returns:** Refresh result + project slug

---

### `refreshProjectKb(projectName: string) → Promise<...>`

Refresh a project's knowledge base (incremental sync of new/modified files).

---

## File Management

### `listFiles(dirPath: string) → Promise<FileEntry[]>`

List files in a directory (for browser/picker UI).

**Returns:**
```typescript
[
  {
    name: string;        // File/folder name
    path: string;        // Full path
    isDirectory: boolean;
    size?: number;
    mtime?: number;
  }
]
```

---

### `readFile(filePath: string) → Promise<string>`

Read a file's full contents.

---

### `writeFile(filePath: string, content: string) → Promise<void>`

Write content to a file (creates if missing, overwrites if exists).

---

### `pickFolder(defaultPath?: string) → Promise<string | null>`

Open native folder picker dialog.

---

### `pickFiles() → Promise<string[]>`

Open native file picker dialog (multi-select).

---

### `pickWikiFiles() → Promise<WikiFileImport[]>`

Open file picker specifically for wiki source material (filters for markdown, PDF, etc.).

---

### `pickChatDocuments() → Promise<ChatDocumentAttachment[]>`

Open file picker for chat document attachments. Returns documents with content pre-loaded.

---

### `openPath(filePath: string) → Promise<string>`

Open a file or folder in the system file manager / default application.

---

## Google Integration

### `googleConnect() → Promise<void>`

Initiate Google OAuth flow. User logs in and grants Keel access to Calendar and Docs.

---

### `googleDisconnect() → Promise<void>`

Revoke Google OAuth access.

---

### `googleStatus() → Promise<{ connected: boolean; configured?: boolean }>`

Check if Google is connected and configured.

---

### `googleSyncCalendar() → Promise<{ eventCount: number; filesWritten: number }>`

Sync Google Calendar events into the workspace.

---

### `googleExportDoc(markdownContent: string, title?: string) → Promise<string>`

Export markdown content to a Google Doc. Returns the Doc URL.

---

### `googleCreateEvent(event) → Promise<{ id: string; htmlLink: string }>`

Create a Google Calendar event.

**Parameters:**
```typescript
{
  summary: string;
  startTime: string;     // ISO 8601
  endTime: string;       // ISO 8601
  description?: string;
  attendees?: string[];  // Email addresses
}
```

---

## X (Twitter) Integration

### `xConnect() → Promise<XAccountProfile>`

Initiate X/Twitter OAuth flow.

---

### `xDisconnect() → Promise<void>`

Revoke X/Twitter access.

---

### `xStatus() → Promise<XStatus>`

Check X/Twitter connection status.

---

### `xSyncBookmarks() → Promise<XSyncResult>`

Sync bookmarks from X into the workspace.

---

### `xPublishPost(request: XPublishRequest) → Promise<XPublishResult>`

Publish a post to X/Twitter.

---

## AI Provider Management

### `openaiListModels() → Promise<OpenAIListResult>`

Fetch available models from OpenAI (requires API key in settings).

---

### `ollamaListModels() → Promise<OllamaListResult>`

Fetch available models from local Ollama instance.

---

## Meetings & Transcription

### `checkWhisper() → Promise<WhisperStatus>`

Check if Whisper (speech-to-text) is available locally or needs downloading.

---

### `downloadWhisperBinary() → Promise<{ ok: boolean; error?: string }>`

Download the Whisper binary for local transcription.

---

### `downloadWhisperModel(model?: string) → Promise<{ ok: boolean; error?: string }>`

Download a Whisper model (e.g., 'small', 'base', 'medium').

---

### `onBinaryDownloadProgress(callback) → () => void`

Listen for Whisper binary download progress.

---

### `transcribeAudio(audioBuffer: ArrayBuffer) → Promise<{ ok: true; text: string } | { ok: false; error: string }>`

Transcribe audio (uses local Whisper or OpenAI API fallback).

**Parameters:**
- `audioBuffer`: Raw audio data (WAV, MP3, etc.)

---

### `transcribeMeeting(audioBuffer: ArrayBuffer) → Promise<MeetingTranscriptionResult>`

Transcribe a meeting recording and auto-extract action items, summaries, etc.

---

### `synthesizeMeeting(transcript: string) → Promise<MeetingTranscriptionResult>`

Synthesize a meeting (extract action items, create summary).

---

### `onTranscriptionProgress(callback) → () => void`

Listen for transcription progress updates (0-100%).

---

### `onMeetingProgress(callback) → () => void`

Listen for meeting synthesis progress.

---

### `listMeetings() → Promise<MeetingEntry[]>`

List all saved meeting transcripts.

---

## Scheduled Jobs

### `listScheduledJobs() → Promise<ScheduledJob[]>`

List all scheduled jobs (recurring reminders, daily briefs, etc.).

---

### `upsertScheduledJob(job: ScheduledJob) → Promise<number>`

Create or update a scheduled job. Returns job ID.

---

### `deleteScheduledJob(id: number) → Promise<void>`

Delete a scheduled job.

---

## Activity & Dashboard

### `getRecentActivity(limit?: number) → Promise<ActivityLogEntry[]>`

Get recent activity (captures, chats, updates). Limit defaults to 50.

---

### `dailyBrief() → Promise<string>`

Generate a morning brief from the workspace (tasks, calendar, captures).

---

### `eod(chatHistory: Message[]) → Promise<string>`

Generate an end-of-day summary from a chat session.

---

### `fetchWeather() → Promise<WeatherInfo | null>`

Fetch current weather (used for daily briefs). Requires user location in settings.

---

### `fetchAiNews() → Promise<NewsItem[]>`

Fetch AI-related news headlines.

---

### `getDailyQuote() → Promise<{ text: string; author: string }>`

Get a random inspirational quote.

---

## Team Brain

### `listTeamFiles(dirPath: string) → Promise<FileEntry[]>`

List files in shared team workspace (future feature).

---

### `readTeamFile(filePath: string) → Promise<string>`

Read a shared team file.

---

### `writeTeamFile(filePath: string, content: string) → Promise<void>`

Write to a shared team file.

---

## Utilities

### `openUtilityWindow(kind: UtilityWindowKind, query?: Record<string, string>) → Promise<void>`

Open a utility window (e.g., file picker, settings modal).

**Kind:** 'file-picker' | 'settings' | 'onboarding' | etc.

---

### `closeWindow() → Promise<void>`

Close the Keel window (minimizes or exits, depending on platform).

---

### `onScheduledNotification(callback) → void`

Listen for scheduled notifications (reminders, daily brief notifications).

**Callback parameter:**
```typescript
{
  title: string;
  body: string;
  action?: string;  // Action type (e.g., 'open-chat')
}
```

---

### `removeScheduledNotificationListener() → void`

Stop listening for scheduled notifications.

---

### `onAutoCaptureDone(callback) → () => void`

Listen for auto-capture completion (when a chat produces something worth capturing).

**Callback parameter:**
```typescript
{
  requestId: string;
  summary: string;  // Summary of what was captured
}
```

---

### `onMemoryUpdated(callback) → () => void`

Listen for memory extraction updates (when memories are extracted from chat).

**Callback parameter:**
```typescript
{
  requestId: string;
  summary: string;
}
```

---

## Error Handling

Most API calls return `Promise`, so they can throw errors:

```typescript
try {
  const settings = await window.keel.getSettings();
} catch (error) {
  console.error('Failed to load settings:', error);
}
```

Common error scenarios:
- **File not found:** `readFile` / `loadChat`
- **Invalid input:** `createProject` (invalid name), `saveSettings` (invalid config)
- **API failure:** Chat/stream errors (API key invalid, rate limit, network error)
- **Permission denied:** File operations on protected paths

---

## Type Definitions

All TypeScript types are defined in `src/shared/types.ts`. Import them in your components:

```typescript
import type { Settings, ChatRequest, Message, TaskGroup } from '../shared/types';
```

---

## Examples

### Stream a Chat with Context

```typescript
const messages = [
  { 
    role: 'user',
    content: 'Summarize my tasks',
    timestamp: Date.now()
  }
];

const requestId = Math.random().toString(36);
let response = '';

window.keel.onStreamChunk(({ requestId: id, chunk }) => {
  if (id === requestId) {
    response += chunk;
    console.log('Received:', chunk);
  }
});

window.keel.onStreamDone(({ requestId: id }) => {
  if (id === requestId) {
    console.log('Complete response:', response);
  }
});

await window.keel.chatStream({ messages }, requestId);
```

### Create a Task

```typescript
const settings = await window.keel.getSettings();
const taskFilePath = `${settings.brainPath}/projects/my-project/tasks.md`;
await window.keel.createTask(taskFilePath, '[ ] Finish implementation');
```

### Export to Google Doc

```typescript
const markdownContent = '# My Report\n\nContent here...';
const docUrl = await window.keel.googleExportDoc(markdownContent, 'My Report');
console.log('Exported to:', docUrl);
```

---

## Migration Guide (from older versions)

**v0.1.x:**
- API is stable; no breaking changes expected before v1.0
- All methods on `window.keel` are first-class promises
- Callbacks for events (streams, notifications) are subscription functions

---

## Support

- **Issues:** [GitHub Issues](https://github.com/Keel-Labs/keel/issues)
- **Discussions:** [GitHub Discussions](https://github.com/Keel-Labs/keel/discussions)
- **Feedback:** [Fider Board](https://keel.fider.io)
