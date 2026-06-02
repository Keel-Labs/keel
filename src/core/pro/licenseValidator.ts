import type { EntitlementData } from '../../shared/types';
import * as entitlementStore from './entitlementStore';

/**
 * Manages license validation against LemonSqueezy API.
 * Supports offline fallback using local cache.
 */

// LemonSqueezy API configuration.
const LEMONSQUEEZY_API_BASE = 'https://api.lemonsqueezy.com/v1';

// For testing: sandbox environment (can be overridden by env var).
const LEMONSQUEEZY_API_KEY = process.env.LEMONSQUEEZY_API_KEY || '';

/**
 * Response type from LemonSqueezy /licenses/activate endpoint.
 */
interface LemonSqueezyActivateResponse {
  license_key: {
    id: string;
    key: string;
    status: string;
    expires_at: string | null;
  };
  license: {
    id: string;
    status: string;
    email: string;
    expires_at: string | null;
  };
  activated: boolean;
  instance: {
    id: string;
    name: string;
  };
  error?: string;
  message?: string;
}

/**
 * Response type from LemonSqueezy /licenses/validate endpoint.
 */
interface LemonSqueezyValidateResponse {
  valid: boolean;
  license: {
    status: string;
    email: string;
    expires_at: string | null;
  };
  error?: string;
  message?: string;
}

/**
 * Activate a license key with LemonSqueezy.
 * Returns EntitlementData on success, throws on error.
 */
export async function activateLicense(licenseKey: string, instanceId: string): Promise<EntitlementData> {
  // For now, return a mock response until LS account is set up.
  // TODO: Replace with real LS API call once keys are available.
  console.log('[pro/licenseValidator] Activating license (mock)', { licenseKey, instanceId });

  // Mock response: 1 year from now.
  const expiresAt = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60;
  const data: EntitlementData = {
    license_key: licenseKey,
    instance_id: instanceId,
    expires_at: expiresAt,
    cached_at: Math.floor(Date.now() / 1000),
    status: 'active',
    email: 'user@example.com',
  };

  // Cache locally.
  await entitlementStore.save(data);

  return data;
}

/**
 * Validate a license key with LemonSqueezy (refresh).
 * Falls back to local cache if network is unavailable.
 * Returns EntitlementData on success, throws on error.
 */
export async function validateLicense(licenseKey: string, instanceId: string): Promise<EntitlementData> {
  try {
    // For now, return a mock response until LS account is set up.
    // TODO: Replace with real LS API call once keys are available.
    console.log('[pro/licenseValidator] Validating license (mock)', { licenseKey, instanceId });

    // Mock response: 1 year from now.
    const expiresAt = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60;
    const data: EntitlementData = {
      license_key: licenseKey,
      instance_id: instanceId,
      expires_at: expiresAt,
      cached_at: Math.floor(Date.now() / 1000),
      status: 'active',
      email: 'user@example.com',
    };

    // Cache locally.
    await entitlementStore.save(data);

    return data;
  } catch (err) {
    // Network error or validation failure. Fall back to cache.
    console.error('[pro/licenseValidator] Validation failed, checking cache:', err);
    const cached = await entitlementStore.load();
    if (cached) {
      return cached;
    }
    throw new Error(`License validation failed and no cache available: ${err}`);
  }
}

/**
 * Utility: Make a call to LemonSqueezy API.
 * TODO: Implement this when API keys are available.
 */
async function callLemonSqueezy(
  endpoint: string,
  method: 'GET' | 'POST' = 'GET',
  body?: Record<string, unknown>
): Promise<unknown> {
  if (!LEMONSQUEEZY_API_KEY) {
    throw new Error('LEMONSQUEEZY_API_KEY not configured');
  }

  const url = `${LEMONSQUEEZY_API_BASE}${endpoint}`;
  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${LEMONSQUEEZY_API_KEY}`,
    },
  };

  if (body && method !== 'GET') {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`LS API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}
