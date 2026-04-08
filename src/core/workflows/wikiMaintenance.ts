import path from 'path';
import { FileManager } from '../fileManager';
import type { Message } from '../../shared/types';

export interface WikiCompileLLM {
  chat(messages: Message[], systemPrompt: string): Promise<string>;
}

export interface WikiCompileResult {
  message: string;
  synthesisPath: string;
  conceptPaths: string[];
  openQuestionPaths: string[];
  sourceCount: number;
}

export interface WikiHealthResult {
  message: string;
  reportPath: string;
  issueCount: number;
}

interface SourceDigest {
  title: string;
  relativePath: string;
  sourceSlug: string;
  summary: string;
  excerpt: string;
  warning?: string;
  capturedAt?: string;
}

interface CompilePlan {
  overviewSummary: string;
  keyThemes: string[];
  synthesisMarkdown: string;
  concepts: Array<{
    title: string;
    summary: string;
    body: string;
    sourcePaths: string[];
  }>;
  openQuestions: Array<{
    title: string;
    body: string;
    sourcePaths: string[];
  }>;
}

interface SourceMetadataFile {
  title?: string;
  capturedAt?: string;
  warnings?: string[];
}

type HealthFinding = {
  severity: 'high' | 'medium' | 'low';
  title: string;
  detail: string;
};

export async function compileWikiBase(
  basePath: string,
  fileManager: FileManager,
  llm: WikiCompileLLM
): Promise<WikiCompileResult> {
  const sourceDigests = await loadSourceDigests(basePath, fileManager);
  if (sourceDigests.length === 0) {
    throw new Error('Add at least one source before compiling this wiki base.');
  }

  const overviewPath = `${basePath}/overview.md`;
  const existingOverview = await safeRead(fileManager, overviewPath);
  const baseTitle = extractTitle(existingOverview, formatTitle(path.basename(basePath)));
  const compilePlan = await generateCompilePlan(baseTitle, sourceDigests, llm);

  const synthesisPath = `${basePath}/outputs/reports/latest-synthesis.md`;
  const generatedAt = new Date().toISOString();

  const conceptPaths: string[] = [];
  for (const concept of compilePlan.concepts) {
    const slug = slugify(concept.title) || 'concept';
    const relativePath = `wiki/concepts/compiled/${slug}.md`;
    const fullPath = `${basePath}/${relativePath}`;
    await fileManager.writeFile(fullPath, buildConceptMarkdown(concept, sourceDigests));
    conceptPaths.push(fullPath);
  }

  const openQuestionPaths: string[] = [];
  for (const question of compilePlan.openQuestions) {
    const slug = slugify(question.title) || 'open-question';
    const relativePath = `wiki/open-questions/compiled/${slug}.md`;
    const fullPath = `${basePath}/${relativePath}`;
    await fileManager.writeFile(fullPath, buildOpenQuestionMarkdown(question, sourceDigests));
    openQuestionPaths.push(fullPath);
  }

  await fileManager.writeFile(
    synthesisPath,
    buildSynthesisMarkdown(baseTitle, compilePlan, sourceDigests, generatedAt)
  );

  const updatedOverview = upsertSection(
    existingOverview || `# ${baseTitle}\n`,
    'Latest Compile',
    `${compilePlan.overviewSummary}\n\n${compilePlan.keyThemes.length > 0 ? `### Key Themes\n${compilePlan.keyThemes.map((theme) => `- ${theme}`).join('\n')}\n` : ''}### Current Synthesis\n- [Latest synthesis](outputs/reports/latest-synthesis.md)\n- Compiled ${compilePlan.concepts.length} concept page${compilePlan.concepts.length === 1 ? '' : 's'}\n- Generated ${compilePlan.openQuestions.length} open question page${compilePlan.openQuestions.length === 1 ? '' : 's'}\n`
  );
  await fileManager.writeFile(overviewPath, updatedOverview);

  await rebuildWikiIndex(basePath, fileManager);
  await appendWikiLog(
    basePath,
    fileManager,
    `compile | ${baseTitle}`,
    `Compiled ${sourceDigests.length} source package${sourceDigests.length === 1 ? '' : 's'}, wrote ${compilePlan.concepts.length} concept page${compilePlan.concepts.length === 1 ? '' : 's'}, and refreshed synthesis output.`
  );

  return {
    message: `Compiled ${baseTitle} from ${sourceDigests.length} source package${sourceDigests.length === 1 ? '' : 's'}.`,
    synthesisPath,
    conceptPaths,
    openQuestionPaths,
    sourceCount: sourceDigests.length,
  };
}

export async function runWikiHealthCheck(
  basePath: string,
  fileManager: FileManager
): Promise<WikiHealthResult> {
  const [rawMetadataFiles, sourcePages, conceptPages, questionPages, outputPages] = await Promise.all([
    fileManager.listFiles(`${basePath}/raw/*/metadata.json`),
    fileManager.listFiles(`${basePath}/wiki/sources/**/*.md`),
    fileManager.listFiles(`${basePath}/wiki/concepts/**/*.md`),
    fileManager.listFiles(`${basePath}/wiki/open-questions/**/*.md`),
    fileManager.listFiles(`${basePath}/outputs/**/*.md`),
  ]);

  const findings: HealthFinding[] = [];
  const sourcePageSet = new Set(sourcePages.map((page) => path.basename(page, '.md')));
  const rawSourceSet = new Set(rawMetadataFiles.map((meta) => path.basename(path.dirname(meta))));

  for (const sourceSlug of rawSourceSet) {
    if (!sourcePageSet.has(sourceSlug)) {
      findings.push({
        severity: 'high',
        title: `Missing source page for ${sourceSlug}`,
        detail: `The raw package \`raw/${sourceSlug}/\` exists, but \`wiki/sources/${sourceSlug}.md\` is missing.`,
      });
    }
  }

  for (const sourceSlug of sourcePageSet) {
    if (!rawSourceSet.has(sourceSlug)) {
      findings.push({
        severity: 'medium',
        title: `Source page without raw package: ${sourceSlug}`,
        detail: `The wiki source page exists, but the normalized raw package is missing.`,
      });
    }
  }

  const allPages = [...sourcePages, ...conceptPages, ...questionPages, ...outputPages];
  const backlinksByPage = await buildBacklinkMap(allPages, fileManager, basePath);

  for (const sourcePage of sourcePages) {
    const backlinks = backlinksByPage.get(sourcePage) || [];
    const nonSourceBacklinks = backlinks.filter((ref) => !ref.includes('/wiki/sources/'));
    if (nonSourceBacklinks.length === 0) {
      findings.push({
        severity: 'medium',
        title: `Source not referenced elsewhere: ${path.basename(sourcePage)}`,
        detail: `No concept, question, or output page currently links back to \`${relativeToBase(basePath, sourcePage)}\`.`,
      });
    }
  }

  for (const conceptPage of conceptPages) {
    const content = await safeRead(fileManager, conceptPage);
    const sourceRefs = extractMarkdownLinks(content).filter((link) => link.includes('sources/'));
    if (sourceRefs.length === 0) {
      findings.push({
        severity: 'medium',
        title: `Concept missing provenance: ${path.basename(conceptPage)}`,
        detail: `The concept page does not link to any source pages.`,
      });
    }
  }

  const synthesisPage = outputPages.find((page) => page.endsWith('/latest-synthesis.md'));
  if (!synthesisPage) {
    findings.push({
      severity: 'high',
      title: 'Missing synthesis output',
      detail: 'Run compile to generate `outputs/reports/latest-synthesis.md`.',
    });
  } else {
    const synthesisUpdatedAt = await getUpdatedAt(fileManager, synthesisPage);
    for (const metadataPath of rawMetadataFiles) {
      const updatedAt = await getUpdatedAt(fileManager, metadataPath);
      if (updatedAt > synthesisUpdatedAt) {
        findings.push({
          severity: 'low',
          title: 'Synthesis may be stale',
          detail: `At least one ingested source is newer than the latest synthesis report.`,
        });
        break;
      }
    }
  }

  if (questionPages.length === 0) {
    findings.push({
      severity: 'low',
      title: 'No open questions recorded',
      detail: 'Compile should usually leave at least one unresolved question to drive the next research step.',
    });
  }

  const reportPath = `${basePath}/health/latest.md`;
  await fileManager.writeFile(
    reportPath,
    buildHealthReportMarkdown(basePath, {
      sourceCount: sourcePages.length,
      rawPackageCount: rawMetadataFiles.length,
      conceptCount: conceptPages.length,
      questionCount: questionPages.length,
      outputCount: outputPages.length,
      findings,
    })
  );

  await appendWikiLog(
    basePath,
    fileManager,
    'health | Wiki health check',
    `Health check completed with ${findings.length} finding${findings.length === 1 ? '' : 's'}.`
  );

  return {
    message: findings.length === 0
      ? 'Health check completed with no findings.'
      : `Health check completed with ${findings.length} finding${findings.length === 1 ? '' : 's'}.`,
    reportPath,
    issueCount: findings.length,
  };
}

async function generateCompilePlan(
  baseTitle: string,
  sources: SourceDigest[],
  llm: WikiCompileLLM
): Promise<CompilePlan> {
  const systemPrompt = [
    'You maintain a markdown wiki knowledge base inside Keel.',
    'Return strict JSON only. Do not include markdown fences or commentary.',
    'Use this exact schema:',
    '{"overviewSummary":"string","keyThemes":["string"],"synthesisMarkdown":"markdown","concepts":[{"title":"string","summary":"string","body":"markdown","sourcePaths":["wiki/sources/..."]}],"openQuestions":[{"title":"string","body":"markdown","sourcePaths":["wiki/sources/..."]}]}',
    'Keep concepts and open questions concise and grounded in the provided source paths only.',
  ].join(' ');

  const sourceBlock = sources.map((source) => [
    `TITLE: ${source.title}`,
    `PATH: ${source.relativePath}`,
    source.capturedAt ? `CAPTURED: ${source.capturedAt}` : undefined,
    source.warning ? `WARNING: ${source.warning}` : undefined,
    `SUMMARY: ${source.summary}`,
    `EXCERPT: ${source.excerpt}`,
  ].filter(Boolean).join('\n')).join('\n\n---\n\n');

  const prompt = [
    `Wiki base: ${baseTitle}`,
    'Produce a compact compile plan for this knowledge base.',
    'Prefer 3-5 concepts and 2-4 open questions.',
    'The synthesis markdown should read like a durable briefing, not a bullet dump.',
    '',
    sourceBlock,
  ].join('\n');

  try {
    const response = await llm.chat([
      { role: 'user', content: prompt, timestamp: Date.now() },
    ], systemPrompt);
    const parsed = parseCompilePlan(baseTitle, response, sources);
    return parsed;
  } catch {
    return buildFallbackCompilePlan(baseTitle, sources);
  }
}

async function loadSourceDigests(basePath: string, fileManager: FileManager): Promise<SourceDigest[]> {
  const sourcePages = await fileManager.listFiles(`${basePath}/wiki/sources/**/*.md`);
  const digests = await Promise.all(sourcePages.map(async (sourcePath) => {
    const relativePath = relativeToBase(basePath, sourcePath);
    const sourceSlug = path.basename(sourcePath, '.md');
    const [content, metadataContent] = await Promise.all([
      safeRead(fileManager, sourcePath),
      safeRead(fileManager, `${basePath}/raw/${sourceSlug}/metadata.json`),
    ]);

    let metadata: SourceMetadataFile = {};
    try {
      metadata = metadataContent ? JSON.parse(metadataContent) as SourceMetadataFile : {};
    } catch {
      metadata = {};
    }

    return {
      title: extractTitle(content, formatTitle(sourceSlug)),
      relativePath,
      sourceSlug,
      summary: extractSummary(content) || 'No summary available.',
      excerpt: takeExcerpt(content, 900),
      warning: metadata.warnings?.[0],
      capturedAt: metadata.capturedAt,
    } satisfies SourceDigest;
  }));

  return digests.sort((a, b) => a.title.localeCompare(b.title));
}

function parseCompilePlan(baseTitle: string, response: string, sources: SourceDigest[]): CompilePlan {
  const jsonText = extractJsonPayload(response);
  const parsed = JSON.parse(jsonText) as Partial<CompilePlan>;
  if (!parsed || typeof parsed !== 'object') {
    return buildFallbackCompilePlan(baseTitle, sources);
  }

  const knownPaths = new Set(sources.map((source) => source.relativePath));
  const normalizeRefs = (refs: string[] | undefined) =>
    (refs || []).filter((ref) => knownPaths.has(ref)).slice(0, 5);

  const concepts = (parsed.concepts || [])
    .filter((concept) => concept && typeof concept.title === 'string' && concept.title.trim())
    .slice(0, 6)
    .map((concept) => ({
      title: concept.title.trim(),
      summary: (concept.summary || 'Compiled concept page').trim(),
      body: (concept.body || concept.summary || '').trim() || 'No additional detail generated.',
      sourcePaths: normalizeRefs(concept.sourcePaths),
    }));

  const openQuestions = (parsed.openQuestions || [])
    .filter((question) => question && typeof question.title === 'string' && question.title.trim())
    .slice(0, 6)
    .map((question) => ({
      title: question.title.trim(),
      body: (question.body || '').trim() || 'No additional detail generated.',
      sourcePaths: normalizeRefs(question.sourcePaths),
    }));

  if (!parsed.overviewSummary || !parsed.synthesisMarkdown || concepts.length === 0) {
    return buildFallbackCompilePlan(baseTitle, sources);
  }

  return {
    overviewSummary: parsed.overviewSummary.trim(),
    keyThemes: (parsed.keyThemes || []).filter(Boolean).map((theme) => theme.trim()).slice(0, 6),
    synthesisMarkdown: parsed.synthesisMarkdown.trim(),
    concepts: concepts.map((concept) => ({
      ...concept,
      sourcePaths: concept.sourcePaths.length > 0
        ? concept.sourcePaths
        : sources.slice(0, 2).map((source) => source.relativePath),
    })),
    openQuestions: openQuestions.map((question) => ({
      ...question,
      sourcePaths: question.sourcePaths.length > 0
        ? question.sourcePaths
        : sources.slice(0, 2).map((source) => source.relativePath),
    })),
  };
}

function buildFallbackCompilePlan(baseTitle: string, sources: SourceDigest[]): CompilePlan {
  const keyThemes = sources.slice(0, 4).map((source) => source.title);
  const sourceRefs = sources.slice(0, 2).map((source) => source.relativePath);

  return {
    overviewSummary: `${baseTitle} currently aggregates ${sources.length} source package${sources.length === 1 ? '' : 's'} and has enough material for an initial compiled view.`,
    keyThemes,
    synthesisMarkdown: [
      `# Latest Synthesis`,
      '',
      `${baseTitle} is currently centered on ${sources.map((source) => source.title).slice(0, 3).join(', ')}.`,
      '',
      `## Source Coverage`,
      ...sources.map((source) => `- [${source.title}](../../${source.relativePath})`),
    ].join('\n'),
    concepts: [
      {
        title: 'Source Landscape',
        summary: 'A compiled view of the major source threads in this base.',
        body: `This base currently draws from ${sources.length} source package${sources.length === 1 ? '' : 's'}. The most visible threads are ${keyThemes.join(', ')}.`,
        sourcePaths: sourceRefs,
      },
    ],
    openQuestions: [
      {
        title: 'What needs deeper synthesis next?',
        body: 'The wiki has source coverage, but it still needs stronger concept pages and follow-up synthesis tied back to source material.',
        sourcePaths: sourceRefs,
      },
    ],
  };
}

function buildConceptMarkdown(
  concept: CompilePlan['concepts'][number],
  sources: SourceDigest[]
): string {
  return `# ${concept.title}

${concept.summary}

## Explanation

${concept.body}

## Source References

${buildSourceReferenceList(concept.sourcePaths, sources, 'wiki/concepts/compiled')}
`;
}

function buildOpenQuestionMarkdown(
  question: CompilePlan['openQuestions'][number],
  sources: SourceDigest[]
): string {
  return `# ${question.title}

## Question

${question.body}

## Source References

${buildSourceReferenceList(question.sourcePaths, sources, 'wiki/open-questions/compiled')}
`;
}

function buildSynthesisMarkdown(
  baseTitle: string,
  compilePlan: CompilePlan,
  sources: SourceDigest[],
  generatedAt: string
): string {
  return `# Latest Synthesis

Generated: ${generatedAt}

${compilePlan.synthesisMarkdown}

## Source Coverage

${sources.map((source) => `- [${source.title}](../../${source.relativePath})`).join('\n')}
`;
}

function buildSourceReferenceList(sourcePaths: string[], sources: SourceDigest[], currentDir: string): string {
  const pathMap = new Map(sources.map((source) => [source.relativePath, source.title]));
  return sourcePaths.map((sourcePath) => {
    const title = pathMap.get(sourcePath) || formatTitle(path.basename(sourcePath, '.md'));
    const relativeHref = path.posix.relative(currentDir, sourcePath);
    return `- [${title}](${relativeHref})`;
  }).join('\n');
}

async function rebuildWikiIndex(basePath: string, fileManager: FileManager): Promise<void> {
  const [sourcePages, conceptPages, questionPages, outputPages, healthPages] = await Promise.all([
    fileManager.listFiles(`${basePath}/wiki/sources/**/*.md`),
    fileManager.listFiles(`${basePath}/wiki/concepts/**/*.md`),
    fileManager.listFiles(`${basePath}/wiki/open-questions/**/*.md`),
    fileManager.listFiles(`${basePath}/outputs/**/*.md`),
    fileManager.listFiles(`${basePath}/health/**/*.md`),
  ]);

  const buildSection = async (heading: string, filePaths: string[]) => {
    const bullets = await Promise.all(filePaths.sort().map(async (filePath) => {
      const content = await safeRead(fileManager, filePath);
      const title = extractTitle(content, formatTitle(path.basename(filePath, '.md')));
      const relativePath = relativeToBase(basePath, filePath);
      return `- [${title}](${relativePath})`;
    }));
    return `## ${heading}\n${bullets.length > 0 ? `${bullets.join('\n')}\n` : ''}`;
  };

  const content = [
    '# Wiki Index',
    '',
    await buildSection('Sources', sourcePages),
    await buildSection('Concepts', conceptPages),
    await buildSection('Open Questions', questionPages),
    await buildSection('Outputs', outputPages),
    await buildSection('Health', healthPages),
  ].join('\n');

  await fileManager.writeFile(`${basePath}/wiki/index.md`, `${content.trim()}\n`);
}

async function appendWikiLog(basePath: string, fileManager: FileManager, title: string, detail: string): Promise<void> {
  const timestamp = new Date().toISOString();
  const date = timestamp.slice(0, 10);
  const logPath = `${basePath}/wiki/log.md`;
  const entry = `\n## [${date}] ${title}\n${detail}\n`;
  if (!(await fileManager.fileExists(logPath))) {
    await fileManager.writeFile(logPath, `# Wiki Log${entry}`);
    return;
  }
  const existing = await fileManager.readFile(logPath);
  await fileManager.writeFile(logPath, prependLogEntry(existing, entry));
}

function prependLogEntry(content: string, entry: string): string {
  const heading = '# Wiki Log';
  if (!content.startsWith(heading)) {
    return `${heading}${entry}\n${content.trimStart()}`;
  }

  const afterHeading = content.slice(heading.length).replace(/^\n*/, '');
  return `${heading}\n${entry.trim()}\n${afterHeading ? `\n${afterHeading}` : ''}`;
}

async function buildBacklinkMap(
  filePaths: string[],
  fileManager: FileManager,
  basePath: string
): Promise<Map<string, string[]>> {
  const backlinks = new Map<string, string[]>();
  const existingPaths = new Set(filePaths);

  for (const filePath of filePaths) {
    const content = await safeRead(fileManager, filePath);
    const currentRelativePath = relativeToBase(basePath, filePath);
    for (const link of extractMarkdownLinks(content)) {
      const resolved = resolveWikiHref(basePath, currentRelativePath, link);
      if (resolved && existingPaths.has(resolved)) {
        const current = backlinks.get(resolved) || [];
        current.push(filePath);
        backlinks.set(resolved, current);
      }
    }
  }

  return backlinks;
}

function buildHealthReportMarkdown(
  basePath: string,
  input: {
    sourceCount: number;
    rawPackageCount: number;
    conceptCount: number;
    questionCount: number;
    outputCount: number;
    findings: HealthFinding[];
  }
): string {
  const baseName = formatTitle(path.basename(basePath));
  const groupedFindings = ['high', 'medium', 'low'].map((severity) => ({
    severity,
    items: input.findings.filter((finding) => finding.severity === severity),
  }));

  return `# Health Check

Base: ${baseName}
Generated: ${new Date().toISOString()}

## Summary

- Raw packages: ${input.rawPackageCount}
- Source pages: ${input.sourceCount}
- Concept pages: ${input.conceptCount}
- Open question pages: ${input.questionCount}
- Output pages: ${input.outputCount}
- Findings: ${input.findings.length}

## Status

${input.findings.length === 0 ? 'Healthy. No issues detected in the current wiki structure.' : 'Needs attention. Review the findings below before trusting the current synthesis as complete.'}

${groupedFindings.map((group) => {
  if (group.items.length === 0) return '';
  return `## ${formatTitle(group.severity)} Findings\n\n${group.items.map((item) => `### ${item.title}\n${item.detail}`).join('\n\n')}\n`;
}).filter(Boolean).join('\n')}
`;
}

async function safeRead(fileManager: FileManager, relativePath: string): Promise<string> {
  try {
    return await fileManager.readFile(relativePath);
  } catch {
    return '';
  }
}

async function getUpdatedAt(fileManager: FileManager, relativePath: string): Promise<number> {
  const stat = await import('fs/promises').then((fs) => fs.stat(path.join(fileManager.getBrainPath(), relativePath)));
  return stat.mtimeMs;
}

function extractJsonPayload(input: string): string {
  const fenced = input.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const start = input.indexOf('{');
  const end = input.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    return input.slice(start, end + 1);
  }

  return input.trim();
}

function extractTitle(content: string, fallback: string): string {
  const heading = content.match(/^#\s+(.+)$/m);
  return heading?.[1]?.trim() || fallback;
}

function extractSummary(content: string): string {
  const lines = content
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    if (!line.startsWith('#') && !line.startsWith('- ') && !line.startsWith('##')) {
      return line;
    }
  }

  return '';
}

function takeExcerpt(content: string, limit: number): string {
  const normalized = content.replace(/\s+/g, ' ').trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, limit).trim()}…`;
}

function formatTitle(input: string): string {
  return input
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
}

function upsertSection(content: string, heading: string, body: string): string {
  const pattern = new RegExp(`(^##\\s+${escapeRegex(heading)}\\s*$)([\\s\\S]*?)(?=^##\\s+|\\Z)`, 'm');
  const section = `## ${heading}\n\n${body.trim()}\n`;

  if (pattern.test(content)) {
    return content.replace(pattern, `${section}\n`);
  }

  return `${content.trim()}\n\n${section}\n`;
}

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractMarkdownLinks(content: string): string[] {
  const links: string[] = [];
  const pattern = /\[[^\]]+\]\(([^)]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    links.push(match[1]);
  }
  return links;
}

function resolveWikiHref(basePath: string, currentRelativePath: string, href: string): string | null {
  if (!href || href.startsWith('#') || /^https?:\/\//.test(href)) return null;
  const normalizedHref = href.replace(/^\/+/, '');
  const isBaseRelative =
    normalizedHref === 'overview.md' ||
    normalizedHref.startsWith('wiki/') ||
    normalizedHref.startsWith('outputs/') ||
    normalizedHref.startsWith('health/');

  if (isBaseRelative) {
    return `${basePath}/${normalizeRelativePath(normalizedHref)}`;
  }

  const currentDir = currentRelativePath.includes('/')
    ? currentRelativePath.slice(0, currentRelativePath.lastIndexOf('/') + 1)
    : '';

  return `${basePath}/${normalizeRelativePath(`${currentDir}${normalizedHref}`)}`;
}

function normalizeRelativePath(pathValue: string): string {
  const parts = pathValue.split('/');
  const stack: string[] = [];

  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') {
      stack.pop();
      continue;
    }
    stack.push(part);
  }

  return stack.join('/');
}

function relativeToBase(basePath: string, fullPath: string): string {
  return fullPath.slice(`${basePath}/`.length);
}
