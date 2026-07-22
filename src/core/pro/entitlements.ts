import type { ProStatus } from '../../shared/types';
import * as entitlementStore from './entitlementStore';
import * as licenseValidator from './licenseValidator';

/**
 * Public Pro entitlement API.
 * Used by Week 7 gating and all Pro-gated features.
 */

/**
 * Get the current Pro status for the user.
 * Checks cached entitlement; performs validation if a cached key exists.
 */
export async function getProStatus(): Promise<ProStatus> {
  try {
    const isActive = await entitlementStore.isActive();

    if (isActive) {
      const cached = await entitlementStore.load();
      if (cached) {
        return {
          isPro: true,
          reason: 'active',
          subscription: {
            tier: 'pro',
            expiresAt: cached.expires_at * 1000, // Convert to ms
            email: cached.email,
          },
        };
      }
    }
  } catch (err) {
    console.error('[pro/entitlements] Error checking Pro status:', err);
  }

  // Fallback: free tier.
  return { isPro: false, reason: 'no-active-entitlement' };
}

/**
 * Activate a Pro license.
 * Calls LemonSqueezy to validate the key and caches the result locally.
 */
export async function activateProLicense(licenseKey: string, instanceId: string): Promise<{ ok: boolean; error?: string; subscription?: { email: string; expiresAt: number } }> {
  try {
    const entitlement = await licenseValidator.activateLicense(licenseKey, instanceId);
    return {
      ok: true,
      subscription: {
        email: entitlement.email,
        expiresAt: entitlement.expires_at * 1000, // Convert to ms
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: formatLicenseError(err),
    };
  }
}

/**
 * Validate/refresh the cached Pro license.
 * Called periodically (e.g., on app launch) to check if entitlement is still valid.
 */
export async function validateProLicense(licenseKey: string, instanceId: string): Promise<{ ok: boolean; error?: string; revoked?: boolean }> {
  try {
    const cached = await entitlementStore.load();
    await licenseValidator.validateLicense(licenseKey, cached?.instance_id || instanceId);
    return { ok: true };
  } catch (err) {
    const revoked = isDefinitiveLicenseRejection(err);
    if (revoked) {
      await entitlementStore.clear();
    }

    return {
      ok: false,
      error: formatLicenseError(err),
      revoked,
    };
  }
}

/**
 * Cancel/revoke the Pro entitlement.
 * Clears the local cache so the user is treated as free-tier.
 */
export async function cancelProLicense(): Promise<{ ok: boolean; error?: string }> {
  try {
    await entitlementStore.clear();
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: `${err}`,
    };
  }
}

function formatLicenseError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const normalized = message.toLowerCase();

  if (normalized.includes('license_key not found') || normalized.includes('license key not found')) {
    return "We couldn't find that license key. Check the key from your Lemon Squeezy receipt and try again.";
  }

  if (normalized.includes('instance_id not found') || normalized.includes('license instance not found')) {
    return 'This Keel Pro activation is no longer valid. Activate again with an active license key.';
  }

  if (normalized.includes('activation limit')) {
    return 'This license key has reached its activation limit.';
  }

  if (normalized.includes('expired')) {
    return 'This license key has expired.';
  }

  if (normalized.includes('disabled') || normalized.includes('inactive')) {
    return 'This license key is not active.';
  }

  if (normalized.includes('not for')) {
    return message;
  }

  return 'Could not verify that license key. Check it and try again.';
}

function isDefinitiveLicenseRejection(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  const normalized = message.toLowerCase();

  return (
    normalized.includes('license_key not found') ||
    normalized.includes('license key not found') ||
    normalized.includes('instance_id not found') ||
    normalized.includes('license instance not found') ||
    normalized.includes('expired') ||
    normalized.includes('disabled') ||
    normalized.includes('inactive') ||
    normalized.includes('not active') ||
    normalized.includes('not for')
  );
}

/**
 * Check if a specific Pro feature is accessible.
 * Can be used for granular feature gating if needed in the future.
 */
export async function canAccessFeature(feature: string): Promise<boolean> {
  const status = await getProStatus();
  // For now, all Pro features require Pro status.
  return status.isPro;
}
