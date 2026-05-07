// Friendly-error mapping for the Sheets connector.
//
// Pre-update users have a Google connection without the auth/spreadsheets
// scope. Their refresh succeeds; the Sheets API call returns 403 with
// "insufficient authentication scopes". We turn that into a message the
// model can relay verbatim instead of leaking the raw API error.

import { describe, it, expect } from 'vitest';
import { explainSheetsApiError } from '../connectors/googleSheets';

describe('explainSheetsApiError', () => {
  it('rewrites 403 + insufficient-scopes into a reconnect prompt', () => {
    const body = JSON.stringify({
      error: {
        code: 403,
        message: 'Request had insufficient authentication scopes.',
        status: 'PERMISSION_DENIED',
      },
    });
    const msg = explainSheetsApiError(403, body);
    expect(msg.toLowerCase()).toContain('reconnect');
    expect(msg.toLowerCase()).toContain('settings');
    expect(msg).not.toMatch(/\b403\b/);
    expect(msg).not.toContain('PERMISSION_DENIED');
  });

  it('also matches the ACCESS_TOKEN_SCOPE_INSUFFICIENT signal', () => {
    const body = '{"error":{"status":"PERMISSION_DENIED","details":[{"reason":"ACCESS_TOKEN_SCOPE_INSUFFICIENT"}]}}';
    expect(explainSheetsApiError(403, body).toLowerCase()).toContain('reconnect');
  });

  it('passes other 403s through with the raw body so genuine errors surface', () => {
    const body = '{"error":{"code":403,"message":"The caller does not have permission"}}';
    const msg = explainSheetsApiError(403, body);
    expect(msg).toContain('Sheets API error: 403');
    expect(msg).toContain('does not have permission');
  });

  it('passes non-403 errors through with their status code', () => {
    expect(explainSheetsApiError(500, 'internal error')).toBe(
      'Sheets API error: 500 internal error'
    );
    expect(explainSheetsApiError(429, 'rate limited')).toContain('429');
  });
});
