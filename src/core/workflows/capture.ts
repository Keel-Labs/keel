import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { FileManager } from '../fileManager';
import { LLMClient } from '../llmClient';
import { embedText } from '../embeddings';
import * as vectorStore from '../vectorStore';
import { logActivity } from '../db';
import { readGoogleDoc, extractDocId } from '../connectors/googleDocs';
import { isGoogleConnected } from '../connectors/googleAuth';
import { ingestWikiSource } from './wikiIngest';
import type { GoogleOAuthConfig } from '../connectors/googleAuth';

const URL_PATTERN = /^https?:\/\//;
const GDOC_PATTERN = /docs\.google\.com\/document\/d\//;

function firstSentence(text: string): string {
  const cleaned = text.replace(/^#+\s*/gm, '').replace(/\*\*/g, '').trim();
  const match = cleaned.match(/^(.+?[.!?])\s/);
  return match ? match[1] : cleaned.slice(0, 120);
}

export async function capture(
  input: string,
  fileManager: FileManager,
  llmClient: LLMClient,
  googleConfig?: GoogleOAuthConfig
): Promise<string> {
  const brainPath = fileManager.getBrainPath();
  let content: string;
  let sourceLabel: string;

  if (URL_PATTERN.test(input.trim())) {
    const url = input.trim();

    // Google Docs — use the API instead of HTTP fetch
    if (GDOC_PATTERN.test(url) && googleConfig && isGoogleConnected(brainPath)) {
      const docId = extractDocId(url);
      if (docId) {
        try {
          const { title, content: docContent } = await readGoogleDoc(brainPath, googleConfig, docId);
          content = docContent;
          sourceLabel = title;
        } catch (error) {
          return `Failed to read Google Doc: ${error instanceof Error ? error.message : 'Unknown error'}`;
        }
      } else {
        return 'Could not extract document ID from the Google Docs URL.';
      }
    } else {
      // Regular URL — fetch and extract with Readability
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
          content: `Summarize the following in 2-3 sentences. If there are action items, list them as bullets at the end.\n\n${content.slice(0, 10000)}`,
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
  let projectDisplayName = '';
  try {
    const queryVector = await embedText(content.slice(0, 1000));
    const results = await vectorStore.search(brainPath, queryVector, 3);

    const projectCounts = new Map<string, number>();
    for (const r of results) {
      const match = r.chunk.filePath.match(/^projects\/([^/]+)\//);
      if (match && match[1] !== 'captures') {
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

    // Try to get the display name from context.md
    if (projectFolder) {
      try {
        const ctx = await fileManager.readFile(`projects/${projectFolder}/context.md`);
        const titleMatch = ctx.match(/^#\s+(.+)/m);
        projectDisplayName = titleMatch ? titleMatch[1].trim() : projectFolder;
      } catch {
        projectDisplayName = projectFolder;
      }
    }
  } catch {
    // No embeddings available — file to general captures
  }

  const date = new Date().toISOString().split('T')[0];

  if (projectFolder) {
    // --- Project matched: append to project context ---
    const contextPath = `projects/${projectFolder}/context.md`;
    const captureSection = `\n\n## Capture — ${date}: ${sourceLabel}\n${summary}\n`;

    try {
      const existing = await fileManager.readFile(contextPath);
      await fileManager.writeFile(contextPath, existing.trimEnd() + captureSection);
    } catch {
      // context.md doesn't exist yet — create it
      await fileManager.writeFile(contextPath, `# ${projectDisplayName}\n\nProject context and notes.\n${captureSection}`);
    }

    logActivity(brainPath, 'capture', `Appended to ${contextPath}`);

    // Wiki integration: if project has a wiki knowledge base, also ingest
    try {
      const wikiOverview = `knowledge-bases/${projectFolder}/overview.md`;
      if (await fileManager.fileExists(wikiOverview)) {
        await ingestWikiSource(
          `knowledge-bases/${projectFolder}`,
          { sourceType: 'text', title: sourceLabel, text: content.slice(0, 10000) },
          fileManager
        );
        console.log(`[capture] Also ingested into wiki for ${projectFolder}`);
      }
    } catch (err) {
      console.error('[capture] Wiki ingest failed (non-blocking):', err);
    }
  } else {
    // --- No project match: create standalone capture file ---
    const slug = sourceLabel
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40);

    const fileName = `projects/captures/${date}-${slug}.md`;
    const fileContent = `# ${sourceLabel}

**Captured:** ${new Date().toISOString()}
${URL_PATTERN.test(input.trim()) ? `**Source:** ${input.trim()}` : ''}

## Summary
${summary}

## Original
${content.slice(0, 3000)}
`;

    await fileManager.writeFile(fileName, fileContent);
    logActivity(brainPath, 'capture', `Filed to ${fileName}`);
  }

  // Extract and save tasks (same for both paths)
  try {
    const taskExtraction = await llmClient.chat(
      [{ role: 'user', content: `Extract tasks from this capture:\n\n${content.slice(0, 3000)}`, timestamp: Date.now() }],
      `You extract action items from captured notes. Return JSON only.
If there are tasks/to-dos, return: {"tasks": [{"task": "description", "project": "${projectFolder || ''}"}]}
If no tasks found, return: {"tasks": []}
Respond ONLY with valid JSON.`
    );

    const parsed = JSON.parse(taskExtraction.trim());
    if (parsed.tasks && parsed.tasks.length > 0) {
      for (const t of parsed.tasks) {
        const projName = t.project?.trim() || projectFolder || '';
        if (projName) {
          const projSlug = projName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
          if (projSlug === 'captures') continue;
          const tasksPath = `projects/${projSlug}/tasks.md`;
          const contextPath = `projects/${projSlug}/context.md`;

          if (!(await fileManager.fileExists(contextPath))) {
            await fileManager.writeFile(contextPath, `# ${projName}\n\nProject context and notes.\n`);
          }

          try {
            const existing = await fileManager.readFile(tasksPath);
            if (!existing.includes(t.task)) {
              await fileManager.writeFile(tasksPath, existing.trimEnd() + `\n- [ ] ${t.task}\n`);
            }
          } catch {
            await fileManager.writeFile(tasksPath, `# ${projName} — Tasks\n\n- [ ] ${t.task}\n`);
          }
        } else {
          try {
            const existing = await fileManager.readFile('tasks.md');
            if (!existing.includes(t.task)) {
              await fileManager.writeFile('tasks.md', existing.trimEnd() + `\n- [ ] ${t.task}\n`);
            }
          } catch {
            await fileManager.writeFile('tasks.md', `# Tasks\n\n- [ ] ${t.task}\n`);
          }
        }
      }
      logActivity(brainPath, 'capture-tasks', `Extracted ${parsed.tasks.length} task(s) from capture`);
    }
  } catch (err) {
    console.error('[capture] Task extraction failed:', err);
  }

  // Human-friendly response
  const brief = firstSentence(summary);
  if (projectFolder) {
    return `Saved to **${projectDisplayName}**: ${brief}`;
  }
  return `Captured: ${brief}`;
}
