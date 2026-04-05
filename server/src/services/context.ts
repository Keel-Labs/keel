import { readBrainFile, listBrainFilesByPattern } from './brain.js';
import { readTeamFile, listTeamFilesByPattern } from './team-brain.js';

const SYSTEM_PROMPT_PREFIX = `You are Keel, a personal AI chief of staff. You know the user's projects, priorities, people, and preferences because they are loaded into your context below.

Your personality: warm, sharp, proactive. You anticipate needs and connect dots.

Rules:
- When the user tells you about themselves, their projects, or priorities: acknowledge in 1-2 sentences. Confirm what you noted. STOP.
- Never hallucinate. If you don't know, say so.
- Keep answers concise unless the user asks for detail.
- Use markdown formatting for structure.

IMPORTANT: When the user asks you to schedule or create a meeting/event, tell them to use the /schedule command. Provide the exact command they should type. Example: /schedule tomorrow at 9am Meeting with Alex.

CONTEXT SOURCES:
- Your personal brain files contain the user's profile, projects, and daily logs.
- The pulse file (pulse.md) contains the user's current priorities and recent activity.
- Team brain files contain shared context across your team (goals, members, shared projects).

Here is everything you know about the user:

`;

export async function assembleContext(
  userId: number,
  messages: any[],
  onStep?: (step: string) => void
): Promise<string> {
  const parts: string[] = [];

  const addSection = (label: string, content: string) => {
    if (content.trim()) {
      parts.push(`--- ${label} ---\n${content}`);
    }
  };

  // 1. keel.md
  try {
    onStep?.('Reading your profile...');
    const keelContent = await readBrainFile(userId, 'keel.md');
    addSection('keel.md', keelContent);
  } catch { /* no keel.md yet */ }

  // 2. pulse.md
  try {
    const pulseContent = await readBrainFile(userId, 'pulse.md');
    addSection('pulse.md', pulseContent);
  } catch { /* no pulse.md yet */ }

  // 3. Project context files
  try {
    const projectFiles = await listBrainFilesByPattern(userId, 'projects/%/context.md');
    if (projectFiles.length > 0) {
      onStep?.(`Scanning ${projectFiles.length} project(s)...`);
      for (const file of projectFiles) {
        try {
          const content = await readBrainFile(userId, file);
          addSection(file, content);
        } catch { /* skip */ }
      }
    }
  } catch { /* no projects */ }

  // 4. Recent daily logs (today + yesterday)
  const today = formatDate(new Date());
  const yesterday = formatDate(new Date(Date.now() - 86_400_000));

  for (const date of [today, yesterday]) {
    try {
      onStep?.('Loading recent daily logs...');
      const content = await readBrainFile(userId, `daily-log/${date}.md`);
      addSection(`daily-log/${date}.md`, content);
    } catch { /* log doesn't exist */ }
  }

  // 5. Recent captures
  try {
    const captureFiles = await listBrainFilesByPattern(userId, 'captures/%');
    if (captureFiles.length > 0) {
      onStep?.(`Loading ${captureFiles.length} capture(s)...`);
      const recentCaptures = captureFiles.sort().reverse().slice(0, 20);
      for (const file of recentCaptures) {
        try {
          const content = await readBrainFile(userId, file);
          addSection(file, content);
        } catch { /* skip */ }
      }
    }
  } catch { /* no captures */ }

  // 6. Project task files
  try {
    const taskFiles = await listBrainFilesByPattern(userId, 'projects/%/tasks.md');
    if (taskFiles.length > 0) {
      onStep?.(`Loading ${taskFiles.length} project task file(s)...`);
      for (const file of taskFiles) {
        try {
          const content = await readBrainFile(userId, file);
          addSection(file, content);
        } catch { /* skip */ }
      }
    }
  } catch { /* no task files */ }

  // 7. General tasks file
  try {
    const tasksContent = await readBrainFile(userId, 'tasks.md');
    addSection('tasks.md', tasksContent);
  } catch { /* no general tasks */ }

  // 8. Team brain files (shared across all users)
  try {
    onStep?.('Loading team context...');
    const teamMd = await readTeamFile('team.md');
    addSection('[TEAM] team.md', teamMd);
  } catch { /* no team.md */ }

  try {
    const teamProjects = await listTeamFilesByPattern('projects/%/context.md');
    for (const file of teamProjects) {
      try {
        const content = await readTeamFile(file);
        addSection(`[TEAM] ${file}`, content);
      } catch { /* skip */ }
    }
  } catch { /* no team projects */ }

  try {
    const teamUpdates = await listTeamFilesByPattern('updates/%.md');
    const recent = teamUpdates.sort().reverse().slice(0, 10);
    for (const file of recent) {
      try {
        const content = await readTeamFile(file);
        addSection(`[TEAM] ${file}`, content);
      } catch { /* skip */ }
    }
  } catch { /* no team updates */ }

  if (parts.length > 0) {
    onStep?.(`Found ${parts.length} relevant section(s)`);
  }

  return SYSTEM_PROMPT_PREFIX + parts.join('\n\n');
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}
