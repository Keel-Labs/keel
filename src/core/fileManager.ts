import * as fs from 'fs/promises';
import * as path from 'path';
import { glob as globFn } from 'glob';
import { getStarWarsWikiFiles } from './wikiSample';

const BRAIN_DIRS = [
  'projects',
  'daily-log',
  'knowledge-bases',
];

export const KEEL_MD_TEMPLATE = `# Profile
Name: [Your Name]
Role: [Your Role]

# Active Projects
| Project | Status | Deadline | Summary |
|---|---|---|---|

# Current Priorities
1.

# Key People
| Name | Role | Notes |
|---|---|---|

# Conventions
-
`;

const TASKS_MD_TEMPLATE = `# Tasks

`;

const EXAMPLE_PROJECT_CONTEXT = `# Example Project

## Overview
This is an example project to show you how Keel organizes information.
Replace this file with your own project context.

## Goals
- Demonstrate the projects folder structure
- Show how Keel reads project context files

## Status
Just getting started!

## Notes
- Keel reads all \`context.md\` files in \`projects/*/\` to understand your work
- You can create new project folders and add a \`context.md\` to each one
- Use \`tasks.md\` in each project folder to track tasks
`;

export class FileManager {
  private brainPath: string;

  constructor(brainPath: string) {
    this.brainPath = brainPath;
  }

  private resolve(relativePath: string): string {
    return path.resolve(this.brainPath, relativePath);
  }

  async readFile(relativePath: string): Promise<string> {
    const fullPath = this.resolve(relativePath);
    return fs.readFile(fullPath, 'utf-8');
  }

  async writeFile(relativePath: string, content: string): Promise<void> {
    const fullPath = this.resolve(relativePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, 'utf-8');
  }

  async appendToFile(relativePath: string, content: string): Promise<void> {
    const fullPath = this.resolve(relativePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.appendFile(fullPath, content, 'utf-8');
  }

  async listFiles(pattern: string): Promise<string[]> {
    const matches = await globFn(pattern, {
      cwd: this.brainPath,
      nodir: true,
    });
    return matches.sort();
  }

  async ensureDirectoryStructure(): Promise<void> {
    // Snapshot whether this brain is brand-new BEFORE we create anything.
    // Used downstream to decide whether to seed the sample wiki base — we
    // only seed for genuinely new brains, not on every re-init.
    const keelPath = this.resolve('keel.md');
    let brainIsNew: boolean;
    try {
      await fs.access(keelPath);
      brainIsNew = false;
    } catch {
      brainIsNew = true;
    }

    // Ensure core directories exist
    for (const dir of BRAIN_DIRS) {
      await fs.mkdir(this.resolve(dir), { recursive: true });
    }

    // Create keel.md if it doesn't exist
    if (brainIsNew) {
      await fs.writeFile(keelPath, KEEL_MD_TEMPLATE, 'utf-8');
    }

    // Create tasks.md if it doesn't exist
    const tasksPath = this.resolve('tasks.md');
    try {
      await fs.access(tasksPath);
    } catch {
      await fs.writeFile(tasksPath, TASKS_MD_TEMPLATE, 'utf-8');
    }

    // Create example project ONLY for brand-new brains. Otherwise users who
    // intentionally delete the example would see it respawn on every init.
    if (brainIsNew) {
      const exampleDir = this.resolve('projects/example-project');
      const exampleContext = path.join(exampleDir, 'context.md');
      await fs.mkdir(exampleDir, { recursive: true });
      await fs.writeFile(exampleContext, EXAMPLE_PROJECT_CONTEXT, 'utf-8');
    }

    await this.ensureSampleWikiBase(brainIsNew);
  }

  async resetProfile(): Promise<void> {
    // Overwrite keel.md with clean template
    await fs.writeFile(this.resolve('keel.md'), KEEL_MD_TEMPLATE, 'utf-8');

    // Remove all daily logs (they contain hallucinated data)
    try {
      const dailyLogs = await this.listFiles('daily-log/*.md');
      for (const log of dailyLogs) {
        await fs.unlink(this.resolve(log));
      }
    } catch {
      // no logs to delete
    }
  }

  async readSection(relativePath: string, heading: string): Promise<string> {
    const content = await this.readFile(relativePath);
    const lines = content.split('\n');
    const headingPattern = new RegExp(`^#{1,6}\\s+${escapeRegex(heading)}\\s*$`);

    let capturing = false;
    let capturedLevel = 0;
    const result: string[] = [];

    for (const line of lines) {
      const headingMatch = line.match(/^(#{1,6})\s+/);

      if (capturing) {
        if (headingMatch && headingMatch[1].length <= capturedLevel) {
          break;
        }
        result.push(line);
      } else if (headingPattern.test(line)) {
        capturing = true;
        capturedLevel = headingMatch![1].length;
      }
    }

    return result.join('\n').trim();
  }

  async deleteFile(relativePath: string): Promise<void> {
    const fullPath = this.resolve(relativePath);
    await fs.unlink(fullPath);
  }

  async deleteDir(relativePath: string): Promise<void> {
    const fullPath = this.resolve(relativePath);
    await fs.rm(fullPath, { recursive: true, force: true });
  }

  async renameDir(oldRelativePath: string, newRelativePath: string): Promise<void> {
    const oldFull = this.resolve(oldRelativePath);
    const newFull = this.resolve(newRelativePath);
    await fs.mkdir(path.dirname(newFull), { recursive: true });
    await fs.rename(oldFull, newFull);
  }

  async fileExists(relativePath: string): Promise<boolean> {
    try {
      await fs.access(this.resolve(relativePath));
      return true;
    } catch {
      return false;
    }
  }

  getBrainPath(): string {
    return this.brainPath;
  }

  // Marker file recording that the sample wiki base has been seeded (or
  // explicitly skipped because the brain wasn't new). Without this, an
  // existing user who deletes the sample wiki from the UI would see it
  // respawn on the next FileManager init.
  private sampleSeededMarkerPath(): string {
    return this.resolve('.config/.sample-wiki-seeded');
  }

  private async ensureSampleWikiBase(brainIsNew: boolean): Promise<void> {
    const markerPath = this.sampleSeededMarkerPath();
    try {
      await fs.access(markerPath);
      // Marker exists — sample was seeded (or skipped) previously. Do not
      // re-create it. Honors the user's deletion if they removed it later.
      return;
    } catch {
      // No marker yet; fall through.
    }

    if (brainIsNew) {
      // Brand-new brain: seed the sample so the first launch isn't empty.
      const sampleFiles = getStarWarsWikiFiles();
      for (const sample of sampleFiles) {
        const fullPath = this.resolve(sample.path);
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, sample.content, 'utf-8');
      }
    }
    // Else: existing brain. Do not seed — the user may have deliberately
    // deleted the sample at some point, and we don't want to override that
    // decision retroactively.

    // Write the marker either way so future inits skip this entirely.
    await fs.mkdir(path.dirname(markerPath), { recursive: true });
    await fs.writeFile(
      markerPath,
      'Sample wiki base was handled on first init. Delete this file to allow re-seeding.\n',
      'utf-8',
    );
  }
}

export const PULSE_MD_TEMPLATE = `# Pulse
Last updated: —

## Active Focus
- (auto-updated from recent chats)

## Recent Activity
- (auto-updated from daily briefs and EOD summaries)

## Open Threads
- (unresolved questions or topics from recent sessions)
`;

const TEAM_MD_TEMPLATE = `# Team

## Members
| Name | Role | Notes |
|---|---|---|

## Goals

## Norms
`;

const TEAM_DIRS = [
  'projects',
  'updates',
];

export class TeamFileManager extends FileManager {
  async ensureTeamStructure(): Promise<void> {
    // Ensure core team directories exist
    for (const dir of TEAM_DIRS) {
      await fs.mkdir(path.resolve(this.getBrainPath(), dir), { recursive: true });
    }

    // Create team.md if it doesn't exist
    const teamPath = path.resolve(this.getBrainPath(), 'team.md');
    try {
      await fs.access(teamPath);
    } catch {
      await fs.writeFile(teamPath, TEAM_MD_TEMPLATE, 'utf-8');
    }
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
