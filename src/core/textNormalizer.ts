/**
 * Normalize raw text before chunking or embedding.
 * Handles encoding artifacts, invisible characters, and whitespace issues
 * that commonly appear when copying from Notion, Google Docs, web pages, etc.
 */

// Invisible/zero-width Unicode characters to strip
const INVISIBLE_CHARS = /[\u200B\u200C\u200D\uFEFF\u00AD\u2028\u2029\u2060\uFFFC]/g;

// YAML frontmatter pattern (--- at start, --- or ... at end)
const YAML_FRONTMATTER = /^---[\r\n][\s\S]*?^(?:---|\.\.\.)\s*[\r\n]/m;

export function normalizeText(raw: string): string {
  let text = raw;

  // 1. Normalize line endings to \n
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // 2. Strip invisible/zero-width characters
  text = text.replace(INVISIBLE_CHARS, '');

  // 3. Strip YAML frontmatter (try to detect and remove cleanly)
  if (text.startsWith('---')) {
    try {
      text = text.replace(YAML_FRONTMATTER, '');
    } catch {
      // If regex fails for any reason, leave as-is
    }
  }

  // 4. Trim trailing whitespace per line
  text = text
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n');

  // 5. Collapse 3+ consecutive blank lines to 2
  text = text.replace(/\n{3,}/g, '\n\n');

  // 6. Trim leading/trailing whitespace from the whole document
  text = text.trim();

  return text;
}
