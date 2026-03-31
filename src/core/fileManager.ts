import * as fs from 'fs/promises';
import * as path from 'path';
import { glob as globFn } from 'glob';

const PARA_DIRS = [
  'inbox',
  'projects',
  'ongoing',
  'reference',
  'archive',
  'daily-log',
];

// Old folder names → new folder names for one-time migration
const PARA_MIGRATIONS: [string, string][] = [
  ['00_inbox',    'inbox'],
  ['01_projects', 'projects'],
  ['02_areas',    'ongoing'],
  ['03_resources','reference'],
  ['04_archives', 'archive'],
  ['daily_log',   'daily-log'],
];

const KEEL_MD_TEMPLATE = `# Profile
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
    // One-time migration: rename old PARA folders to new names
    for (const [oldName, newName] of PARA_MIGRATIONS) {
      const oldPath = this.resolve(oldName);
      const newPath = this.resolve(newName);
      try {
        await fs.access(oldPath);
        // Old folder exists — rename it (only if new name doesn't exist yet)
        try {
          await fs.access(newPath);
          // New folder already exists — skip
        } catch {
          await fs.rename(oldPath, newPath);
        }
      } catch {
        // Old folder doesn't exist — nothing to migrate
      }
    }

    // Ensure all new directories exist
    for (const dir of PARA_DIRS) {
      await fs.mkdir(this.resolve(dir), { recursive: true });
    }

    // Create keel.md if it doesn't exist
    const keelPath = this.resolve('keel.md');
    try {
      await fs.access(keelPath);
    } catch {
      await fs.writeFile(keelPath, KEEL_MD_TEMPLATE, 'utf-8');
    }

    // Create example project if it doesn't exist
    const exampleDir = this.resolve('projects/example-project');
    const exampleContext = path.join(exampleDir, 'context.md');
    try {
      await fs.access(exampleContext);
    } catch {
      await fs.mkdir(exampleDir, { recursive: true });
      await fs.writeFile(exampleContext, EXAMPLE_PROJECT_CONTEXT, 'utf-8');
    }
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
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
