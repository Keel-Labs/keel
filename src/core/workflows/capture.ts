import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { FileManager } from '../fileManager';
import { LLMClient, ToolExecutor } from '../llmClient';
import { logActivity, insertIncomingTask } from '../db';
import { isGoogleDocUrl, READ_EXISTING_DOC_UNSUPPORTED } from '../connectors/googleDocs';
import { ingestWikiSource } from './wikiIngest';
import { buildProjectCatalog } from '../projectCatalog';
import type { GoogleOAuthConfig } from '../connectors/googleAuth';
import type { ToolDefinition } from '../tools/schemas';

const URL_PATTERN = /^https?:\/\//;

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export interface CaptureOptions {
  /**
   * When set, extracted tasks are routed to the `incoming_tasks` triage
   * queue (visible in the Inbox view's "Incoming" section) instead of
   * being appended directly to `tasks.md` / `projects/<slug>/tasks.md`.
   *
   * Use this for captures the user can't immediately review — the
   * mobile companion is the canonical case. Desktop chat captures
   * leave it false so tasks land directly.
   */
  routeTasksToIncoming?: boolean;
  /**
   * Optional label written to `incoming_tasks.source_file` so the
   * Inbox row can show provenance (e.g. "iPhone 17 Pro").
   */
  sourceLabel?: string;
}

export async function capture(
  input: string,
  fileManager: FileManager,
  llmClient: LLMClient,
  googleConfig?: GoogleOAuthConfig,
  options: CaptureOptions = {}
): Promise<string> {
  const brainPath = fileManager.getBrainPath();
  let content: string;
  let sourceLabel: string;

  if (URL_PATTERN.test(input.trim())) {
    const url = input.trim();

    if (isGoogleDocUrl(url)) {
      // Reading pre-existing Google Docs requires a broader OAuth scope
      // than Keel asks for. Surface the helpful message instead of falling
      // through to the generic URL fetcher (which would download Google's
      // sign-in HTML page).
      return READ_EXISTING_DOC_UNSUPPORTED;
    } else {
      try {
        const response = await fetch(url);
        const html = await response.text();
        const dom = new JSDOM(html, { url });
        const reader = new Readability(dom.window.document);
        const article = reader.parse();
        content = article?.textContent || html.slice(0, 5000);
        sourceLabel = article?.title || url;
      } catch (error) {
        return `Failed to fetch URL: ${error instanceof Error ? error.message : 'Unknown error'}`;
      }
    }
  } else {
    content = input;
    sourceLabel = input.slice(0, 50);
  }

  // Summarize with the LLM (used in both the routed write and the chat reply).
  let summary: string;
  try {
    summary = await llmClient.chat(
      [
        {
          role: 'user',
          content: `Summarize the following in 2-3 sentences. Plain prose only — do not add bullet lists or headings.\n\n${content.slice(0, 10000)}`,
          timestamp: Date.now(),
        },
      ],
      'You are a concise summarizer. Output only the summary, nothing else.'
    );
  } catch {
    summary = content.slice(0, 500);
  }

  // ─── Routing via LLM tool calls ──────────────────────────────────────────
  // Project routing is subjective ("does this belong with the Pool Servicing
  // notes?") so we let the model choose, given a catalog of existing projects.
  // The previous embedding-similarity heuristic had no thresholds and biased
  // toward whichever project happened to have the most indexed chunks.
  const catalog = await buildProjectCatalog(fileManager);

  type Decision =
    | { kind: 'existing'; slug: string; name: string; tasks: string[] }
    | { kind: 'new'; slug: string; name: string; tasks: string[] }
    | { kind: 'inbox'; tasks: string[] };

  // TypeScript narrows `decision` to its initial variant if we let it; the
   // closure inside executeRouter mutates this through the union, so widen.
  let decision: Decision = { kind: 'inbox', tasks: [] } as Decision;

  const tools: ToolDefinition[] = [
    {
      name: 'file_to_existing_project',
      description:
        'File this capture into an existing project. Use ONLY when the content clearly belongs with that project — it mentions the same people, vendors, themes, or extends prior context. Topical proximity alone is not enough.',
      inputSchema: {
        type: 'object',
        properties: {
          slug: { type: 'string', description: 'Slug of an existing project from the list provided.' },
          tasks: {
            type: 'array',
            items: { type: 'string' },
            description: 'Action items the user is recording (concrete to-dos, follow-ups, deadlines). Empty array if none.',
          },
        },
        required: ['slug', 'tasks'],
        additionalProperties: false,
      },
    },
    {
      name: 'create_and_file_to_new_project',
      description:
        'Create a new project and file this capture there. Use when the content describes a substantive new initiative that does not fit any listed project.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Display name for the new project (e.g. "Pool Servicing").' },
          tasks: {
            type: 'array',
            items: { type: 'string' },
            description: 'Action items the user is recording. Empty array if none.',
          },
        },
        required: ['name', 'tasks'],
        additionalProperties: false,
      },
    },
    {
      name: 'file_to_inbox',
      description:
        'File to a generic captures inbox. Use when the content does not fit any existing project and is not substantive enough to warrant a new project. Prefer this over filing to the wrong project.',
      inputSchema: {
        type: 'object',
        properties: {
          tasks: {
            type: 'array',
            items: { type: 'string' },
            description: 'Action items the user is recording. Empty array if none.',
          },
        },
        required: ['tasks'],
        additionalProperties: false,
      },
    },
  ];

  const executeRouter: ToolExecutor = async (call) => {
    const tasks = Array.isArray(call.input.tasks)
      ? (call.input.tasks as unknown[]).map((t) => String(t)).filter(Boolean)
      : [];

    if (call.name === 'file_to_existing_project') {
      const slug = String(call.input.slug || '').trim();
      const match = catalog.find((p) => p.slug === slug);
      if (!match) {
        return {
          toolUseId: call.id,
          content: `Unknown slug "${slug}". Choose from: ${catalog.map((p) => p.slug).join(', ') || '(none)'} — or use create_and_file_to_new_project / file_to_inbox.`,
          isError: true,
        };
      }
      decision = { kind: 'existing', slug: match.slug, name: match.name, tasks };
      return { toolUseId: call.id, content: `Filed to ${match.slug}.`, isError: false };
    }

    if (call.name === 'create_and_file_to_new_project') {
      const name = String(call.input.name || '').trim();
      if (!name) {
        return { toolUseId: call.id, content: 'Project name is required.', isError: true };
      }
      const slug = slugify(name);
      if (!slug) {
        return { toolUseId: call.id, content: `Could not derive a slug from "${name}".`, isError: true };
      }
      decision = { kind: 'new', slug, name, tasks };
      return { toolUseId: call.id, content: `New project "${name}" will be created.`, isError: false };
    }

    if (call.name === 'file_to_inbox') {
      decision = { kind: 'inbox', tasks };
      return { toolUseId: call.id, content: 'Filed to inbox.', isError: false };
    }

    return { toolUseId: call.id, content: `Unknown tool: ${call.name}`, isError: true };
  };

  const projectListText = catalog.length === 0
    ? '(no existing projects)'
    : catalog
        .map((p) => `- ${p.name} (slug: \`${p.slug}\`)${p.blurb ? `\n   ${p.blurb}` : ''}`)
        .join('\n');

  const routingSystem = `You route a captured note into the user's brain. Call exactly ONE tool.

Existing projects:
${projectListText}

Decision rules:
- Call file_to_existing_project ONLY when the content clearly belongs with one of the listed projects (same people, vendors, themes, or extending prior context). Topical proximity alone is not enough.
- Call create_and_file_to_new_project when the content describes a substantive new initiative that does not fit any listed project.
- Call file_to_inbox when the content is too generic or doesn't fit anywhere — prefer this over filing to a wrong project.

Also extract any action items the user is recording (concrete to-dos, follow-ups, deadlines). Pass them in the \`tasks\` array. Empty array if none.

Reply with the tool call only. No prose.`;

  try {
    await llmClient.chatWithTools(
      [
        {
          role: 'user',
          content: `Captured note:\n\n${content.slice(0, 4000)}\n\nSummary: ${summary}`,
          timestamp: Date.now(),
        },
      ],
      routingSystem,
      {
        tools,
        executeTool: executeRouter,
        maxIterations: 2,
      },
    );
  } catch (err) {
    console.error('[capture] Routing LLM failed, falling back to inbox:', err);
    // decision remains { kind: 'inbox', tasks: [] }
  }

  // ─── Apply the decision ──────────────────────────────────────────────────
  const date = new Date().toISOString().split('T')[0];
  let projectFolder = '';
  let projectDisplayName = '';

  if (decision.kind === 'existing' || decision.kind === 'new') {
    projectFolder = decision.slug;
    projectDisplayName = decision.name;
    const contextPath = `projects/${projectFolder}/context.md`;
    const captureSection = `\n\n## Capture — ${date}: ${sourceLabel}\n${summary}\n`;

    if (decision.kind === 'new') {
      // Seed a fresh context.md with the project header.
      try {
        const existing = await fileManager.readFile(contextPath);
        await fileManager.writeFile(contextPath, existing.trimEnd() + captureSection);
      } catch {
        await fileManager.writeFile(
          contextPath,
          `# ${projectDisplayName}\n\nProject context and notes.${captureSection}`,
        );
      }
    } else {
      try {
        const existing = await fileManager.readFile(contextPath);
        await fileManager.writeFile(contextPath, existing.trimEnd() + captureSection);
      } catch {
        await fileManager.writeFile(
          contextPath,
          `# ${projectDisplayName}\n\nProject context and notes.${captureSection}`,
        );
      }
    }

    logActivity(brainPath, 'capture', `Appended to ${contextPath}`);

    // Wiki integration: if project has a wiki knowledge base, also ingest.
    try {
      const wikiOverview = `knowledge-bases/${projectFolder}/overview.md`;
      if (await fileManager.fileExists(wikiOverview)) {
        await ingestWikiSource(
          `knowledge-bases/${projectFolder}`,
          { sourceType: 'text', title: sourceLabel, text: content.slice(0, 10000) },
          fileManager,
        );
      }
    } catch (err) {
      console.error('[capture] Wiki ingest failed (non-blocking):', err);
    }
  } else {
    // Inbox path: standalone file under inbox/ (top-level, peer of projects/).
    const slug = sourceLabel
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40);
    const fileName = `inbox/${date}-${slug || 'note'}.md`;
    const fileContent = `# ${sourceLabel}

**Captured:** ${new Date().toISOString()}
${URL_PATTERN.test(input.trim()) ? `**Source:** ${input.trim()}` : ''}

## Summary
${summary}

## Original
${content.slice(0, 3000)}
`;
    await fileManager.writeFile(fileName, fileContent);
    logActivity(brainPath, 'capture', `Filed to ${fileName}`);
  }

  // ─── Tasks ───────────────────────────────────────────────────────────────
  if (decision.tasks.length > 0) {
    if (options.routeTasksToIncoming) {
      // Mobile / share-sheet captures — push tasks into the triage
      // queue so the user can review them in the Inbox view before
      // they enter the tasks.md files. The LLM doesn't get to ask
      // clarifying questions in this flow, so a review step pays.
      //
      // `source_file` is the markdown path the task will be APPENDED
      // to when the user taps Accept in the Inbox (see
      // src/core/tasks.ts:acceptIncomingTask). It must be a writable
      // workspace-relative path, NOT a human-readable provenance
      // string. Mirrors how memoryExtract populates this field.
      const targetTaskFile = projectFolder
        ? `projects/${projectFolder}/tasks.md`
        : 'tasks.md';
      const provenance = options.sourceLabel ?? 'mobile capture';
      for (const t of decision.tasks) {
        insertIncomingTask(brainPath, t, projectFolder ?? null, targetTaskFile);
      }
      logActivity(
        brainPath,
        'capture-tasks-incoming',
        `Queued ${decision.tasks.length} task(s) from ${provenance}`,
      );
    } else if (projectFolder) {
      const tasksPath = `projects/${projectFolder}/tasks.md`;
      let existing = '';
      try { existing = await fileManager.readFile(tasksPath); } catch {
        existing = `# ${projectDisplayName} — Tasks\n`;
      }
      let next = existing.trimEnd();
      for (const t of decision.tasks) {
        if (!existing.includes(t)) next += `\n- [ ] ${t}`;
      }
      await fileManager.writeFile(tasksPath, next + '\n');
      logActivity(brainPath, 'capture-tasks', `Recorded ${decision.tasks.length} task(s) from capture`);
    } else {
      let existing = '';
      try { existing = await fileManager.readFile('tasks.md'); } catch {
        existing = '# Tasks\n';
      }
      let next = existing.trimEnd();
      for (const t of decision.tasks) {
        if (!existing.includes(t)) next += `\n- [ ] ${t}`;
      }
      await fileManager.writeFile('tasks.md', next + '\n');
      logActivity(brainPath, 'capture-tasks', `Recorded ${decision.tasks.length} task(s) from capture`);
    }
  }

  // ─── Human-friendly response ─────────────────────────────────────────────
  // Keep this terse — the assistant's chat reply already restates the content,
  // so the system-event row only needs to communicate the destination.
  if (decision.kind === 'existing') {
    return `Saved to **${projectDisplayName}**`;
  }
  if (decision.kind === 'new') {
    return `Saved to new project **${projectDisplayName}**`;
  }
  return `Filed to inbox`;
}
