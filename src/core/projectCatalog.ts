import { FileManager } from './fileManager';

export interface ProjectCatalogEntry {
  slug: string;
  name: string;
  blurb: string;
}

/**
 * Build a small "project catalog" — for each project under `projects/`, the
 * display name and a one-paragraph blurb extracted from the start of its
 * context.md. Blurb is capped at ~240 chars per project so the full catalog
 * stays a few hundred chars to ~2 KB total.
 *
 * Used by:
 *  - capture routing: lets the LLM pick a project without seeing every full
 *    context.md.
 *  - chat context assembly (V2): identity-only inclusion, so the model knows
 *    which projects exist without the assistant regurgitating their full
 *    notes when the user asks about something else.
 */
export async function buildProjectCatalog(fileManager: FileManager): Promise<ProjectCatalogEntry[]> {
  let files: string[];
  try {
    files = await fileManager.listFiles('projects/*/context.md');
  } catch {
    return [];
  }
  const out: ProjectCatalogEntry[] = [];
  for (const f of files) {
    const slug = f.split('/')[1];
    // Skip the legacy `captures` slug in case migration hasn't run yet on
     // this brain. After migration, captures live at top-level `inbox/`.
    if (!slug || slug === 'captures' || slug === 'calendar') continue;
    let ctx = '';
    try { ctx = await fileManager.readFile(f); } catch { continue; }
    const titleMatch = ctx.match(/^#\s+(.+)/m);
    const name = titleMatch ? titleMatch[1].trim() : slug;
    const body = ctx.replace(/^#.+\n/m, '').trim();
    const blurb = (body.split(/\n\s*\n/)[0] || '').replace(/\s+/g, ' ').trim().slice(0, 240);
    out.push({ slug, name, blurb });
  }
  return out;
}
