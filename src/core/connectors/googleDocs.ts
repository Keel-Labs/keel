/**
 * Google Docs export connector.
 *
 * Converts markdown content to a Google Doc using the Google Docs API.
 * Applies proper formatting: headings, bold, italic, bullet/numbered lists.
 */

import { getValidAccessToken, type GoogleOAuthConfig } from './googleAuth';
import { logActivity } from '../db';

/** A range of text that needs inline formatting (bold or italic). */
interface InlineFormat {
  startOffset: number; // relative to the start of the text part
  endOffset: number;
  bold?: boolean;
  italic?: boolean;
}

interface DocSection {
  type: 'heading' | 'paragraph' | 'list-item' | 'numbered-item' | 'code';
  text: string;        // plain text with markdown syntax stripped
  level?: number;      // heading level 1-3
  inlineFormats: InlineFormat[];
}

/**
 * Strip inline markdown and track bold/italic ranges.
 * Returns { text, formats } where text is clean and formats are offset ranges.
 */
function stripInlineMarkdown(raw: string): { text: string; formats: InlineFormat[] } {
  const formats: InlineFormat[] = [];
  let result = '';
  let i = 0;

  while (i < raw.length) {
    // Bold: **text** or __text__
    if ((raw[i] === '*' && raw[i + 1] === '*') || (raw[i] === '_' && raw[i + 1] === '_')) {
      const marker = raw.substring(i, i + 2);
      const end = raw.indexOf(marker, i + 2);
      if (end !== -1) {
        const startOffset = result.length;
        const inner = raw.substring(i + 2, end);
        // Recursively handle nested italic inside bold
        const nested = stripInlineMarkdown(inner);
        result += nested.text;
        formats.push({ startOffset, endOffset: result.length, bold: true });
        for (const f of nested.formats) {
          formats.push({
            startOffset: startOffset + f.startOffset,
            endOffset: startOffset + f.endOffset,
            bold: f.bold,
            italic: f.italic,
          });
        }
        i = end + 2;
        continue;
      }
    }

    // Italic: *text* or _text_ (single)
    if ((raw[i] === '*' || raw[i] === '_') && raw[i + 1] !== raw[i]) {
      const marker = raw[i];
      const end = raw.indexOf(marker, i + 1);
      if (end !== -1 && end > i + 1) {
        const startOffset = result.length;
        const inner = raw.substring(i + 1, end);
        result += inner;
        formats.push({ startOffset, endOffset: result.length, italic: true });
        i = end + 1;
        continue;
      }
    }

    // Inline code: `text`
    if (raw[i] === '`') {
      const end = raw.indexOf('`', i + 1);
      if (end !== -1) {
        result += raw.substring(i + 1, end);
        i = end + 1;
        continue;
      }
    }

    // Links: [text](url) — keep the text
    if (raw[i] === '[') {
      const closeBracket = raw.indexOf(']', i + 1);
      if (closeBracket !== -1 && raw[closeBracket + 1] === '(') {
        const closeParen = raw.indexOf(')', closeBracket + 2);
        if (closeParen !== -1) {
          result += raw.substring(i + 1, closeBracket);
          i = closeParen + 1;
          continue;
        }
      }
    }

    result += raw[i];
    i++;
  }

  return { text: result, formats };
}

/**
 * Parse markdown into structured sections for Google Docs insertion.
 */
function parseMarkdown(markdown: string): DocSection[] {
  const sections: DocSection[] = [];
  const lines = markdown.split('\n');
  let inCodeBlock = false;
  let codeBuffer = '';

  for (const line of lines) {
    // Code block fences
    if (line.trimStart().startsWith('```')) {
      if (inCodeBlock) {
        // End code block
        if (codeBuffer.trim()) {
          sections.push({ type: 'code', text: codeBuffer.trimEnd(), inlineFormats: [] });
        }
        codeBuffer = '';
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBuffer += line + '\n';
      continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (headingMatch) {
      const { text, formats } = stripInlineMarkdown(headingMatch[2]);
      sections.push({
        type: 'heading',
        text,
        level: headingMatch[1].length,
        inlineFormats: formats,
      });
      continue;
    }

    // Numbered list items: 1. text, 2. text, etc.
    const numberedMatch = line.match(/^\s*\d+[.)]\s+(.+)/);
    if (numberedMatch) {
      const { text, formats } = stripInlineMarkdown(numberedMatch[1]);
      sections.push({ type: 'numbered-item', text, inlineFormats: formats });
      continue;
    }

    // Bullet list items
    const listMatch = line.match(/^\s*[-*+]\s+(.+)/);
    if (listMatch) {
      const { text, formats } = stripInlineMarkdown(listMatch[1]);
      sections.push({ type: 'list-item', text, inlineFormats: formats });
      continue;
    }

    // Regular paragraphs
    const trimmed = line.trim();
    if (trimmed) {
      const { text, formats } = stripInlineMarkdown(trimmed);
      sections.push({ type: 'paragraph', text, inlineFormats: formats });
    }
  }

  // Flush any remaining code block
  if (inCodeBlock && codeBuffer.trim()) {
    sections.push({ type: 'code', text: codeBuffer.trimEnd(), inlineFormats: [] });
  }

  return sections;
}

/**
 * Extract a meaningful title from markdown content.
 * Uses the first heading, or the first line truncated to 80 chars.
 */
export function extractTitle(markdown: string): string {
  const lines = markdown.split('\n');
  for (const line of lines) {
    const headingMatch = line.match(/^#{1,3}\s+(.+)/);
    if (headingMatch) {
      return headingMatch[1].replace(/\*\*/g, '').replace(/\*/g, '').trim();
    }
  }
  // No heading found — use first non-empty line
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed) {
      const clean = trimmed
        .replace(/\*\*/g, '').replace(/\*/g, '')
        .replace(/^#+\s*/, '');
      return clean.length > 80 ? clean.slice(0, 77) + '...' : clean;
    }
  }
  return 'Untitled Document';
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
 * Applies headings, bold, italic, and native bullet/numbered lists.
 */
async function insertContent(
  accessToken: string,
  docId: string,
  sections: DocSection[]
): Promise<void> {
  if (sections.length === 0) return;

  const requests: any[] = [];

  // Build text parts and track their metadata for formatting
  const textParts: {
    text: string;
    headingStyle?: string;
    isBullet?: boolean;
    isNumbered?: boolean;
    inlineFormats: InlineFormat[];
  }[] = [];

  for (const section of sections) {
    switch (section.type) {
      case 'heading':
        textParts.push({
          text: section.text + '\n',
          headingStyle: `HEADING_${section.level || 1}`,
          inlineFormats: section.inlineFormats,
        });
        break;
      case 'list-item':
        textParts.push({
          text: section.text + '\n',
          isBullet: true,
          inlineFormats: section.inlineFormats,
        });
        break;
      case 'numbered-item':
        textParts.push({
          text: section.text + '\n',
          isNumbered: true,
          inlineFormats: section.inlineFormats,
        });
        break;
      case 'code':
        // Code blocks: insert with newline, we'll style the font after
        textParts.push({
          text: section.text + '\n',
          inlineFormats: [],
        });
        break;
      case 'paragraph':
        textParts.push({
          text: section.text + '\n',
          inlineFormats: section.inlineFormats,
        });
        break;
    }
  }

  // Insert all text at once
  const fullText = textParts.map((p) => p.text).join('');
  if (!fullText.trim()) return;

  requests.push({
    insertText: {
      location: { index: 1 },
      text: fullText,
    },
  });

  // Now apply formatting based on character offsets
  let currentIndex = 1; // Google Docs body starts at index 1

  for (const part of textParts) {
    const endIndex = currentIndex + part.text.length;

    // Apply heading styles
    if (part.headingStyle) {
      requests.push({
        updateParagraphStyle: {
          range: { startIndex: currentIndex, endIndex: endIndex - 1 },
          paragraphStyle: { namedStyleType: part.headingStyle },
          fields: 'namedStyleType',
        },
      });
    }

    // Apply bullet list
    if (part.isBullet) {
      requests.push({
        createParagraphBullets: {
          range: { startIndex: currentIndex, endIndex: endIndex - 1 },
          bulletPreset: 'BULLET_DISC_CIRCLE_SQUARE',
        },
      });
    }

    // Apply numbered list
    if (part.isNumbered) {
      requests.push({
        createParagraphBullets: {
          range: { startIndex: currentIndex, endIndex: endIndex - 1 },
          bulletPreset: 'NUMBERED_DECIMAL_ALPHA_ROMAN',
        },
      });
    }

    // Apply inline bold/italic formatting
    for (const fmt of part.inlineFormats) {
      const fmtStart = currentIndex + fmt.startOffset;
      const fmtEnd = currentIndex + fmt.endOffset;
      if (fmtEnd > fmtStart) {
        const textStyle: any = {};
        const fields: string[] = [];
        if (fmt.bold) {
          textStyle.bold = true;
          fields.push('bold');
        }
        if (fmt.italic) {
          textStyle.italic = true;
          fields.push('italic');
        }
        if (fields.length > 0) {
          requests.push({
            updateTextStyle: {
              range: { startIndex: fmtStart, endIndex: fmtEnd },
              textStyle,
              fields: fields.join(','),
            },
          });
        }
      }
    }

    // Apply monospace font for code blocks
    if (sections[textParts.indexOf(part)]?.type === 'code') {
      requests.push({
        updateTextStyle: {
          range: { startIndex: currentIndex, endIndex: endIndex - 1 },
          textStyle: {
            weightedFontFamily: { fontFamily: 'Courier New' },
            fontSize: { magnitude: 9, unit: 'PT' },
          },
          fields: 'weightedFontFamily,fontSize',
        },
      });
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
 * Automatically extracts a meaningful title from the content.
 * Returns the URL of the created document.
 */
export async function exportToGoogleDoc(
  brainPath: string,
  config: GoogleOAuthConfig,
  markdownContent: string,
  title?: string
): Promise<string> {
  const accessToken = await getValidAccessToken(brainPath, config);

  // Use provided title or extract one from the content
  const docTitle = title || extractTitle(markdownContent);

  // Create the document
  const { docId, url } = await createDoc(accessToken, docTitle);

  // Parse and insert content
  const sections = parseMarkdown(markdownContent);
  await insertContent(accessToken, docId, sections);

  logActivity(brainPath, 'export-gdoc', `Exported to Google Doc: ${docTitle}`);

  return url;
}
