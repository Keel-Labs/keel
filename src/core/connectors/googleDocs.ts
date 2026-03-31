/**
 * Google Docs export connector.
 *
 * Converts markdown content to a Google Doc using the Google Docs API.
 * Uses simple text insertion with basic formatting.
 */

import { getValidAccessToken, type GoogleOAuthConfig } from './googleAuth';
import { logActivity } from '../db';

interface DocSection {
  type: 'heading' | 'paragraph' | 'list-item' | 'code';
  text: string;
  level?: number; // heading level 1-3
}

/**
 * Parse markdown into simple sections for Google Docs insertion.
 */
function parseMarkdown(markdown: string): DocSection[] {
  const sections: DocSection[] = [];
  const lines = markdown.split('\n');

  for (const line of lines) {
    // Headings
    const headingMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (headingMatch) {
      sections.push({
        type: 'heading',
        text: headingMatch[2],
        level: headingMatch[1].length,
      });
      continue;
    }

    // List items
    const listMatch = line.match(/^[\s]*[-*]\s+(.+)/);
    if (listMatch) {
      sections.push({ type: 'list-item', text: listMatch[1] });
      continue;
    }

    // Code blocks (simplified — treat as paragraphs with backticks stripped)
    if (line.startsWith('```')) continue;

    // Regular paragraphs
    const trimmed = line.trim();
    if (trimmed) {
      // Strip inline markdown formatting for clean text
      const cleaned = trimmed
        .replace(/\*\*(.+?)\*\*/g, '$1')  // bold
        .replace(/\*(.+?)\*/g, '$1')       // italic
        .replace(/`(.+?)`/g, '$1')         // inline code
        .replace(/\[(.+?)\]\(.+?\)/g, '$1'); // links
      sections.push({ type: 'paragraph', text: cleaned });
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
  const textParts: { text: string; style?: string }[] = [];

  for (const section of sections) {
    switch (section.type) {
      case 'heading':
        textParts.push({ text: section.text + '\n', style: `HEADING_${section.level || 1}` });
        break;
      case 'list-item':
        textParts.push({ text: '  \u2022  ' + section.text + '\n' });
        break;
      case 'paragraph':
        textParts.push({ text: section.text + '\n' });
        break;
      case 'code':
        textParts.push({ text: section.text + '\n' });
        break;
    }
  }

  // First, insert all text at once
  const fullText = textParts.map((p) => p.text).join('');
  if (!fullText.trim()) return;

  requests.push({
    insertText: {
      location: { index: insertIndex },
      text: fullText,
    },
  });

  // Then apply heading styles
  let currentIndex = insertIndex;
  for (const part of textParts) {
    const endIndex = currentIndex + part.text.length;
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

  // Parse and insert content
  const sections = parseMarkdown(markdownContent);
  await insertContent(accessToken, docId, sections);

  logActivity(brainPath, 'export-gdoc', `Exported to Google Doc: ${title}`);

  return url;
}
