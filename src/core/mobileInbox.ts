// Pure protocol helpers for the mobile companion inbox.
//
// Lives in src/core/ (not electron/) so it can be unit-tested without
// pulling in electron-log and other Mac-process-only deps. The watcher
// itself lives at electron/inboxWatcher.ts and imports from here.
//
// Contract: docs/mobile-companion-spec.md

// <utc-iso-basic>__<device-id>__<nonce>.md
//   utc-iso-basic = YYYYMMDDTHHMMSSZ (16 chars)
//   device-id     = 8 hex chars
//   nonce         = 4 hex chars
const NAME_RE = /^(\d{8}T\d{6}Z)__([0-9a-f]{8})__([0-9a-f]{4})\.md$/i;

export interface ParsedInboxName {
  filename: string;
  basename: string;     // without extension
  timestamp: string;    // YYYYMMDDTHHMMSSZ
  deviceId: string;     // lowercased
  nonce: string;        // lowercased
}

export function parseInboxName(name: string): ParsedInboxName | null {
  const m = NAME_RE.exec(name);
  if (!m) return null;
  const [, timestamp, deviceId, nonce] = m;
  return {
    filename: name,
    basename: `${timestamp}__${deviceId}__${nonce}`,
    timestamp,
    deviceId: deviceId.toLowerCase(),
    nonce: nonce.toLowerCase(),
  };
}

export type Frontmatter = Record<string, string | number | null>;

// Minimal flat-YAML frontmatter parser. The mobile spec only uses
// `key: value` pairs (no nesting, no lists), so we don't pull js-yaml in.
export function parseFrontmatter(raw: string): { frontmatter: Frontmatter; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  if (!m) return { frontmatter: {}, body: raw };
  const fm: Frontmatter = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line.trim());
    if (!kv) continue;
    const key = kv[1];
    let val: string | number | null = kv[2].trim();
    if (val === 'null' || val === '~' || val === '') val = null;
    else if (/^-?\d+$/.test(val)) val = parseInt(val, 10);
    fm[key] = val;
  }
  return { frontmatter: fm, body: m[2] };
}

export const VALID_CAPTURE_KINDS = new Set(['capture', 'kb-source']);

// Returns null if valid, else a human-readable error message describing why
// the frontmatter is invalid.
export function validateFrontmatter(fm: Frontmatter): string | null {
  const marker = fm['keel-capture'];
  if (marker !== 1 && marker !== '1') return 'missing or invalid keel-capture marker';
  const kind = fm.kind;
  if (typeof kind !== 'string' || !VALID_CAPTURE_KINDS.has(kind)) {
    return `unsupported kind: ${String(kind)}`;
  }
  return null;
}
