/**
 * Google Sheets export connector.
 *
 * Mirrors googleDocs.ts: creates a new Sheet via the Sheets API, populates
 * it via spreadsheets.values.update, optionally moves it into a Drive folder,
 * and returns the spreadsheetUrl.
 *
 * Scope: requires the `auth/spreadsheets` scope (added in googleConfig.ts).
 * The Drive-folder move is best-effort — if the user only granted Sheets
 * scope and not Drive, the file lands in My Drive root, which matches the
 * Docs export behavior today.
 */

import { getValidAccessToken, type GoogleOAuthConfig } from './googleAuth';
import { logActivity } from '../db';

export interface SheetExportInput {
  title: string;
  rows: string[][];
  headers?: string[];
  folderId?: string;
}

export interface SheetExportResult {
  spreadsheetId: string;
  spreadsheetUrl: string;
}

interface SheetsCreateResponse {
  spreadsheetId: string;
  spreadsheetUrl: string;
  sheets?: Array<{ properties?: { sheetId?: number; title?: string } }>;
}

/**
 * Detect the "user connected Google before Sheets support was added" case and
 * throw a message the model can relay verbatim. This is a stopgap until we
 * store granted scopes alongside tokens and gate the tool on scope presence
 * (see follow-up issue) — the structural fix prevents the call from being
 * made at all. Until then, the API call goes through and Google rejects it
 * with 403 + "insufficient authentication scopes".
 *
 * Exported for unit testing only.
 */
export function explainSheetsApiError(status: number, body: string): string {
  // Google returns 403 with a message containing "insufficient authentication
  // scopes" or "ACCESS_TOKEN_SCOPE_INSUFFICIENT" when the bearer token lacks
  // the required scope. Match defensively on either signal.
  const insufficientScope =
    status === 403 &&
    /insufficient authentication scopes|ACCESS_TOKEN_SCOPE_INSUFFICIENT/i.test(body);
  if (insufficientScope) {
    return (
      'Your Google connection was made before Sheets support was added, ' +
      'so it does not include the Sheets scope. Open Settings, disconnect ' +
      'Google, and reconnect to enable Sheets export. In the meantime, I ' +
      'can save the data as a local .xlsx using create_local_spreadsheet.'
    );
  }
  return `Sheets API error: ${status} ${body}`;
}

/**
 * Create the spreadsheet shell with a single sheet. We pass the user-supplied
 * title both as the spreadsheet title and the first sheet's title (truncated
 * to Sheets' 100-char limit, sanitized).
 */
async function createSheet(
  accessToken: string,
  title: string
): Promise<SheetsCreateResponse> {
  const sheetTitle = (title || 'Sheet1')
    .replace(/[\\/:*?\[\]]/g, ' ')
    .trim()
    .slice(0, 100) || 'Sheet1';

  const response = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: { title },
      sheets: [{ properties: { title: sheetTitle } }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(explainSheetsApiError(response.status, err));
  }
  return (await response.json()) as SheetsCreateResponse;
}

/**
 * Populate the first sheet with headers (if any) followed by rows.
 * Uses values.update with USER_ENTERED so plain numbers/dates parse on
 * the Sheets side instead of staying as strings.
 */
async function populateSheet(
  accessToken: string,
  spreadsheetId: string,
  sheetTitle: string,
  headers: string[] | undefined,
  rows: string[][]
): Promise<void> {
  const values: string[][] = [];
  if (headers && headers.length > 0) values.push(headers);
  for (const row of rows) values.push(row);
  if (values.length === 0) return;

  const range = `'${sheetTitle.replace(/'/g, "''")}'!A1`;
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/` +
    `${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ values }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(explainSheetsApiError(response.status, err));
  }
}

/**
 * Bold the header row using batchUpdate. Best-effort — failures here don't
 * fail the export, since the data is already populated.
 */
async function styleHeaderRow(
  accessToken: string,
  spreadsheetId: string,
  sheetId: number,
  headerCols: number
): Promise<void> {
  if (headerCols <= 0) return;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
  try {
    await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: [
          {
            repeatCell: {
              range: {
                sheetId,
                startRowIndex: 0,
                endRowIndex: 1,
                startColumnIndex: 0,
                endColumnIndex: headerCols,
              },
              cell: { userEnteredFormat: { textFormat: { bold: true } } },
              fields: 'userEnteredFormat.textFormat.bold',
            },
          },
        ],
      }),
    });
  } catch {
    // Non-fatal.
  }
}

/**
 * Move the new spreadsheet into the requested Drive folder. Best-effort:
 * if the user hasn't granted Drive scope or the folder isn't accessible,
 * we swallow the error and the file stays in the user's My Drive root.
 */
async function moveToFolder(
  accessToken: string,
  fileId: string,
  folderId: string
): Promise<void> {
  try {
    const url =
      `https://www.googleapis.com/drive/v3/files/${fileId}?addParents=` +
      `${encodeURIComponent(folderId)}&removeParents=root&supportsAllDrives=true`;
    await fetch(url, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    // Non-fatal — file is already created and populated.
  }
}

/**
 * Export tabular data to a new Google Sheet. Returns the spreadsheet URL.
 */
export async function exportToGoogleSheet(
  brainPath: string,
  config: GoogleOAuthConfig,
  input: SheetExportInput
): Promise<SheetExportResult> {
  const title = (input.title || '').trim();
  if (!title) throw new Error('title is required.');
  if (!Array.isArray(input.rows)) throw new Error('rows must be an array of arrays.');

  const accessToken = await getValidAccessToken(brainPath, config);

  const created = await createSheet(accessToken, title);
  const sheetTitle = created.sheets?.[0]?.properties?.title || 'Sheet1';
  const sheetId = created.sheets?.[0]?.properties?.sheetId ?? 0;

  await populateSheet(accessToken, created.spreadsheetId, sheetTitle, input.headers, input.rows);

  if (input.headers && input.headers.length > 0) {
    await styleHeaderRow(accessToken, created.spreadsheetId, sheetId, input.headers.length);
  }

  if (input.folderId && input.folderId.trim()) {
    await moveToFolder(accessToken, created.spreadsheetId, input.folderId.trim());
  }

  logActivity(brainPath, 'export-gsheet', `Exported to Google Sheet: ${title}`);

  return {
    spreadsheetId: created.spreadsheetId,
    spreadsheetUrl: created.spreadsheetUrl,
  };
}
