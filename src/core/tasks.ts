import type { FileManager } from './fileManager';
import type { TaskGroup, Task } from '../shared/types';
import { getIncomingTask, deleteIncomingTask, logActivity } from './db';

/**
 * Parse a task markdown file into Task objects.
 */
function parseTaskFile(filePath: string, content: string, project: string | null): Task[] {
  const tasks: Task[] = [];
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('- [ ]')) {
      const text = trimmed.replace(/^- \[ \]\s*/, '');
      if (text) tasks.push({ filePath, text, completed: false, project });
    } else if (trimmed.startsWith('- [x]')) {
      const text = trimmed.replace(/^- \[x\]\s*/, '');
      if (text) tasks.push({ filePath, text, completed: true, project });
    }
  }
  return tasks;
}

/**
 * Convert a project slug to a display name.
 * "mac-app-architecture" → "Mac App Architecture"
 */
function slugToDisplayName(slug: string): string {
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * List all tasks from tasks.md and per-project task files, grouped by project.
 */
export async function listAllTasks(fileManager: FileManager): Promise<TaskGroup[]> {
  const groups: TaskGroup[] = [];

  // General tasks
  try {
    const content = await fileManager.readFile('tasks.md');
    const tasks = parseTaskFile('tasks.md', content, null);
    if (tasks.length > 0) {
      groups.push({ project: 'General', slug: null, tasks });
    }
  } catch {
    // No general tasks file
  }

  // Project tasks
  try {
    const taskFiles = await fileManager.listFiles('projects/*/tasks.md');
    for (const file of taskFiles) {
      try {
        const content = await fileManager.readFile(file);
        // Extract slug from path: "projects/{slug}/tasks.md"
        const slugMatch = file.match(/^projects\/([^/]+)\/tasks\.md$/);
        const slug = slugMatch ? slugMatch[1] : file;
        const displayName = slugToDisplayName(slug);
        const tasks = parseTaskFile(file, content, slug);
        if (tasks.length > 0) {
          groups.push({ project: displayName, slug, tasks });
        }
      } catch {
        // Skip unreadable files
      }
    }
  } catch {
    // No project task files
  }

  // Sort: General first, then alphabetical
  groups.sort((a, b) => {
    if (a.slug === null) return -1;
    if (b.slug === null) return 1;
    return a.project.localeCompare(b.project);
  });

  return groups;
}

/**
 * Toggle a task's completion status in its markdown file.
 */
export async function toggleTask(
  fileManager: FileManager,
  filePath: string,
  taskText: string,
  completed: boolean,
): Promise<void> {
  const content = await fileManager.readFile(filePath);
  const lines = content.split('\n');
  const searchPrefix = completed ? '- [ ]' : '- [x]';
  const replaceWith = completed ? '- [x]' : '- [ ]';

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith(searchPrefix)) {
      const text = trimmed.replace(/^- \[.\]\s*/, '');
      if (text === taskText) {
        lines[i] = lines[i].replace(searchPrefix, replaceWith);
        break;
      }
    }
  }

  await fileManager.writeFile(filePath, lines.join('\n'));
}

/**
 * Accept an incoming task: append it to the target markdown file and remove from DB.
 */
export async function acceptIncomingTask(
  fileManager: FileManager,
  brainPath: string,
  id: number,
): Promise<void> {
  const task = getIncomingTask(brainPath, id);
  if (!task) return;

  const newLine = `- [ ] ${task.text}`;

  try {
    const existing = await fileManager.readFile(task.sourceFile);
    await fileManager.writeFile(task.sourceFile, existing.trimEnd() + '\n' + newLine + '\n');
  } catch {
    // File doesn't exist yet — create it
    const header = task.project
      ? `# ${slugToDisplayName(task.project)} — Tasks`
      : '# Tasks';
    await fileManager.writeFile(task.sourceFile, `${header}\n\n${newLine}\n`);
  }

  deleteIncomingTask(brainPath, id);
}

/**
 * Move a task from one file to another (delete from source, append to target).
 */
export async function moveTask(
  fileManager: FileManager,
  sourceFilePath: string,
  targetFilePath: string,
  taskText: string,
  completed: boolean,
): Promise<void> {
  // Remove from source
  const sourceContent = await fileManager.readFile(sourceFilePath);
  const lines = sourceContent.split('\n');
  const prefix = completed ? '- [x]' : '- [ ]';
  let removed = false;
  const newLines = lines.filter((line) => {
    if (removed) return true;
    const trimmed = line.trim();
    if (trimmed.startsWith(prefix)) {
      const text = trimmed.replace(/^- \[.\]\s*/, '');
      if (text === taskText) {
        removed = true;
        return false;
      }
    }
    return true;
  });
  await fileManager.writeFile(sourceFilePath, newLines.join('\n'));

  // Append to target
  const taskLine = `${prefix} ${taskText}`;
  try {
    const existing = await fileManager.readFile(targetFilePath);
    await fileManager.writeFile(targetFilePath, existing.trimEnd() + '\n' + taskLine + '\n');
  } catch {
    // Target file doesn't exist — create it
    const slug = targetFilePath.match(/^projects\/([^/]+)\//)?.[1];
    const header = slug ? `# ${slugToDisplayName(slug)} — Tasks` : '# Tasks';
    await fileManager.writeFile(targetFilePath, `${header}\n\n${taskLine}\n`);
  }
}

/**
 * Create a new project with an empty tasks file.
 */
export async function createProject(
  fileManager: FileManager,
  name: string,
): Promise<string> {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const tasksPath = `projects/${slug}/tasks.md`;
  const contextPath = `projects/${slug}/context.md`;

  if (!(await fileManager.fileExists(contextPath))) {
    await fileManager.writeFile(contextPath, `# ${name}\n\nProject context and notes.\n`);
  }
  if (!(await fileManager.fileExists(tasksPath))) {
    await fileManager.writeFile(tasksPath, `# ${name} — Tasks\n\n`);
  }

  return slug;
}

/**
 * Rename a project folder (and update tasks.md header).
 */
export async function renameProject(
  fileManager: FileManager,
  oldSlug: string,
  newName: string,
): Promise<string> {
  const newSlug = newName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (newSlug === oldSlug) {
    // Same slug — just update display names in files
    try {
      const contextPath = `projects/${oldSlug}/context.md`;
      const content = await fileManager.readFile(contextPath);
      const updated = content.replace(/^# .+/m, `# ${newName}`);
      await fileManager.writeFile(contextPath, updated);
    } catch { /* ignore */ }
    return oldSlug;
  }

  await fileManager.renameDir(`projects/${oldSlug}`, `projects/${newSlug}`);

  // Update context.md header
  try {
    const contextPath = `projects/${newSlug}/context.md`;
    const content = await fileManager.readFile(contextPath);
    const updated = content.replace(/^# .+/m, `# ${newName}`);
    await fileManager.writeFile(contextPath, updated);
  } catch { /* ignore */ }

  // Update tasks.md header
  try {
    const tasksPath = `projects/${newSlug}/tasks.md`;
    const content = await fileManager.readFile(tasksPath);
    const updated = content.replace(/^# .+/m, `# ${newName} — Tasks`);
    await fileManager.writeFile(tasksPath, updated);
  } catch { /* ignore */ }

  return newSlug;
}

/**
 * Delete a project. If moveTasks is true, move open tasks to general tasks.md first.
 */
export async function deleteProject(
  fileManager: FileManager,
  slug: string,
  moveTasks: boolean,
): Promise<void> {
  if (moveTasks) {
    const tasksPath = `projects/${slug}/tasks.md`;
    try {
      const content = await fileManager.readFile(tasksPath);
      const openTasks = content.split('\n')
        .filter((line) => line.trim().startsWith('- [ ]'))
        .map((line) => line.trim());

      if (openTasks.length > 0) {
        try {
          const general = await fileManager.readFile('tasks.md');
          await fileManager.writeFile('tasks.md', general.trimEnd() + '\n' + openTasks.join('\n') + '\n');
        } catch {
          await fileManager.writeFile('tasks.md', `# Tasks\n\n${openTasks.join('\n')}\n`);
        }
      }
    } catch { /* no tasks file */ }
  }

  await fileManager.deleteDir(`projects/${slug}`);
}
