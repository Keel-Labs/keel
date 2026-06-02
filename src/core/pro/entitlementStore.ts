import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { EntitlementData } from '../../shared/types';

/**
 * Manages local entitlement cache for Pro tier.
 * Stores at ~/Library/Application Support/Keel/entitlement.json (or platform-specific equivalent).
 * Used for offline-grace (7-day) support when network is unavailable.
 */

const ENTITLEMENT_FILENAME = 'entitlement.json';

/**
 * Get the app data directory (for testing or diagnostics).
 */
export function getDir(): string {
  const platform = process.platform;
  if (platform === 'darwin') {
    // macOS: ~/Library/Application Support/Keel
    return path.join(os.homedir(), 'Library', 'Application Support', 'Keel');
  } else if (platform === 'win32') {
    // Windows: %APPDATA%/Keel
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appData, 'Keel');
  } else {
    // Linux: ~/.config/Keel
    return path.join(os.homedir(), '.config', 'Keel');
  }
}

function getEntitlementPath(customDir?: string): string {
  const dir = customDir || getDir();
  return path.join(dir, ENTITLEMENT_FILENAME);
}

/**
 * Load entitlement data from local cache.
 * Returns null if file doesn't exist or is unparseable.
 * Optionally pass a custom directory for testing.
 */
export async function load(customDir?: string): Promise<EntitlementData | null> {
  try {
    const filePath = getEntitlementPath(customDir);
    const content = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(content) as EntitlementData;
    return data;
  } catch (err) {
    // File not found, parse error, or I/O error — treat as no entitlement.
    return null;
  }
}

/**
 * Save entitlement data to local cache.
 * Creates the app data directory if it doesn't exist.
 * Optionally pass a custom directory for testing.
 */
export async function save(data: EntitlementData, customDir?: string): Promise<void> {
  try {
    const dir = customDir || getDir();
    // Ensure the directory exists.
    await fs.mkdir(dir, { recursive: true });

    const filePath = getEntitlementPath(customDir);
    const content = JSON.stringify(data, null, 2);
    await fs.writeFile(filePath, content, 'utf-8');
  } catch (err) {
    // Log but don't throw — offline cache is best-effort.
    console.error('[pro/entitlementStore] Failed to save entitlement:', err);
  }
}

/**
 * Check if the cached entitlement is currently active.
 * Returns false if:
 *  - No cached entitlement
 *  - Entitlement has expired (expires_at < now)
 *  - Entitlement status is not 'active'
 *  - Cache is older than 7 days (offline grace period)
 * Optionally pass a custom directory for testing.
 */
export async function isActive(customDir?: string): Promise<boolean> {
  const data = await load(customDir);
  if (!data) return false;

  const now = Date.now();
  const expiresAt = data.expires_at * 1000; // Convert from seconds to ms

  // Check expiry.
  if (now > expiresAt) return false;

  // Check status.
  if (data.status !== 'active') return false;

  // Check offline-grace period (7 days).
  const maxCacheAgeMs = 7 * 24 * 60 * 60 * 1000;
  const cachedAtMs = data.cached_at * 1000;
  if (now - cachedAtMs > maxCacheAgeMs) return false;

  return true;
}

/**
 * Clear the cached entitlement (on cancellation or sign-out).
 * Optionally pass a custom directory for testing.
 */
export async function clear(customDir?: string): Promise<void> {
  try {
    const filePath = getEntitlementPath(customDir);
    await fs.unlink(filePath);
  } catch (err) {
    // File may not exist; that's fine.
  }
}
