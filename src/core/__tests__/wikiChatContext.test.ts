import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { FileManager } from '../fileManager';
import { assembleWikiChatContext } from '../wikiChatContext';

let tmpDir: string;
let fileManager: FileManager;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-wiki-chat-'));
  fileManager = new FileManager(tmpDir);
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('assembleWikiChatContext', () => {
  it('uses wiki pages when a compiled page matches the query', async () => {
    await fileManager.writeFile(
      'knowledge-bases/research-base/wiki/concepts/compiled/retrieval.md',
      '# Retrieval\n\nRetrieval quality determines whether durable memory is useful.'
    );

    const result = await assembleWikiChatContext({
      fileManager,
      basePath: 'knowledge-bases/research-base',
      query: 'How important is retrieval quality?',
      digDeep: false,
    });

    expect(result.context).toContain('Retrieval quality determines whether durable memory is useful');
    expect(result.context).toContain('Reference [1] | Concept: Retrieval');
    expect(result.context).not.toContain('--- knowledge-bases/research-base/wiki/concepts/compiled/retrieval.md ---');
    expect(result.citations).toContain('knowledge-bases/research-base/wiki/concepts/compiled/retrieval.md');
  });

  it('includes raw source packages only when dig deep is enabled', async () => {
    await fileManager.writeFile(
      'knowledge-bases/research-base/raw/private-notes/source.md',
      '# Private Notes\n\nAlpha protocol only appears in raw notes.'
    );

    const shallow = await assembleWikiChatContext({
      fileManager,
      basePath: 'knowledge-bases/research-base',
      query: 'What is alpha protocol?',
      digDeep: false,
    });

    const deep = await assembleWikiChatContext({
      fileManager,
      basePath: 'knowledge-bases/research-base',
      query: 'What is alpha protocol?',
      digDeep: true,
    });

    expect(shallow.citations).not.toContain('knowledge-bases/research-base/raw/private-notes/source.md');
    expect(deep.citations).toContain('knowledge-bases/research-base/raw/private-notes/source.md');
    expect(deep.context).toContain('Alpha protocol only appears in raw notes');
  });
});
