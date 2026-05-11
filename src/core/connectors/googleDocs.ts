/**
 * Google Docs export connector.
 *
 * Converts markdown content to a Google Doc. The empty document is created
 * via the Drive API (so we only need the `auth/drive.file` scope, which is
 * non-restricted), then populated via the Docs API (which works on files
 * the app created, even under `drive.file`).
 *
 * Reading pre-existing Google Docs is intentionally NOT supported here —
 * `drive.file` only grants access to files Keel itself created. See
 * googleConfig.ts for the scope-strategy rationale.
 */

import { getValidAccessToken, type GoogleOAuthConfig } from './googleAuth';
import { logActivity } from '../db';

/**
 * Thrown when a caller asks Keel to read a pre-existing Google Doc that
 * Keel did not create. The current OAuth scope (`drive.file`) deliberately
 * excludes that capability — see googleConfig.ts.
 */
export const READ_EXISTING_DOC_UNSUPPORTED =
  'Reading existing Google Docs is not supported in this version of Keel. ' +
  'Paste the content directly, attach it as a local file, or export the ' +
  'doc as Markdown first. (Keel only requests access to Docs it creates ' +
  'itself, which avoids requiring a paid Google security assessment.)';

interface BoldSpan {
  start: number; // offset within the text
  end: number;
}

interface TextSection {
  type: 'heading' | 'paragraph' | 'list-item' | 'code';
  text: string;
  level?: number; // heading level 1-3
  boldSpans?: BoldSpan[];
}

interface TableSection {
  type: 'table';
  headers: string[];
  rows: string[][];
}

type DocSection = TextSection | TableSection;

/**
 * Strip inline markdown and extract bold span positions from text.
 */
function extractFormattedText(raw: string): { text: string; boldSpans: BoldSpan[] } {
  const boldSpans: BoldSpan[] = [];
  let result = '';
  let i = 0;

  // First pass: handle **bold** markers and track positions
  while (i < raw.length) {
    if (raw[i] === '*' && raw[i + 1] === '*') {
      const closeIdx = raw.indexOf('**', i + 2);
      if (closeIdx !== -1) {
        const boldText = raw.slice(i + 2, closeIdx);
        boldSpans.push({ start: result.length, end: result.length + boldText.length });
        result += boldText;
        i = closeIdx + 2;
        continue;
      }
    }
    result += raw[i];
    i++;
  }

  // Strip remaining inline markdown
  const cleaned = result
    .replace(/\*(.+?)\*/g, '$1')       // italic
    .replace(/`(.+?)`/g, '$1')         // inline code
    .replace(/\[(.+?)\]\(.+?\)/g, '$1'); // links

  return { text: cleaned, boldSpans };
}

/**
 * Split a Markdown table row by `|`, dropping leading/trailing empty cells from
 * the outer pipes. `\|` inside a cell is treated as a literal pipe.
 */
function splitTableRow(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '\\' && line[i + 1] === '|') {
      current += '|';
      i++;
      continue;
    }
    if (ch === '|') {
      cells.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  cells.push(current);
  // Drop the empty first/last cells that come from the outer leading/trailing pipes.
  if (cells.length > 0 && cells[0].trim() === '') cells.shift();
  if (cells.length > 0 && cells[cells.length - 1].trim() === '') cells.pop();
  return cells.map((c) => c.trim());
}

/**
 * A GFM separator row looks like `| --- | :---: | ---: |` — every cell must be
 * dashes with optional surrounding colons (for alignment) and optional whitespace.
 */
function isTableSeparator(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|') && !trimmed.includes('|')) return false;
  const cells = splitTableRow(trimmed);
  if (cells.length === 0) return false;
  return cells.every((c) => /^:?-{3,}:?$/.test(c));
}

/**
 * Strip inline markdown from a cell (bold/italic/code/links) for plain-text rendering.
 */
function stripInlineMarkdown(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/\[(.+?)\]\(.+?\)/g, '$1');
}

/**
 * Parse markdown into simple sections for Google Docs insertion.
 */
export function parseMarkdown(markdown: string): DocSection[] {
  const sections: DocSection[] = [];
  const lines = markdown.split('\n');

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];

    // GFM table: header row, separator row of dashes, then body rows.
    if (line.includes('|') && idx + 1 < lines.length && isTableSeparator(lines[idx + 1])) {
      const headerCells = splitTableRow(line).map(stripInlineMarkdown);
      const separatorCells = splitTableRow(lines[idx + 1]);
      // Header and separator must have matching column counts to count as a table.
      if (headerCells.length > 0 && headerCells.length === separatorCells.length) {
        const rows: string[][] = [];
        let j = idx + 2;
        while (j < lines.length && lines[j].includes('|') && lines[j].trim() !== '') {
          const cells = splitTableRow(lines[j]).map(stripInlineMarkdown);
          // Pad/truncate to header width so cells line up.
          while (cells.length < headerCells.length) cells.push('');
          rows.push(cells.slice(0, headerCells.length));
          j++;
        }
        sections.push({ type: 'table', headers: headerCells, rows });
        idx = j - 1;
        continue;
      }
    }

    // Headings — demote H1 to H2 since we add our own H1 title
    const headingMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (headingMatch) {
      const level = Math.min(headingMatch[1].length + 1, 3); // demote: H1→H2, H2→H3
      sections.push({
        type: 'heading',
        text: headingMatch[2],
        level,
      });
      continue;
    }

    // Bold-only lines as H2 headings (e.g., "**Current market pain points:**")
    const boldLineMatch = line.trim().match(/^\*\*(.+?)\*\*:?\s*$/);
    if (boldLineMatch) {
      sections.push({ type: 'heading', text: boldLineMatch[1].replace(/:$/, ''), level: 2 });
      continue;
    }

    // Numbered items that are bold section titles (e.g., "1. **About Me**") → H3 heading
    const numberedBoldMatch = line.match(/^[\s]*\d+\.\s+\*\*(.+?)\*\*(.*)/);
    if (numberedBoldMatch) {
      const headingText = numberedBoldMatch[1] + (numberedBoldMatch[2] ? numberedBoldMatch[2].replace(/\*\*/g, '') : '');
      sections.push({ type: 'heading', text: headingText.trim(), level: 3 });
      continue;
    }

    // Regular numbered list items (e.g., "1. Some item")
    const numberedMatch = line.match(/^[\s]*\d+\.\s+(.+)/);
    if (numberedMatch) {
      const { text, boldSpans } = extractFormattedText(numberedMatch[1]);
      sections.push({ type: 'list-item', text, boldSpans });
      continue;
    }

    // List items
    const listMatch = line.match(/^[\s]*[-*]\s+(.+)/);
    if (listMatch) {
      const { text, boldSpans } = extractFormattedText(listMatch[1]);
      sections.push({ type: 'list-item', text, boldSpans });
      continue;
    }

    // Code blocks (simplified — treat as paragraphs with backticks stripped)
    if (line.startsWith('```')) continue;

    // Regular paragraphs
    const trimmed = line.trim();
    if (trimmed) {
      const { text, boldSpans } = extractFormattedText(trimmed);
      sections.push({ type: 'paragraph', text, boldSpans });
    }
  }

  return sections;
}

/**
 * Create a new Google Doc with the given title and return its ID and URL.
 *
 * Uses the Drive API (not the Docs API) to create the empty document, so
 * the OAuth grant only needs `auth/drive.file`. Drive returns a file ID;
 * subsequent Docs API calls (batchUpdate, get) work on that file because
 * `drive.file` grants per-file access to anything the app created.
 */
async function createDoc(
  accessToken: string,
  title: string
): Promise<{ docId: string; url: string }> {
  const response = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: title,
      mimeType: 'application/vnd.google-apps.document',
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Drive API error (create doc): ${response.status} ${err}`);
  }

  const data = (await response.json()) as { id: string };
  return {
    docId: data.id,
    url: `https://docs.google.com/document/d/${data.id}/edit`,
  };
}

async function runBatchUpdate(
  accessToken: string,
  docId: string,
  requests: any[]
): Promise<void> {
  if (requests.length === 0) return;
  const response = await fetch(
    `https://docs.googleapis.com/v1/documents/${docId}:batchUpdate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ requests }),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Docs batchUpdate error: ${response.status} ${err}`);
  }
}

/**
 * Return the index just before the document's trailing newline \u2014 the position
 * where new content should be appended.
 */
async function getAppendIndex(accessToken: string, docId: string): Promise<number> {
  const r = await fetch(
    `https://docs.googleapis.com/v1/documents/${docId}?fields=body(content(endIndex))`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!r.ok) {
    const err = await r.text();
    throw new Error(`Docs get error: ${r.status} ${err}`);
  }
  const data = (await r.json()) as any;
  let lastEnd = 2;
  for (const el of data.body?.content || []) {
    if (typeof el.endIndex === 'number' && el.endIndex > lastEnd) lastEnd = el.endIndex;
  }
  // The last endIndex points just past the doc's trailing newline; insert before it.
  return Math.max(1, lastEnd - 1);
}

/**
 * Build a batchUpdate that inserts a contiguous run of text-like sections at
 * `insertIndex`, returning the requests. Heading and bold formatting are
 * applied via updateParagraphStyle / updateTextStyle requests.
 */
function buildTextRunRequests(sections: TextSection[], insertIndex: number): any[] {
  const requests: any[] = [];
  const textParts: { text: string; style?: string; prefix?: string; boldSpans?: BoldSpan[] }[] = [];

  for (const section of sections) {
    switch (section.type) {
      case 'heading':
        textParts.push({ text: section.text + '\n', style: `HEADING_${section.level || 1}` });
        break;
      case 'list-item':
        textParts.push({ text: section.text + '\n', prefix: '  \u2022  ', boldSpans: section.boldSpans });
        break;
      case 'paragraph':
        textParts.push({ text: section.text + '\n', boldSpans: section.boldSpans });
        break;
      case 'code':
        textParts.push({ text: section.text + '\n' });
        break;
    }
  }

  const fullText = textParts.map((p) => (p.prefix || '') + p.text).join('');
  if (!fullText) return requests;

  requests.push({ insertText: { location: { index: insertIndex }, text: fullText } });

  let currentIndex = insertIndex;
  for (const part of textParts) {
    const prefixLen = (part.prefix || '').length;
    const endIndex = currentIndex + prefixLen + part.text.length;

    if (part.style && part.style.startsWith('HEADING_')) {
      const headingLevel = parseInt(part.style.split('_')[1]);
      const namedStyle = headingLevel === 1 ? 'HEADING_1' : headingLevel === 2 ? 'HEADING_2' : 'HEADING_3';
      requests.push({
        updateParagraphStyle: {
          range: { startIndex: currentIndex, endIndex: endIndex - 1 },
          paragraphStyle: { namedStyleType: namedStyle },
          fields: 'namedStyleType',
        },
      });
    }

    if (part.boldSpans && part.boldSpans.length > 0) {
      const textStart = currentIndex + prefixLen;
      for (const span of part.boldSpans) {
        requests.push({
          updateTextStyle: {
            range: { startIndex: textStart + span.start, endIndex: textStart + span.end },
            textStyle: { bold: true },
            fields: 'bold',
          },
        });
      }
    }

    currentIndex = endIndex;
  }

  return requests;
}

/**
 * Insert a single Markdown table as a real Google Docs table at the document's
 * append position. Done in two batchUpdates: one to insert an empty R\u00d7C table,
 * a second to fill cells in reverse order so earlier-cell index calculations
 * remain valid as later cells get text inserted into them.
 */
async function insertTableSection(
  accessToken: string,
  docId: string,
  table: TableSection
): Promise<void> {
  const allRows: string[][] = [table.headers, ...table.rows];
  const rowCount = allRows.length;
  const colCount = Math.max(...allRows.map((r) => r.length));
  if (rowCount === 0 || colCount === 0) return;

  // Pad short rows so every cell exists.
  const padded = allRows.map((r) => {
    const out = r.slice();
    while (out.length < colCount) out.push('');
    return out;
  });

  const tableStart = await getAppendIndex(accessToken, docId);

  await runBatchUpdate(accessToken, docId, [
    {
      insertTable: {
        rows: rowCount,
        columns: colCount,
        location: { index: tableStart },
      },
    },
  ]);

  // Per the Google Docs API, after inserting an empty R\u00d7C table at index P, the
  // first cell's first paragraph starts at P + 4, each subsequent cell in a row
  // adds 2 indices, and each new row adds 1 extra index for the row boundary.
  // Fill cells in reverse so insertions don't shift earlier cells' indices.
  const cellRequests: any[] = [];
  for (let i = rowCount - 1; i >= 0; i--) {
    for (let j = colCount - 1; j >= 0; j--) {
      const text = padded[i][j];
      if (!text) continue;
      const cellIndex = tableStart + 4 + i * (2 * colCount + 1) + j * 2;
      cellRequests.push({
        insertText: { location: { index: cellIndex }, text },
      });
    }
  }

  // Bold the header row.
  if (cellRequests.length > 0) {
    await runBatchUpdate(accessToken, docId, cellRequests);
  }

  const headerStyleRequests: any[] = [];
  for (let j = 0; j < colCount; j++) {
    const headerText = padded[0][j];
    if (!headerText) continue;
    const cellIndex = tableStart + 4 + 0 * (2 * colCount + 1) + j * 2;
    headerStyleRequests.push({
      updateTextStyle: {
        range: { startIndex: cellIndex, endIndex: cellIndex + headerText.length },
        textStyle: { bold: true },
        fields: 'bold',
      },
    });
  }
  if (headerStyleRequests.length > 0) {
    await runBatchUpdate(accessToken, docId, headerStyleRequests);
  }
}

/**
 * Insert content into a Google Doc. Text-like sections are inserted in batched
 * runs; tables are inserted via dedicated insertTable + cell-fill batchUpdates
 * because table cells live at indices we can only safely compute relative to
 * the freshly-fetched document end.
 */
async function insertContent(
  accessToken: string,
  docId: string,
  sections: DocSection[]
): Promise<void> {
  let i = 0;
  while (i < sections.length) {
    const textRun: TextSection[] = [];
    while (i < sections.length && sections[i].type !== 'table') {
      textRun.push(sections[i] as TextSection);
      i++;
    }

    if (textRun.length > 0) {
      const startIdx = await getAppendIndex(accessToken, docId);
      const requests = buildTextRunRequests(textRun, startIdx);
      await runBatchUpdate(accessToken, docId, requests);
    }

    if (i < sections.length && sections[i].type === 'table') {
      await insertTableSection(accessToken, docId, sections[i] as TableSection);
      i++;
    }
  }
}

/**
 * Recognise a Google Docs URL. Used by callers to detect the unsupported
 * "read this existing doc" case so they can show a helpful message instead
 * of attempting an API call that would fail with a permissions error.
 */
export function isGoogleDocUrl(url: string): boolean {
  return /docs\.google\.com\/document\/d\/[a-zA-Z0-9_-]+/.test(url);
}

/**
 * Derive a Doc title from markdown content when the caller didn't supply one.
 * Prefers the first H1, then the first H2/H3, then the first non-empty line
 * (truncated). Falls back to "Keel Export" only when the content is empty.
 */
export function deriveTitleFromMarkdown(markdown: string): string {
  const FALLBACK = 'Keel Export';
  const MAX_LEN = 80;

  const cleanInline = (s: string): string =>
    s
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/`(.+?)`/g, '$1')
      .replace(/\[(.+?)\]\(.+?\)/g, '$1')
      .trim();

  const truncate = (s: string): string =>
    s.length <= MAX_LEN ? s : s.slice(0, MAX_LEN).replace(/\s+\S*$/, '').trimEnd() + '…';

  const lines = markdown.split('\n');

  for (const heading of [/^#\s+(.+)/, /^##\s+(.+)/, /^###\s+(.+)/]) {
    for (const line of lines) {
      const m = line.match(heading);
      if (m) {
        const text = cleanInline(m[1]).replace(/[:\s]+$/, '');
        if (text) return truncate(text);
      }
    }
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('```') || /^[-*]\s/.test(trimmed)) continue;
    const text = cleanInline(trimmed);
    if (text) return truncate(text);
  }

  return FALLBACK;
}

/**
 * Export markdown content to a new Google Doc.
 * Returns the URL of the created document.
 *
 * If `title` is omitted or blank, a title is derived from the markdown
 * (first heading, falling back to the first non-empty line). The
 * "Keel Export" fallback only kicks in when the content is empty.
 */
export async function exportToGoogleDoc(
  brainPath: string,
  config: GoogleOAuthConfig,
  markdownContent: string,
  title?: string
): Promise<string> {
  const resolvedTitle = (title && title.trim()) || deriveTitleFromMarkdown(markdownContent);
  const accessToken = await getValidAccessToken(brainPath, config);

  // Create the document
  const { docId, url } = await createDoc(accessToken, resolvedTitle);

  // Parse and insert content — add title as H1 at top, skip duplicate first line
  const parsed = parseMarkdown(markdownContent);
  const titleNorm = resolvedTitle.toLowerCase().replace(/[^a-z0-9]/g, '');
  // Skip first section if it matches the title (paragraph or heading)
  if (parsed.length > 0 && (parsed[0].type === 'paragraph' || parsed[0].type === 'heading')) {
    const firstNorm = parsed[0].text.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (firstNorm.startsWith(titleNorm) || titleNorm.startsWith(firstNorm)) {
      parsed.shift();
    }
  }
  const sections: DocSection[] = [
    { type: 'heading', text: resolvedTitle, level: 1 },
    ...parsed,
  ];
  await insertContent(accessToken, docId, sections);

  logActivity(brainPath, 'export-gdoc', `Exported to Google Doc: ${resolvedTitle}`);

  return url;
}
