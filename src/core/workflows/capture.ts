import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { FileManager } from '../fileManager';
import { LLMClient } from '../llmClient';
import { embedText } from '../embeddings';
import * as vectorStore from '../vectorStore';
import { logActivity } from '../db';

const URL_PATTERN = /^https?:\/\//;

export async function capture(
  input: string,
  fileManager: FileManager,
  llmClient: LLMClient
): Promise<string> {
  const brainPath = fileManager.getBrainPath();
  let content: string;
  let sourceLabel: string;

  if (URL_PATTERN.test(input.trim())) {
    // Fetch and extract URL content
    const url = input.trim();
    try {
      const response = await fetch(url);
      const html = await response.text();
      const dom = new JSDOM(html, { url });
      const reader = new Readability(dom.window.document);
      const article = reader.parse();
      content = article?.textContent || html.slice(0, 5000);
      sourceLabel = article?.title || url;
    } catch (error) {
      return `Failed to fetch URL: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  } else {
    content = input;
    sourceLabel = input.slice(0, 50);
  }

  // Summarize with Claude
  let summary: string;
  try {
    summary = await llmClient.chat(
      [
        {
          role: 'user',
          content: `Summarize the following in 3-5 sentences. Extract any action items as a bullet list at the end.\n\n${content.slice(0, 10000)}`,
          timestamp: Date.now(),
        },
      ],
      'You are a concise summarizer. Output only the summary and action items, nothing else.'
    );
  } catch {
    summary = content.slice(0, 500);
  }

  // Determine best project by embedding similarity
  let projectFolder = '';
  try {
    const queryVector = await embedText(content.slice(0, 1000));
    const results = await vectorStore.search(brainPath, queryVector, 3);

    // Find the most common project folder from results
    const projectCounts = new Map<string, number>();
    for (const r of results) {
      const match = r.chunk.filePath.match(/^projects\/([^/]+)\//);
      if (match) {
        const count = projectCounts.get(match[1]) || 0;
        projectCounts.set(match[1], count + 1);
      }
    }

    let maxCount = 0;
    for (const [proj, count] of projectCounts) {
      if (count > maxCount) {
        maxCount = count;
        projectFolder = proj;
      }
    }
  } catch {
    // No embeddings available — file to general captures
  }

  // Write to the matched project, or projects/captures/ as fallback
  const date = new Date().toISOString().split('T')[0];
  const slug = sourceLabel
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);

  const folder = projectFolder ? `projects/${projectFolder}` : 'projects/captures';
  const fileName = `${folder}/${date}-${slug}.md`;
  const fileContent = `# ${sourceLabel}

**Captured:** ${new Date().toISOString()}
${URL_PATTERN.test(input.trim()) ? `**Source:** ${input.trim()}` : ''}
${projectFolder ? `**Related project:** ${projectFolder}` : ''}

## Summary
${summary}

## Original
${content.slice(0, 3000)}
`;

  await fileManager.writeFile(fileName, fileContent);

  logActivity(brainPath, 'capture', `Filed to ${fileName}`);

  return `Captured and filed to ${fileName}${projectFolder ? ` (related to ${projectFolder})` : ''}`;
}
