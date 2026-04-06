import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FileManager } from '../fileManager';
import { createWikiBase } from '../workflows/wikiBase';
import { ingestWikiSource } from '../workflows/wikiIngest';
import { compileWikiBase, runWikiHealthCheck } from '../workflows/wikiMaintenance';

describe('wikiMaintenance workflows', () => {
  let tmpDir: string;
  let fm: FileManager;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-wiki-maintenance-'));
    fm = new FileManager(tmpDir);
    await fm.ensureDirectoryStructure();
    await createWikiBase('Research Base', fm, {
      description: 'A wiki base for testing compile and health workflows.',
    });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('compiles ingested sources into synthesis, concepts, questions, and index updates', async () => {
    await ingestWikiSource('knowledge-bases/research-base', {
      sourceType: 'text',
      title: 'Knowledge Graphs',
      text: 'Knowledge graphs improve retrieval quality by preserving entity relationships.',
    }, fm);

    await ingestWikiSource('knowledge-bases/research-base', {
      sourceType: 'text',
      title: 'Agent Memory',
      text: 'Agent memory systems need retrieval, summarization, and durable state over time.',
    }, fm);

    const fakeLlm = {
      chat: async () => JSON.stringify({
        overviewSummary: 'This base now combines retrieval and memory sources into a compact research wiki.',
        keyThemes: ['Retrieval quality', 'Agent memory'],
        synthesisMarkdown: '## Current Read\n\nThe material converges on structured memory and retrieval quality as the main themes.',
        concepts: [
          {
            title: 'Retrieval as Memory Infrastructure',
            summary: 'Retrieval quality drives whether durable memory is useful.',
            body: 'The sources argue that memory systems only compound value when retrieval remains accurate and legible.',
            sourcePaths: ['wiki/sources/knowledge-graphs.md', 'wiki/sources/agent-memory.md'],
          },
        ],
        openQuestions: [
          {
            title: 'How should memory quality be evaluated?',
            body: 'The sources imply evaluation matters, but they do not define a shared benchmark.',
            sourcePaths: ['wiki/sources/agent-memory.md'],
          },
        ],
      }),
    };

    const result = await compileWikiBase('knowledge-bases/research-base', fm, fakeLlm);

    expect(result.sourceCount).toBe(2);
    expect(result.conceptPaths).toHaveLength(1);
    expect(result.openQuestionPaths).toHaveLength(1);

    const concept = await fm.readFile('knowledge-bases/research-base/wiki/concepts/compiled/retrieval-as-memory-infrastructure.md');
    expect(concept).toContain('# Retrieval as Memory Infrastructure');
    expect(concept).toContain('../../sources/knowledge-graphs.md');

    const question = await fm.readFile('knowledge-bases/research-base/wiki/open-questions/compiled/how-should-memory-quality-be-evaluated.md');
    expect(question).toContain('## Question');

    const synthesis = await fm.readFile('knowledge-bases/research-base/outputs/reports/latest-synthesis.md');
    expect(synthesis).toContain('## Current Read');

    const overview = await fm.readFile('knowledge-bases/research-base/overview.md');
    expect(overview).toContain('## Latest Compile');
    expect(overview).toContain('Retrieval quality');

    const index = await fm.readFile('knowledge-bases/research-base/wiki/index.md');
    expect(index).toContain('## Concepts');
    expect(index).toContain('wiki/concepts/compiled/retrieval-as-memory-infrastructure.md');

    const log = await fm.readFile('knowledge-bases/research-base/wiki/log.md');
    expect(log).toContain('compile | Research Base');
  });

  it('writes a health report that flags missing synthesis and orphan sources', async () => {
    await ingestWikiSource('knowledge-bases/research-base', {
      sourceType: 'text',
      title: 'Long Context',
      text: 'Long context windows help, but wiki maintenance still needs durable structure and summaries.',
    }, fm);

    const result = await runWikiHealthCheck('knowledge-bases/research-base', fm);
    expect(result.issueCount).toBeGreaterThan(0);

    const report = await fm.readFile('knowledge-bases/research-base/health/latest.md');
    expect(report).toContain('# Health Check');
    expect(report).toContain('Missing synthesis output');
    expect(report).toContain('Source not referenced elsewhere');

    const log = await fm.readFile('knowledge-bases/research-base/wiki/log.md');
    expect(log).toContain('health | Wiki health check');
  });
});
