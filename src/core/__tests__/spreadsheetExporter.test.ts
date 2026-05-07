// Local spreadsheet exporter — covers the v1 tool from issue #61.
//
// Verifies:
//   - default destination lands under outputs/spreadsheets/
//   - explicit destinations are honored and forced to .xlsx
//   - workspace-escape attempts are rejected
//   - the produced file is a real .xlsx that round-trips through ExcelJS

import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import ExcelJS from 'exceljs';
import { FileManager } from '../fileManager';
import {
  writeLocalSpreadsheet,
  resolveDestination,
  slugifyTitle,
} from '../exporters/spreadsheet';

let tmpDir: string;
let fm: FileManager;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-sheet-'));
  fm = new FileManager(tmpDir);
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('slugifyTitle / resolveDestination', () => {
  it('slugifies free-form titles', () => {
    expect(slugifyTitle('Q3 2026 Roadmap!')).toBe('q3-2026-roadmap');
    expect(slugifyTitle('   ')).toBe('spreadsheet');
  });

  it('defaults under outputs/spreadsheets when no destination is given', () => {
    expect(resolveDestination('Quarterly Plan', undefined)).toBe(
      'outputs/spreadsheets/quarterly-plan.xlsx'
    );
  });

  it('honors a relative destination and appends .xlsx if missing', () => {
    expect(resolveDestination('any', 'reports/q3')).toBe('reports/q3.xlsx');
    expect(resolveDestination('any', 'reports/q3.xlsx')).toBe('reports/q3.xlsx');
  });

  it('rejects absolute paths and traversal', () => {
    expect(() => resolveDestination('t', '/etc/passwd')).toThrow();
    expect(() => resolveDestination('t', '../../etc/passwd')).toThrow();
  });
});

describe('writeLocalSpreadsheet', () => {
  it('writes an .xlsx with headers and rows that ExcelJS can read back', async () => {
    const result = await writeLocalSpreadsheet(fm, {
      title: 'Roadmap Priorities',
      headers: ['Initiative', 'Impact', 'Effort'],
      rows: [
        ['Spreadsheet tool', 'High', 'M'],
        ['Tool calling', 'High', 'L'],
      ],
    });

    expect(result.relativePath).toBe('outputs/spreadsheets/roadmap-priorities.xlsx');
    expect(result.absolutePath).toBe(path.resolve(tmpDir, result.relativePath));

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(result.absolutePath);
    const sheet = wb.worksheets[0];
    expect(sheet.name).toBe('Roadmap Priorities');
    // Row 1 = headers, row 2/3 = data. ExcelJS rows are 1-indexed.
    const headerVals = sheet.getRow(1).values as unknown[];
    expect(headerVals.slice(1)).toEqual(['Initiative', 'Impact', 'Effort']);
    expect((sheet.getRow(2).values as unknown[]).slice(1)).toEqual([
      'Spreadsheet tool',
      'High',
      'M',
    ]);
  });

  it('writes data-only when no headers are passed', async () => {
    const result = await writeLocalSpreadsheet(fm, {
      title: 'No Headers',
      rows: [['a', 'b'], ['c', 'd']],
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(result.absolutePath);
    const sheet = wb.worksheets[0];
    expect((sheet.getRow(1).values as unknown[]).slice(1)).toEqual(['a', 'b']);
  });

  it('rejects destinations that escape the workspace', async () => {
    await expect(
      writeLocalSpreadsheet(fm, {
        title: 't',
        rows: [['x']],
        destination: '../escape.xlsx',
      })
    ).rejects.toThrow();
  });

  it('rejects empty title', async () => {
    await expect(
      writeLocalSpreadsheet(fm, { title: '   ', rows: [['x']] })
    ).rejects.toThrow();
  });
});
