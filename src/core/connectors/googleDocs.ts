/**
 * Google Docs export connector.
 *
 * Converts markdown content to a Google Doc using the Google Docs API.
 * Uses simple text insertion with basic formatting.
 */

import { getValidAccessToken, type GoogleOAuthConfig } from './googleAuth';
import { logActivity } from '../db';

interface BoldSpan {
  start: number; // offset within the text
  end: number;
}

interface DocSection {
  type: 'heading' | 'paragraph' | 'list-item' | 'code';
  text: string;
  level?: number; // heading level 1-3
  boldSpans?: BoldSpan[];
}

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
 * Parse markdown into simple sections for Google Docs insertion.
 */
function parseMarkdown(markdown: string): DocSection[] {
  const sections: DocSection[] = [];
  const lines = markdown.split('\n');

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];

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
 */
async function createDoc(
  accessToken: string,
  title: string
): Promise<{ docId: string; url: string }> {
  const response = await fetch('https://docs.googleapis.com/v1/documents', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Docs API error: ${response.status} ${err}`);
  }

  const data = await response.json() as any;
  return {
    docId: data.documentId,
    url: `https://docs.google.com/document/d/${data.documentId}/edit`,
  };
}

/**
 * Insert content into a Google Doc using batchUpdate.
 */
async function insertContent(
  accessToken: string,
  docId: string,
  sections: DocSection[]
): Promise<void> {
  // Build requests in reverse order (insertText inserts at index, shifting everything)
  // We insert from the end to the beginning to maintain correct ordering
  const requests: any[] = [];
  let insertIndex = 1; // Google Docs body starts at index 1

  // Build the full text and formatting requests
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

  // First, insert all text at once
  const fullText = textParts.map((p) => (p.prefix || '') + p.text).join('');
  if (!fullText.trim()) return;

  requests.push({
    insertText: {
      location: { index: insertIndex },
      text: fullText,
    },
  });

  // Then apply heading styles and bold formatting
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

    // Apply bold formatting
    if (part.boldSpans && part.boldSpans.length > 0) {
      const textStart = currentIndex + prefixLen; // offset past the bullet prefix
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
 * Extract a Google Doc ID from a URL.
 * Supports formats like:
 *   https://docs.google.com/document/d/DOC_ID/edit
 *   https://docs.google.com/document/d/DOC_ID/
 *   https://docs.google.com/document/d/DOC_ID
 */
export function extractDocId(url: string): string | null {
  const match = url.match(/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

/**
 * Read the text content of a Google Doc by its ID.
 * Returns the document title and plain text body.
 */
export async function readGoogleDoc(
  brainPath: string,
  config: GoogleOAuthConfig,
  docId: string
): Promise<{ title: string; content: string }> {
  const accessToken = await getValidAccessToken(brainPath, config);

  const response = await fetch(
    `https://docs.googleapis.com/v1/documents/${docId}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Docs API error: ${response.status} ${err}`);
  }

  const doc = await response.json() as any;
  const title = doc.title || 'Untitled';

  // Extract plain text from the document body
  let text = '';
  if (doc.body?.content) {
    for (const element of doc.body.content) {
      if (element.paragraph?.elements) {
        for (const el of element.paragraph.elements) {
          if (el.textRun?.content) {
            text += el.textRun.content;
          }
        }
      }
      if (element.table) {
        for (const row of element.table.tableRows || []) {
          const cells: string[] = [];
          for (const cell of row.tableCells || []) {
            let cellText = '';
            for (const content of cell.content || []) {
              if (content.paragraph?.elements) {
                for (const el of content.paragraph.elements) {
                  if (el.textRun?.content) cellText += el.textRun.content;
                }
              }
            }
            cells.push(cellText.trim());
          }
          text += cells.join(' | ') + '\n';
        }
      }
    }
  }

  logActivity(brainPath, 'read-gdoc', `Read Google Doc: ${title}`);

  return { title, content: text.trim() };
}

/**
 * Export markdown content to a new Google Doc.
 * Returns the URL of the created document.
 */
export async function exportToGoogleDoc(
  brainPath: string,
  config: GoogleOAuthConfig,
  markdownContent: string,
  title: string = 'Keel Export'
): Promise<string> {
  const accessToken = await getValidAccessToken(brainPath, config);

  // Create the document
  const { docId, url } = await createDoc(accessToken, title);

  // Parse and insert content — add title as H1 at top, skip duplicate first line
  const parsed = parseMarkdown(markdownContent);
  const titleNorm = title.toLowerCase().replace(/[^a-z0-9]/g, '');
  // Skip first section if it matches the title (paragraph or heading)
  if (parsed.length > 0 && (parsed[0].type === 'paragraph' || parsed[0].type === 'heading')) {
    const firstNorm = parsed[0].text.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (firstNorm.startsWith(titleNorm) || titleNorm.startsWith(firstNorm)) {
      parsed.shift();
    }
  }
  const sections: DocSection[] = [
    { type: 'heading', text: title, level: 1 },
    ...parsed,
  ];
  await insertContent(accessToken, docId, sections);

  logActivity(brainPath, 'export-gdoc', `Exported to Google Doc: ${title}`);

  return url;
}
