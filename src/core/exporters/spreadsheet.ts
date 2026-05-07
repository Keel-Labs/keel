/**
 * Local spreadsheet writer.
 *
 * Produces an .xlsx file inside the user's brain workspace from a typed
 * (rows, headers) input. Used by the `create_local_spreadsheet` tool so the
 * model has a real, no-network way to fulfill table requests instead of
 * pretending it shipped data to Google Sheets.
 *
 * The output path is always inside the brain workspace — callers pass a
 * relative `destination` or we default to `outputs/spreadsheets/<slug>.xlsx`.
 * We never write outside the workspace; the FileManager-resolved absolute
 * path is what we return so the model can echo it to the user.
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import ExcelJS from 'exceljs';
import type { FileManager } from '../fileManager';

export interface WriteSpreadsheetInput {
  title: string;
  rows: string[][];
  headers?: string[];
  destination?: string; // workspace-relative path; .xlsx appended if missing
}

export interface WriteSpreadsheetResult {
  absolutePath: string;
  relativePath: string;
}

/**
 * Convert a free-form title into a filename-safe slug. Lowercase, alnum +
 * hyphens, collapsed runs, max 60 chars. Falls back to "spreadsheet" if the
 * title slugs down to empty (e.g. an all-emoji title).
 */
export function slugifyTitle(title: string): string {
  const slug = (title || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || 'spreadsheet';
}

/**
 * Resolve the workspace-relative output path. If the caller gave us a
 * `destination`, normalize it; otherwise default under outputs/spreadsheets/.
 * Always ends in `.xlsx`. Rejects paths that escape the workspace.
 */
export function resolveDestination(
  title: string,
  destination: string | undefined
): string {
  const provided = (destination || '').trim();
  let relative: string;
  if (provided) {
    // Reject absolute paths and any traversal — keep everything inside the
    // brain workspace. The FileManager would also constrain writes, but
    // failing fast here gives the model a clearer error to react to.
    if (path.isAbsolute(provided) || provided.split(/[\\/]/).includes('..')) {
      throw new Error(
        `destination must be a workspace-relative path inside the brain (got "${provided}").`
      );
    }
    relative = provided;
  } else {
    relative = path.posix.join('outputs', 'spreadsheets', `${slugifyTitle(title)}.xlsx`);
  }
  if (!relative.toLowerCase().endsWith('.xlsx')) {
    relative += '.xlsx';
  }
  return relative;
}

/**
 * Write the workbook to the given absolute path. Ensures the parent dir
 * exists, then has exceljs serialize. We use ExcelJS rather than rolling
 * our own xlsx because users will open these in Excel/Numbers/Sheets and
 * spec compliance matters.
 */
async function writeWorkbook(
  absolutePath: string,
  title: string,
  rows: string[][],
  headers: string[] | undefined
): Promise<void> {
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Keel';
  workbook.created = new Date();
  // Excel limits sheet names to 31 chars and disallows : \ / ? * [ ]
  const sheetName = (title || 'Sheet1')
    .replace(/[\\/:*?\[\]]/g, ' ')
    .trim()
    .slice(0, 31) || 'Sheet1';
  const sheet = workbook.addWorksheet(sheetName);

  if (headers && headers.length > 0) {
    const headerRow = sheet.addRow(headers);
    headerRow.font = { bold: true };
  }
  for (const row of rows) {
    sheet.addRow(row);
  }

  // Light auto-width based on max content length per column. Capped at 60
  // to avoid pathological widths from a single very long cell.
  const colCount = Math.max(
    headers?.length || 0,
    ...rows.map((r) => r.length),
    0
  );
  for (let i = 1; i <= colCount; i++) {
    let maxLen = headers?.[i - 1]?.length ?? 0;
    for (const row of rows) {
      const cellLen = (row[i - 1] ?? '').length;
      if (cellLen > maxLen) maxLen = cellLen;
    }
    sheet.getColumn(i).width = Math.min(Math.max(maxLen + 2, 10), 60);
  }

  await workbook.xlsx.writeFile(absolutePath);
}

/**
 * Public entry point used by the tool executor.
 */
export async function writeLocalSpreadsheet(
  fileManager: FileManager,
  input: WriteSpreadsheetInput
): Promise<WriteSpreadsheetResult> {
  const title = (input.title || '').trim();
  if (!title) throw new Error('title is required.');
  if (!Array.isArray(input.rows)) throw new Error('rows must be an array of arrays.');

  const relativePath = resolveDestination(title, input.destination);
  const brainPath = fileManager.getBrainPath();
  const absolutePath = path.resolve(brainPath, relativePath);

  // Defense in depth: even after slug/normalize, confirm the resolved path
  // stays inside the workspace. Symlink games or odd inputs shouldn't get
  // us out.
  const rel = path.relative(brainPath, absolutePath);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`destination resolves outside the brain workspace.`);
  }

  await writeWorkbook(absolutePath, title, input.rows, input.headers);

  return { absolutePath, relativePath };
}
