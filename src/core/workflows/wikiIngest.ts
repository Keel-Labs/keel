import * as fs from 'fs/promises';
import * as path from 'path';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import { FileManager } from '../fileManager';
import type { WikiIngestResult, WikiSourceInput } from '../../shared/types';

const URL_PATTERN = /^https?:\/\//i;
const SUPPORTED_IMPORT_EXTENSIONS = new Set(['.md', '.markdown', '.txt', '.pdf', '.docx', '.pptx']);

export interface ResolvedSource {
  title: string;
  normalizedContent: string;
  origin: string;
  sourceType: WikiSourceInput['sourceType'];
  extractor: string;
  mimeType: string;
  warning?: string;
}

interface SourceMetadata {
  sourceType: WikiSourceInput['sourceType'];
  title: string;
  origin: string;
  capturedAt: string;
  extractor: string;
  contentHash: string;
  mimeType: string;
  warnings: string[];
  assetPaths: string[];
  status: 'ready';
}

export async function ingestWikiSource(
  basePath: string,
  input: WikiSourceInput,
  fileManager: FileManager
): Promise<WikiIngestResult> {
  const capturedAt = new Date().toISOString();
  const resolved = await resolveSourceInput(input);
  const sourceSlug = await getUniqueSourceSlug(basePath, resolved.title, fileManager);
  const rawDir = `${basePath}/raw/${sourceSlug}`;
  const rawSourcePath = `${rawDir}/source.md`;
  const metadataPath = `${rawDir}/metadata.json`;
  const wikiSourcePath = `${basePath}/wiki/sources/${sourceSlug}.md`;
  const metadata: SourceMetadata = {
    sourceType: resolved.sourceType,
    title: resolved.title,
    origin: resolved.origin,
    capturedAt,
    extractor: resolved.extractor,
    contentHash: createContentHash(resolved.normalizedContent),
    mimeType: resolved.mimeType,
    warnings: resolved.warning ? [resolved.warning] : [],
    assetPaths: [],
    status: 'ready',
  };

  await fs.mkdir(path.join(fileManager.getBrainPath(), rawDir, 'assets'), { recursive: true });
  await fileManager.writeFile(rawSourcePath, buildNormalizedSourceMarkdown(resolved.title, resolved.origin, capturedAt, resolved.normalizedContent));
  await fileManager.writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
  await fileManager.writeFile(
    wikiSourcePath,
    buildWikiSourcePage({
      title: resolved.title,
      origin: resolved.origin,
      sourceType: resolved.sourceType,
      capturedAt,
      rawSourcePath,
      content: resolved.normalizedContent,
      warning: resolved.warning,
    })
  );

  await updateWikiIndex(basePath, resolved.title, `wiki/sources/${sourceSlug}.md`, fileManager);
  await appendWikiLog(basePath, resolved.title, capturedAt, fileManager);

  return {
    sourceSlug,
    title: resolved.title,
    pagePath: wikiSourcePath,
    relativePagePath: `wiki/sources/${sourceSlug}.md`,
    message: `Added source "${resolved.title}" to ${basePath}.`,
    warning: resolved.warning,
  };
}

async function resolveSourceInput(input: WikiSourceInput): Promise<ResolvedSource> {
  switch (input.sourceType) {
    case 'url':
      return resolveUrlSource(input);
    case 'file':
      return resolveFileSource(input);
    case 'text':
    default:
      return resolveTextSource(input);
  }
}

async function resolveUrlSource(input: WikiSourceInput): Promise<ResolvedSource> {
  const url = input.url?.trim();
  if (!url || !URL_PATTERN.test(url)) {
    throw new Error('Enter a valid URL to ingest.');
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  const dom = new JSDOM(html, { url });
  const article = new Readability(dom.window.document).parse();
  const title = (input.title || article?.title || url).trim();
  const content = (article?.textContent || '').trim();

  if (content) {
    return {
      title,
      normalizedContent: content,
      origin: url,
      sourceType: 'url',
      extractor: 'readability',
      mimeType: 'text/html',
    };
  }

  const fallback = dom.window.document.body?.textContent?.replace(/\s+/g, ' ').trim() || '';
  if (!fallback) {
    throw new Error('The URL did not contain readable article content.');
  }

  return {
    title,
    normalizedContent: fallback,
    origin: url,
    sourceType: 'url',
    extractor: 'readability-fallback',
    mimeType: 'text/html',
    warning: 'Used a plain text fallback because article extraction returned no readable content.',
  };
}

async function resolveTextSource(input: WikiSourceInput): Promise<ResolvedSource> {
  const text = input.text?.trim();
  if (!text) {
    throw new Error('Paste some source text to ingest.');
  }

  return {
    title: deriveTitle(input.title, text),
    normalizedContent: text,
    origin: 'Pasted into Keel',
    sourceType: 'text',
    extractor: 'manual-input',
    mimeType: 'text/markdown',
  };
}

async function resolveFileSource(input: WikiSourceInput): Promise<ResolvedSource> {
  const filePath = input.filePath?.trim();
  if (!filePath) {
    throw new Error('Choose a file to import.');
  }

  return extractFileSource(filePath, input.fileName, input.title);
}

export async function extractFileSource(
  filePath: string,
  fileName?: string,
  titleOverride?: string,
): Promise<ResolvedSource> {
  const normalizedPath = filePath.trim();
  if (!normalizedPath) {
    throw new Error('Choose a file to import.');
  }

  const extension = path.extname(normalizedPath).toLowerCase();
  if (!SUPPORTED_IMPORT_EXTENSIONS.has(extension)) {
    throw new Error('Supported files: Markdown, text, PDF, Word (.docx), and PowerPoint (.pptx).');
  }

  const fileBuffer = await fs.readFile(normalizedPath);
  let content = '';
  let warning: string | undefined;
  let extractor = 'filesystem-text';
  let mimeType = 'text/markdown';

  if (extension === '.md' || extension === '.markdown' || extension === '.txt') {
    content = fileBuffer.toString('utf-8');
    mimeType = extension === '.txt' ? 'text/plain' : 'text/markdown';
  } else if (extension === '.docx') {
    const result = await mammoth.extractRawText({ buffer: fileBuffer });
    content = result.value;
    extractor = 'mammoth';
    mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    warning = summarizeMammothMessages(result.messages);
  } else if (extension === '.pdf') {
    const parser = new PDFParse({ data: new Uint8Array(fileBuffer) });
    try {
      const result = await parser.getText();
      content = result.text;
    } finally {
      await parser.destroy().catch(() => undefined);
    }
    extractor = 'pdf-parse';
    mimeType = 'application/pdf';
  } else if (extension === '.pptx') {
    content = await extractPptxText(fileBuffer);
    extractor = 'pptx-slide-text';
    mimeType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    warning = 'Extracted slide text only. Layout, speaker notes, and embedded media were not imported.';
  }

  content = normalizeExtractedText(content);
  if (!content) {
    throw new Error('The selected file is empty.');
  }

  const fallbackName = path.basename(fileName || normalizedPath, extension);

  return {
    title: titleOverride?.trim() || deriveTitle(undefined, content) || fallbackName,
    normalizedContent: content,
    origin: normalizedPath,
    sourceType: 'file',
    extractor,
    mimeType,
    warning,
  };
}

async function getUniqueSourceSlug(basePath: string, title: string, fileManager: FileManager): Promise<string> {
  const baseSlug = slugify(title) || 'source';
  let slug = baseSlug;
  let suffix = 2;

  while (
    await fileManager.fileExists(`${basePath}/raw/${slug}/metadata.json`) ||
    await fileManager.fileExists(`${basePath}/wiki/sources/${slug}.md`)
  ) {
    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  return slug;
}

async function updateWikiIndex(basePath: string, title: string, relativePagePath: string, fileManager: FileManager): Promise<void> {
  const indexPath = `${basePath}/wiki/index.md`;
  const nextBullet = `- [${title}](${relativePagePath})`;
  let content = '# Wiki Index\n\n## Sources\n';

  if (await fileManager.fileExists(indexPath)) {
    content = await fileManager.readFile(indexPath);
  }

  await fileManager.writeFile(indexPath, upsertBulletInSection(content, 'Sources', nextBullet));
}

async function appendWikiLog(basePath: string, title: string, capturedAt: string, fileManager: FileManager): Promise<void> {
  const logPath = `${basePath}/wiki/log.md`;
  const date = capturedAt.slice(0, 10);
  const entry = `\n## [${date}] ingest | ${title}\nAdded source package under \`raw/\` and created the source page in \`wiki/sources/\`.\n`;

  if (!(await fileManager.fileExists(logPath))) {
    await fileManager.writeFile(logPath, `# Wiki Log${entry}`);
    return;
  }

  await fileManager.appendToFile(logPath, entry);
}

function buildNormalizedSourceMarkdown(title: string, origin: string, capturedAt: string, content: string): string {
  return `# ${title}

**Origin:** ${origin}
**Captured:** ${capturedAt}

## Extracted Content
${content}
`;
}

function buildWikiSourcePage({
  title,
  origin,
  sourceType,
  capturedAt,
  rawSourcePath,
  content,
  warning,
}: {
  title: string;
  origin: string;
  sourceType: WikiSourceInput['sourceType'];
  capturedAt: string;
  rawSourcePath: string;
  content: string;
  warning?: string;
}): string {
  const summary = summarizeContent(content);
  const excerpt = takeExcerpt(content, 1400);

  return `# ${title}

${summary}

## Source Metadata

- Type: ${formatSourceType(sourceType)}
- Origin: ${origin}
- Captured: ${capturedAt}
- Raw package: \`${rawSourcePath}\`
${warning ? `- Warning: ${warning}\n` : ''}
## Excerpt

${excerpt}
`;
}

function upsertBulletInSection(content: string, sectionHeading: string, bullet: string): string {
  if (content.includes(bullet)) {
    return content;
  }

  const headingPattern = new RegExp(`^##\\s+${escapeRegex(sectionHeading)}\\s*$`, 'm');
  const headingMatch = content.match(headingPattern);
  if (!headingMatch || headingMatch.index == null) {
    return `${content.trimEnd()}\n\n## ${sectionHeading}\n${bullet}\n`;
  }

  const insertStart = headingMatch.index + headingMatch[0].length;
  const afterHeading = content.slice(insertStart);
  const nextHeadingIndex = afterHeading.search(/\n##\s+/);
  const sectionEnd = nextHeadingIndex === -1 ? content.length : insertStart + nextHeadingIndex + 1;
  const sectionBody = content.slice(insertStart, sectionEnd).trimEnd();
  const updatedSection = `${sectionBody ? `${sectionBody}\n` : '\n'}${bullet}\n`;

  return `${content.slice(0, insertStart)}\n${updatedSection}${content.slice(sectionEnd)}`;
}

function summarizeContent(content: string): string {
  const paragraphs = content
    .split(/\n{2,}/)
    .map((chunk) => stripMarkdown(chunk).trim())
    .filter(Boolean);

  return paragraphs.slice(0, 2).join('\n\n') || 'Source ingested into this wiki base.';
}

function takeExcerpt(content: string, maxLength: number): string {
  const excerpt = stripMarkdown(content).trim();
  if (excerpt.length <= maxLength) return excerpt;
  return `${excerpt.slice(0, maxLength).trimEnd()}...`;
}

function deriveTitle(preferred: string | undefined, content: string): string {
  const trimmedPreferred = preferred?.trim();
  if (trimmedPreferred) return trimmedPreferred;

  const firstLine = content
    .split('\n')
    .map((line) => line.replace(/^#+\s*/, '').trim())
    .find(Boolean);

  return (firstLine || content.slice(0, 60)).trim().slice(0, 80);
}

function formatSourceType(sourceType: WikiSourceInput['sourceType']): string {
  switch (sourceType) {
    case 'url':
      return 'URL Article';
    case 'file':
      return 'Document File';
    case 'text':
    default:
      return 'Pasted Text';
  }
}

function createContentHash(content: string): string {
  let hash = 0;
  for (let index = 0; index < content.length; index += 1) {
    hash = ((hash << 5) - hash) + content.charCodeAt(index);
    hash |= 0;
  }
  return `h${Math.abs(hash)}`;
}

function stripMarkdown(content: string): string {
  return content
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\s+\n/g, '\n');
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeExtractedText(content: string): string {
  return content
    .replace(/\r\n/g, '\n')
    .replace(/\u0000/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function summarizeMammothMessages(messages: Array<{ message: string }>): string | undefined {
  const summary = messages
    .map((message) => message.message?.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join(' ');

  return summary || undefined;
}

async function extractPptxText(fileBuffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(fileBuffer);
  const parser = new XMLParser({
    ignoreAttributes: false,
    trimValues: true,
  });

  const slideEntries = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((left, right) => getSlideNumber(left) - getSlideNumber(right));

  const slides: string[] = [];

  for (const slidePath of slideEntries) {
    const slideFile = zip.file(slidePath);
    if (!slideFile) continue;

    const xml = await slideFile.async('text');
    const parsed = parser.parse(xml);
    const textRuns = collectPptxText(parsed);
    if (textRuns.length === 0) continue;

    slides.push(`## Slide ${getSlideNumber(slidePath)}\n${textRuns.join('\n')}`);
  }

  return slides.join('\n\n');
}

function collectPptxText(node: unknown, textRuns: string[] = []): string[] {
  if (typeof node === 'string') {
    const trimmed = node.trim();
    if (trimmed) textRuns.push(trimmed);
    return textRuns;
  }

  if (Array.isArray(node)) {
    node.forEach((child) => collectPptxText(child, textRuns));
    return textRuns;
  }

  if (!node || typeof node !== 'object') {
    return textRuns;
  }

  Object.entries(node).forEach(([key, value]) => {
    if (key === 'a:t' || key === 't') {
      collectPptxText(value, textRuns);
      return;
    }

    collectPptxText(value, textRuns);
  });

  return textRuns;
}

function getSlideNumber(slidePath: string): number {
  const match = slidePath.match(/slide(\d+)\.xml$/);
  return match ? Number(match[1]) : 0;
}
