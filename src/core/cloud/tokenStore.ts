// Encrypted JWT storage for the Keel Cloud sign-in session.
//
// The Supabase access token (a JWT) and refresh token are sensitive
// — anyone with them can act as the user against the cloud API.
// Persisting them across app launches needs encryption-at-rest, not
// just a plain JSON file under userData.
//
// Electron's safeStorage uses the OS-native secrets backend
// (Keychain on macOS, Credential Manager on Windows, libsecret on
// Linux) via the user's login session. So:
//   - Tokens are encrypted with a key only this OS user can use.
//   - A file on disk with the encrypted blob is useless to anyone
//     who steals it but can't unlock the user's keychain.
//
// The token file lives at <userData>/cloud-session.dat. We use
// userData (not the workspace) so the file follows the OS user
// account, not the workspace folder — the workspace may be on iCloud
// and we explicitly do not want session tokens replicated there.

import { app, safeStorage } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

export interface CloudSession {
  accessToken: string;
  refreshToken: string;
  email: string;
  // ms since epoch — when the access token expires. We don't refresh
  // automatically yet (v0.1); on 401 the user re-signs in.
  expiresAt: number;
}

function tokenFilePath(): string {
  return path.join(app.getPath('userData'), 'cloud-session.dat');
}

export function save(session: CloudSession): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error(
      'OS encryption is not available — refusing to write the cloud session to disk in plaintext.'
    );
  }
  const blob = safeStorage.encryptString(JSON.stringify(session));
  fs.writeFileSync(tokenFilePath(), blob);
}

export function load(): CloudSession | null {
  const filePath = tokenFilePath();
  if (!fs.existsSync(filePath)) return null;
  if (!safeStorage.isEncryptionAvailable()) return null;
  try {
    const blob = fs.readFileSync(filePath);
    const json = safeStorage.decryptString(blob);
    return JSON.parse(json) as CloudSession;
  } catch {
    // Corrupted blob, OS keychain change, etc. — drop the file so the
    // user re-signs-in next chance.
    try { fs.unlinkSync(filePath); } catch { /* ignore */ }
    return null;
  }
}

export function clear(): void {
  try { fs.unlinkSync(tokenFilePath()); } catch { /* ignore — already gone */ }
}

export function hasValidSession(): boolean {
  const s = load();
  if (!s) return false;
  // Keep the session usable until it expires; we'll handle 401 by
  // signing the user out (v0.1: add refresh-token flow).
  return s.expiresAt > Date.now();
}
