// Heuristic guard against the model passing a self-summary as the
// `markdown` argument to export_to_google_doc, instead of the actual
// content the user asked to export.
//
// The failure mode this exists for: user says "create a Google doc with
// this table" referring to a table from the prior assistant turn, and
// the model calls the tool with a NEW message it just authored —
// "I've created a Google Doc with the table…" plus a hallucinated
// docs.google.com URL — instead of passing the table itself. The doc
// then gets created, but its body is the confirmation message, not the
// table.
//
// We can't perfectly detect this, but a couple of strong signals catch
// the obvious cases. When the guard rejects, the executor returns an
// error to the model so it can retry with the real content.

export interface ExportGuardResult {
  ok: boolean;
  reason?: string;
}

// Openers that almost always indicate a confirmation message (post-action
// summary), not a document body.
const SELF_SUMMARY_OPENERS: readonly RegExp[] = [
  /^\s*i['’]ve\s+(created|exported|made|drafted|generated|saved|put|added)\b/i,
  /^\s*i\s+(have|just)\s+(created|exported|made|drafted|generated|saved)\b/i,
  /^\s*here['’]s\s+(the|your)\s+(new\s+)?(google\s+)?(doc|spreadsheet|sheet)\b/i,
  /^\s*done[!,.\s—-].*\b(google\s+doc|spreadsheet|sheet|exported)\b/i,
  /^\s*your\s+.{0,80}?(google\s+)?(doc|spreadsheet|sheet)\s+is\s+(ready|created|live|now)\b/i,
  /^\s*(perfect|great|awesome|excellent|all\s+set|all\s+done|got\s+it)[!,.\s—-]/i,
];

// Phrases that signal the body is announcing a completed action.
const COMPLETION_ANNOUNCEMENT: readonly RegExp[] = [
  /\bis\s+now\s+(in|ready|live|available|saved)\b/i,
  /\bhas\s+been\s+(created|exported|saved|generated)\b/i,
  /\bsuccessfully\s+(created|exported|saved|generated)\b/i,
];

// Openers that indicate a refusal / clarification dialog turn, not
// document content. ("I can't create a spreadsheet…", "I cannot…")
const DIALOG_OPENERS: readonly RegExp[] = [
  /^\s*i\s+can(?:['’]t|not)\s+/i,
  /^\s*i\s+am\s+(?:not\s+able|unable)\s+to\b/i,
  /^\s*i['’]m\s+(?:not\s+able|unable)\s+to\b/i,
  /^\s*sorry[,!.\s].*\bi\s+can(?:['’]t|not)\b/i,
];

// Phrases that have no business appearing inside an exported doc — they
// are the model talking TO the user about what it might do next.
const DIALOG_PHRASES: readonly RegExp[] = [
  /\bwould\s+you\s+like\s+me\s+to\b/i,
  /\bdo\s+you\s+want\s+me\s+to\b/i,
  /\bshall\s+i\s+(?:create|export|make|draft)\b/i,
  /\blet\s+me\s+know\s+if\s+you['’]?d\s+like\b/i,
  /\bonce\s+it['’]s\s+in\s+google\s+docs\b/i,
];

// Any docs.google.com URL is a hallucination — the tool returns the URL
// only after creating the doc, so it cannot legitimately appear in the
// body the model is asking us to render. Same for sheets.google.com and
// drive.google.com links to specific files.
const FABRICATED_GOOGLE_URL = /https?:\/\/(?:docs|sheets|drive)\.google\.com\/(?:document|spreadsheets|presentation|file|drawings)\b/i;

export function checkExportMarkdown(markdown: string): ExportGuardResult {
  const trimmed = markdown.trim();
  if (!trimmed) {
    return { ok: false, reason: 'markdown content is required.' };
  }
  if (FABRICATED_GOOGLE_URL.test(trimmed)) {
    return {
      ok: false,
      reason:
        'The markdown contains a Google Docs/Sheets/Drive URL. That URL is what this tool returns AFTER creating the doc — it must not appear in the body you pass in, and you cannot know any such URL ahead of time. Re-invoke the tool with the actual content the user asked to export (e.g. the table or text from your prior assistant message).',
    };
  }
  for (const re of COMPLETION_ANNOUNCEMENT) {
    if (re.test(trimmed)) {
      return {
        ok: false,
        reason:
          'The markdown announces a completed action ("is now in Google Sheets", "has been created"). That is a confirmation message for the user, not document content. Re-invoke the tool with the actual content the user asked to export — typically the markdown from your prior assistant turn.',
      };
    }
  }
  for (const re of SELF_SUMMARY_OPENERS) {
    if (re.test(trimmed)) {
      return {
        ok: false,
        reason:
          'The markdown looks like a confirmation message ("I\'ve created a Google Doc…") rather than the document body. Re-invoke the tool with the actual content the user asked to export — typically the markdown from your prior assistant turn that the user is referring to, or content the user pasted.',
      };
    }
  }
  for (const re of DIALOG_OPENERS) {
    if (re.test(trimmed)) {
      return {
        ok: false,
        reason:
          'The markdown opens with a refusal/clarification directed at the user ("I can\'t…", "I\'m unable to…"). That belongs in your reply, not in the doc body. If you cannot fulfill the request, do NOT call this tool at all — instead, send the refusal as your reply. If you can fulfill it, re-invoke the tool with the actual content the user asked to export (e.g. the markdown table from your prior assistant turn).',
      };
    }
  }
  for (const re of DIALOG_PHRASES) {
    if (re.test(trimmed)) {
      return {
        ok: false,
        reason:
          'The markdown contains conversational phrasing directed at the user ("Would you like me to…", "Once it\'s in Google Docs…"). Document bodies should not address the user as "you" in this dialog way. Re-invoke the tool with the actual content the user asked to export — the markdown from your prior assistant turn, or content the user pasted.',
      };
    }
  }
  // Last-resort structural check: real export bodies almost always have
  // markdown structure (a heading, list, table, code block) or are at
  // least long enough to be substantive. Short prose with none of those
  // is overwhelmingly a chat reply ("Sure thing, here it is.") rather
  // than document content the user asked to save.
  if (looksLikeShortChatReply(trimmed)) {
    return {
      ok: false,
      reason:
        'The markdown is short prose with no document structure (no heading, list, table, or code block). That looks like a chat reply rather than the content the user asked to export. If the user wants you to save a chat-style response, ask them to paste the exact content — otherwise re-invoke the tool with the actual structured content from your prior assistant turn (e.g. the markdown table).',
    };
  }
  return { ok: true };
}

function looksLikeShortChatReply(trimmed: string): boolean {
  if (trimmed.length > 400) return false;
  const hasHeading = /^#{1,6}\s/m.test(trimmed);
  const hasList = /^\s*(?:[-*+]\s|\d+\.\s)/m.test(trimmed);
  const hasTable = /\|.*\|/.test(trimmed);
  const hasFence = /```/.test(trimmed);
  const hasBlockquote = /^>\s/m.test(trimmed);
  return !(hasHeading || hasList || hasTable || hasFence || hasBlockquote);
}
