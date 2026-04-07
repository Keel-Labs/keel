const TRAILING_WIKI_CITATIONS_BLOCK = /\n\n\*\*Wiki citations\*\*\n([\s\S]*)$/;
const SOURCE_LINE = /(^|\n)(Source:\s*)`?(knowledge-bases\/[^`\s]+\.md)`?/g;
const INLINE_CODE_WIKI_PATH = /`(knowledge-bases\/[^`\s]+\.md)`/g;
const MARKDOWN_WIKI_LINK = /\[[^\]]*]\((knowledge-bases\/[^)\s]+\.md)\)/g;
const PAREN_WIKI_PATH = /\((knowledge-bases\/[^)\s]+\.md)\)/g;
const BARE_WIKI_PATH = /(^|[\s>])((?:knowledge-bases\/)[^)\]\s]+\.md)(?=$|[\s).,;:!?])/gm;

export interface WikiCitationReference {
  id: number;
  sourcePath: string;
  navigationPath: string;
  label: string;
}

export interface FormattedWikiChatCitations {
  content: string;
  references: WikiCitationReference[];
}

export function formatWikiChatCitations(content: string): FormattedWikiChatCitations {
  const { body, trailingPaths } = extractTrailingWikiCitationPaths(content);
  const registry = new Map<string, WikiCitationReference>();
  let placeholderIndex = 0;

  const registerReference = (rawPath: string): WikiCitationReference => {
    const navigationPath = normalizeWikiCitationPath(rawPath);
    const existing = registry.get(navigationPath);
    if (existing) return existing;

    const reference: WikiCitationReference = {
      id: registry.size + 1,
      sourcePath: rawPath,
      navigationPath,
      label: formatWikiCitationLabel(navigationPath),
    };
    registry.set(navigationPath, reference);
    return reference;
  };

  const placeholders = new Map<string, string>();
  const createPlaceholder = (rawPath: string): string => {
    const reference = registerReference(rawPath);
    const token = `@@KEEL_WIKI_REF_${placeholderIndex++}@@`;
    placeholders.set(token, `[[${reference.id}]](${reference.navigationPath})`);
    return token;
  };

  let normalizedBody = body.replace(SOURCE_LINE, (_match, prefix: string, sourceLabel: string, path: string) => `${prefix}${sourceLabel}${createPlaceholder(path)}`);
  normalizedBody = normalizedBody.replace(INLINE_CODE_WIKI_PATH, (_match, path: string) => createPlaceholder(path));
  normalizedBody = normalizedBody.replace(MARKDOWN_WIKI_LINK, (_match, path: string) => createPlaceholder(path));
  normalizedBody = normalizedBody.replace(PAREN_WIKI_PATH, (_match, path: string) => createPlaceholder(path));
  normalizedBody = normalizedBody.replace(BARE_WIKI_PATH, (_match, prefix: string, path: string) => `${prefix}${createPlaceholder(path)}`);

  for (const path of trailingPaths) {
    registerReference(path);
  }

  for (const [token, replacement] of placeholders) {
    normalizedBody = normalizedBody.replaceAll(token, replacement);
  }

  const references = Array.from(registry.values());
  if (references.length === 0) {
    return { content: body, references: [] };
  }

  normalizedBody = replacePlainReferenceNumbers(normalizedBody, references);
  normalizedBody = separateAdjacentCitationLinks(normalizedBody);
  normalizedBody = collapseConsecutiveTrailingCitations(normalizedBody);

  const referenceList = references
    .map((reference) => `${reference.id}. [${reference.label}](${reference.navigationPath})`)
    .join('\n');

  return {
    content: `${normalizedBody.trim()}\n\n**References**\n${referenceList}`,
    references,
  };
}

function extractTrailingWikiCitationPaths(content: string): { body: string; trailingPaths: string[] } {
  const match = content.match(TRAILING_WIKI_CITATIONS_BLOCK);
  if (!match) {
    return { body: content, trailingPaths: [] };
  }

  const trailingPaths = match[1]
    .split('\n')
    .map((line) => line.trim())
    .map((line) => line.match(/^- \[(knowledge-bases\/.+\.md)]$/)?.[1] || null)
    .filter(Boolean) as string[];

  return {
    body: content.slice(0, match.index).trimEnd(),
    trailingPaths,
  };
}

function normalizeWikiCitationPath(path: string): string {
  const rawSourceMatch = path.match(/^(knowledge-bases\/[^/]+)\/raw\/([^/]+)\/source\.md$/);
  if (rawSourceMatch) {
    return `${rawSourceMatch[1]}/wiki/sources/${rawSourceMatch[2]}.md`;
  }
  return path;
}

function formatWikiCitationLabel(path: string): string {
  if (path.endsWith('/overview.md')) return 'Overview';
  if (path.endsWith('/wiki/index.md')) return 'Wiki Index';
  if (path.endsWith('/wiki/log.md')) return 'Activity Log';
  if (path.endsWith('/health/latest.md')) return 'Health Check';

  const fileName = path.split('/').pop()?.replace(/\.md$/, '') || path;
  const title = titleize(fileName);

  if (path.includes('/wiki/sources/')) return `Source: ${title}`;
  if (path.includes('/wiki/concepts/')) return `Concept: ${title}`;
  if (path.includes('/wiki/open-questions/')) return `Open Question: ${title}`;
  if (path.includes('/outputs/')) return `Output: ${title}`;
  if (path.includes('/health/')) return `Health: ${title}`;

  return title;
}

function titleize(value: string): string {
  return value
    .split(/[-_]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function replacePlainReferenceNumbers(content: string, references: WikiCitationReference[]): string {
  const referenceMap = new Map(references.map((reference) => [String(reference.id), reference]));

  return content.replace(/(?<!\[)\[(\d+)](?!\()/g, (match, id: string) => {
    const reference = referenceMap.get(id);
    if (!reference) return match;
    return `[[${id}]](${reference.navigationPath})`;
  });
}

function separateAdjacentCitationLinks(content: string): string {
  return content.replace(/\)\[\[/g, ') [[');
}

function collapseConsecutiveTrailingCitations(content: string): string {
  const lines = content.split('\n');
  let index = 0;

  while (index < lines.length) {
    const currentCitation = getTrailingCitation(lines[index]);
    if (!currentCitation) {
      index += 1;
      continue;
    }

    let runEnd = index;
    while (runEnd + 1 < lines.length) {
      const nextLine = lines[runEnd + 1];
      if (!nextLine.trim()) break;
      const nextCitation = getTrailingCitation(nextLine);
      if (!nextCitation || nextCitation.path !== currentCitation.path) break;
      runEnd += 1;
    }

    if (runEnd > index) {
      for (let cursor = index; cursor < runEnd; cursor += 1) {
        lines[cursor] = stripTrailingCitation(lines[cursor]);
      }
    }

    index = runEnd + 1;
  }

  return lines.join('\n');
}

function getTrailingCitation(line: string): { path: string } | null {
  const match = line.match(/\s*\[\[(\d+)]\]\((knowledge-bases\/[^)]+)\)([.!?,;:]?)\s*$/);
  if (!match) return null;
  return { path: match[2] };
}

function stripTrailingCitation(line: string): string {
  return line.replace(/\s*\[\[(\d+)]\]\((knowledge-bases\/[^)]+)\)([.!?,;:]?)\s*$/, '$3');
}
