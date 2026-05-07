// Dispatches LLM tool calls to the existing main-process action handlers.
// Each branch mirrors what the corresponding IPC handler in main.ts does,
// but returns a string the model can read (URLs, IDs, friendly errors).

import type { FileManager } from '../src/core/fileManager';
import type { LLMClient, ToolCallInvocation, ToolCallResult } from '../src/core/llmClient';
import {
  ensureProjectKB,
  refreshProjectKB,
  resolveProjectSlugByName,
} from '../src/core/workflows/projectKnowledgeBase';
import { capture as captureWorkflow } from '../src/core/workflows/capture';
import { appendTask } from '../src/core/tasks';
import {
  createReminder as dbCreateReminder,
  logActivity,
} from '../src/core/db';
import {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_SCOPES,
} from '../src/core/connectors/googleConfig';
import { isGoogleConnected } from '../src/core/connectors/googleAuth';
import { exportToGoogleDoc } from '../src/core/connectors/googleDocs';
import { exportToGoogleSheet } from '../src/core/connectors/googleSheets';
import { checkExportMarkdown } from '../src/core/tools/exportGuard';
import { createCalendarEvent } from '../src/core/connectors/googleCalendar';
import { writeLocalSpreadsheet } from '../src/core/exporters/spreadsheet';
import { X_CLIENT_ID } from '../src/core/connectors/xConfig';
import { getXStatus } from '../src/core/connectors/xAuth';
import { getValidXAccessToken } from '../src/core/connectors/xAuth';
import { publishXPost } from '../src/core/connectors/xPublish';
import { X_CONFIG } from '../src/core/connectors/xConfig';
import {
  recordXPublishFailure as recordXPublishFailureHistory,
  recordXPublishSuccess as recordXPublishSuccessHistory,
} from '../src/core/db';
import { recordXPublishSuccess, recordXPublishError } from '../src/core/connectors/xAuth';

export interface ToolExecutorContext {
  fileManager: FileManager;
  llmClient: LLMClient;
  brainPath: string;
  timezone?: string;
  onCompileKb?: (wikiBaseSlug: string) => void;
}

function googleConfigOrThrow(): { clientId: string; clientSecret: string; scopes: string[] } {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    throw new Error(
      'Google integration is not available in this build. Tell the user to install a build with Google credentials, or use the slash commands directly.'
    );
  }
  return {
    clientId: GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
    scopes: GOOGLE_SCOPES,
  };
}

function asString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value == null) return '';
  return String(value);
}

function ok(toolUseId: string, content: string): ToolCallResult {
  return { toolUseId, content, isError: false };
}

function fail(toolUseId: string, content: string): ToolCallResult {
  return { toolUseId, content, isError: true };
}

export function makeToolExecutor(ctx: ToolExecutorContext) {
  return async function execute(call: ToolCallInvocation): Promise<ToolCallResult> {
    const { id, name, input } = call;
    try {
      switch (name) {
        case 'create_knowledge_base': {
          const projectName = asString((input as any).project_name).trim();
          if (!projectName) return fail(id, 'project_name is required.');
          const slug = await resolveProjectSlugByName(projectName, ctx.fileManager);
          if (!slug) return fail(id, `No project matched "${projectName}". Ask the user which project folder to use.`);
          const result = await ensureProjectKB(slug, ctx.fileManager);
          logActivity(ctx.brainPath, 'project-kb-create', `${slug} -> knowledge-bases/${result.wikiBaseSlug}`);
          if (result.added > 0) ctx.onCompileKb?.(result.wikiBaseSlug);
          const note = result.created
            ? `Created knowledge base for "${projectName}" at knowledge-bases/${result.wikiBaseSlug}/. Ingested ${result.added} file(s), skipped ${result.skipped}.`
            : `Knowledge base already existed for "${projectName}" at knowledge-bases/${result.wikiBaseSlug}/. Refreshed: added ${result.added}, skipped ${result.skipped}.`;
          return ok(id, note);
        }

        case 'refresh_knowledge_base': {
          const projectName = asString((input as any).project_name).trim();
          if (!projectName) return fail(id, 'project_name is required.');
          const slug = await resolveProjectSlugByName(projectName, ctx.fileManager);
          if (!slug) return fail(id, `No project matched "${projectName}".`);
          const result = await refreshProjectKB(slug, ctx.fileManager);
          logActivity(ctx.brainPath, 'project-kb-refresh', `${slug} +${result.added} ~${result.skipped}`);
          if (result.added > 0) ctx.onCompileKb?.(result.wikiBaseSlug);
          const errors = result.errors?.length ? ` Errors: ${result.errors.join('; ')}.` : '';
          return ok(id, `Refreshed knowledge base for "${projectName}". Added ${result.added}, skipped ${result.skipped}.${errors}`);
        }

        case 'create_task': {
          const text = asString((input as any).text).trim();
          if (!text) return fail(id, 'text is required.');
          const projectSlug = asString((input as any).project_slug).trim();
          const filePath = projectSlug
            ? `projects/${projectSlug}/tasks.md`
            : 'tasks.md';
          await appendTask(ctx.fileManager, filePath, text);
          logActivity(ctx.brainPath, 'task-created', text);
          return ok(id, `Task added to ${filePath}: "${text}".`);
        }

        case 'create_reminder': {
          const message = asString((input as any).message).trim();
          const dueIso = asString((input as any).due_at_iso).trim();
          const recurring = asString((input as any).recurring).trim() || undefined;
          if (!message || !dueIso) return fail(id, 'message and due_at_iso are required.');
          const dueAt = Date.parse(dueIso);
          if (Number.isNaN(dueAt)) return fail(id, `Could not parse due_at_iso "${dueIso}" as a date.`);
          const reminderId = dbCreateReminder(ctx.brainPath, message, dueAt, recurring);
          logActivity(ctx.brainPath, 'reminder-created', message);
          const when = new Date(dueAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
          return ok(id, `Reminder #${reminderId} scheduled for ${when}: "${message}"${recurring ? ` (repeats ${recurring})` : ''}.`);
        }

        case 'capture_note': {
          const text = asString((input as any).text).trim();
          if (!text) return fail(id, 'text is required.');
          const googleConfig = (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET)
            ? { clientId: GOOGLE_CLIENT_ID, clientSecret: GOOGLE_CLIENT_SECRET, scopes: GOOGLE_SCOPES }
            : undefined;
          const summary = await captureWorkflow(text, ctx.fileManager, ctx.llmClient, googleConfig);
          return ok(id, summary);
        }

        case 'export_to_google_doc': {
          if (!isGoogleConnected(ctx.brainPath)) {
            return fail(id, 'Google is not connected. Tell the user to connect Google in Settings.');
          }
          const markdown = asString((input as any).markdown);
          const title = asString((input as any).title).trim() || undefined;
          if (!markdown.trim()) return fail(id, 'markdown content is required.');
          const guard = checkExportMarkdown(markdown);
          if (!guard.ok) return fail(id, guard.reason!);
          const config = googleConfigOrThrow();
          const url = title
            ? await exportToGoogleDoc(ctx.brainPath, config, markdown, title)
            : await exportToGoogleDoc(ctx.brainPath, config, markdown);
          logActivity(ctx.brainPath, 'google-export-doc', url);
          return ok(id, `Created Google Doc: ${url}`);
        }

        case 'create_calendar_event': {
          if (!isGoogleConnected(ctx.brainPath)) {
            return fail(id, 'Google is not connected. Tell the user to connect Google in Settings.');
          }
          const summary = asString((input as any).summary).trim();
          const startTime = asString((input as any).start_time_iso).trim();
          const endTime = asString((input as any).end_time_iso).trim();
          const description = asString((input as any).description) || undefined;
          const attendees = Array.isArray((input as any).attendees) ? ((input as any).attendees as unknown[]).map(asString) : undefined;
          if (!summary || !startTime || !endTime) {
            return fail(id, 'summary, start_time_iso, and end_time_iso are required.');
          }
          const config = googleConfigOrThrow();
          const result = await createCalendarEvent(ctx.brainPath, config, {
            summary,
            startTime,
            endTime,
            description,
            attendees,
            timeZone: ctx.timezone || undefined,
          });
          logActivity(ctx.brainPath, 'calendar-create', summary);
          return ok(id, `Calendar event created: ${result.htmlLink || result.id}`);
        }

        case 'create_local_spreadsheet': {
          const title = asString((input as any).title).trim();
          const rawRows = (input as any).rows;
          const rawHeaders = (input as any).headers;
          const destination = asString((input as any).destination).trim() || undefined;
          if (!title) return fail(id, 'title is required.');
          if (!Array.isArray(rawRows)) return fail(id, 'rows must be an array of arrays of strings.');
          const rows: string[][] = rawRows.map((row) =>
            Array.isArray(row) ? row.map(asString) : []
          );
          const headers: string[] | undefined = Array.isArray(rawHeaders)
            ? rawHeaders.map(asString)
            : undefined;
          const result = await writeLocalSpreadsheet(ctx.fileManager, {
            title,
            rows,
            headers,
            destination,
          });
          logActivity(ctx.brainPath, 'export-xlsx', result.relativePath);
          return ok(
            id,
            `Wrote spreadsheet to ${result.absolutePath} (${rows.length} row(s)${headers ? ', with header row' : ''}).`
          );
        }

        case 'export_to_google_sheets': {
          if (!isGoogleConnected(ctx.brainPath)) {
            return fail(id, 'Google is not connected. Tell the user to connect Google in Settings.');
          }
          const title = asString((input as any).title).trim();
          const rawRows = (input as any).rows;
          const rawHeaders = (input as any).headers;
          const folderId = asString((input as any).folderId).trim() || undefined;
          if (!title) return fail(id, 'title is required.');
          if (!Array.isArray(rawRows)) return fail(id, 'rows must be an array of arrays of strings.');
          const rows: string[][] = rawRows.map((row) =>
            Array.isArray(row) ? row.map(asString) : []
          );
          const headers: string[] | undefined = Array.isArray(rawHeaders)
            ? rawHeaders.map(asString)
            : undefined;
          const config = googleConfigOrThrow();
          const result = await exportToGoogleSheet(ctx.brainPath, config, {
            title,
            rows,
            headers,
            folderId,
          });
          logActivity(ctx.brainPath, 'google-export-sheet', result.spreadsheetUrl);
          return ok(id, `Created Google Sheet: ${result.spreadsheetUrl}`);
        }

        case 'publish_x_post': {
          if (!X_CLIENT_ID.trim()) {
            return fail(id, 'X integration is not available in this build.');
          }
          const text = asString((input as any).text);
          if (!text.trim()) return fail(id, 'text is required.');
          const status = getXStatus(ctx.brainPath, X_CLIENT_ID);
          if (!status.account) return fail(id, 'X account is not connected. Ask the user to connect X in Settings.');
          try {
            const accessToken = await getValidXAccessToken(ctx.brainPath, X_CONFIG);
            const result = await publishXPost(accessToken, status.account, { text });
            recordXPublishSuccessHistory(ctx.brainPath, {
              externalPostId: result.id,
              text: result.text,
              url: result.url,
              publishedAt: result.publishedAt,
            });
            recordXPublishSuccess(ctx.brainPath, result.url, result.publishedAt);
            logActivity(ctx.brainPath, 'x-publish-post', result.url);
            return ok(id, `Posted to X: ${result.url}`);
          } catch (error) {
            const message = error instanceof Error ? error.message : 'X publish failed.';
            recordXPublishFailureHistory(ctx.brainPath, { text, error: message });
            recordXPublishError(ctx.brainPath, message);
            return fail(id, `X publish failed: ${message}`);
          }
        }

        default:
          return fail(id, `Unknown tool "${name}".`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Tool execution failed.';
      return fail(id, message);
    }
  };
}

export function googleAvailable(brainPath: string): boolean {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) return false;
  return isGoogleConnected(brainPath);
}

export function xAvailable(brainPath: string): boolean {
  if (!X_CLIENT_ID.trim()) return false;
  const status = getXStatus(brainPath, X_CLIENT_ID);
  return !!status.account;
}
