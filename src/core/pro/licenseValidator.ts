import type { EntitlementData } from '../../shared/types';
import * as entitlementStore from './entitlementStore';

/**
 * Manages license validation against LemonSqueezy API.
 * Supports offline fallback using local cache.
 */

// LemonSqueezy License API configuration.
const LEMONSQUEEZY_API_BASE = 'https://api.lemonsqueezy.com/v1';
const DEFAULT_PRO_VARIANT_IDS = ['1934811', '1934821'];

class LicenseValidationError extends Error {}

/**
 * Response type from LemonSqueezy /licenses/activate endpoint.
 */
interface LemonSqueezyActivateResponse {
  activated: boolean;
  error: string | null;
  license_key: {
    id: number;
    key: string;
    status: string;
    activation_limit: number | null;
    activation_usage: number;
    expires_at: string | null;
  };
  instance: {
    id: string;
    name: string;
  };
  meta?: LemonSqueezyLicenseMeta;
}

/**
 * Response type from LemonSqueezy /licenses/validate endpoint.
 */
interface LemonSqueezyValidateResponse {
  valid: boolean;
  error: string | null;
  license_key: {
    id: number;
    key: string;
    status: string;
    activation_limit: number | null;
    activation_usage: number;
    expires_at: string | null;
  };
  instance?: {
    id: string;
    name: string;
  } | null;
  meta?: LemonSqueezyLicenseMeta;
}

interface LemonSqueezyLicenseMeta {
  store_id?: number;
  product_id?: number;
  product_name?: string;
  variant_id?: number;
  variant_name?: string;
  customer_email?: string;
  customer_name?: string;
}

/**
 * Activate a license key with LemonSqueezy.
 * Returns EntitlementData on success, throws on error.
 */
export async function activateLicense(licenseKey: string, instanceId: string): Promise<EntitlementData> {
  const response = await postLicenseApi<LemonSqueezyActivateResponse>('/licenses/activate', {
    license_key: licenseKey,
    instance_name: instanceId,
  });

  if (!response.activated || response.error) {
    throw new LicenseValidationError(response.error || 'License activation failed.');
  }

  assertExpectedProduct(response.meta);

  const data = toEntitlementData(
    response.license_key,
    response.instance.id,
    response.meta,
  );

  await entitlementStore.save(data);
  return data;
}

/**
 * Validate a license key with LemonSqueezy (refresh).
 * Falls back to local cache only when the License API cannot be reached.
 * Returns EntitlementData on success, throws on error.
 */
export async function validateLicense(licenseKey: string, instanceId: string): Promise<EntitlementData> {
  try {
    const response = await postLicenseApi<LemonSqueezyValidateResponse>('/licenses/validate', {
      license_key: licenseKey,
      instance_id: instanceId,
    });

    if (!response.valid || response.error) {
      throw new LicenseValidationError(response.error || 'License validation failed.');
    }

    assertExpectedProduct(response.meta);

    const data = toEntitlementData(
      response.license_key,
      response.instance?.id || instanceId,
      response.meta,
    );

    await entitlementStore.save(data);
    return data;
  } catch (err) {
    if (err instanceof LicenseValidationError) {
      throw err;
    }

    console.error('[pro/licenseValidator] Validation failed, checking cache:', err);
    const cached = await entitlementStore.load();
    if (cached) {
      return cached;
    }
    throw new Error(`License validation failed and no cache available: ${err}`);
  }
}

async function postLicenseApi<T>(
  endpoint: '/licenses/activate' | '/licenses/validate',
  body: Record<string, string>,
): Promise<T> {
  const response = await fetch(`${LEMONSQUEEZY_API_BASE}${endpoint}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(body),
  });

  const payload = await response.json().catch(() => null) as ({ error?: string } | null);
  if (!response.ok) {
    throw new LicenseValidationError(
      payload?.error || `Lemon Squeezy License API error: ${response.status} ${response.statusText}`,
    );
  }

  return payload as T;
}

function toEntitlementData(
  license: {
    status: string;
    key: string;
    expires_at: string | null;
  },
  instanceId: string,
  meta?: LemonSqueezyLicenseMeta,
): EntitlementData {
  const status = normalizeStatus(license.status);
  if (status !== 'active') {
    throw new LicenseValidationError(`License is ${license.status}.`);
  }

  return {
    license_key: license.key,
    instance_id: instanceId,
    expires_at: parseExpiry(license.expires_at),
    cached_at: Math.floor(Date.now() / 1000),
    status,
    email: meta?.customer_email || '',
  };
}

function assertExpectedProduct(meta?: LemonSqueezyLicenseMeta) {
  if (!meta) return;

  const proStoreId = process.env.KEEL_PRO_LEMONSQUEEZY_STORE_ID || '';
  const proProductIds = parseCsv(process.env.KEEL_PRO_LEMONSQUEEZY_PRODUCT_IDS || '');
  const proVariantIds = parseCsv(
    process.env.KEEL_PRO_LEMONSQUEEZY_VARIANT_IDS || DEFAULT_PRO_VARIANT_IDS.join(','),
  );

  if (proStoreId && String(meta.store_id) !== proStoreId) {
    throw new LicenseValidationError('License key is not for this Lemon Squeezy store.');
  }

  if (proProductIds.length > 0 && !proProductIds.includes(String(meta.product_id))) {
    throw new LicenseValidationError('License key is not for Keel Pro.');
  }

  if (proVariantIds.length > 0 && !proVariantIds.includes(String(meta.variant_id))) {
    throw new LicenseValidationError('License key is not for an active Keel Pro plan.');
  }
}

function parseExpiry(expiresAt: string | null): number {
  if (!expiresAt) {
    // Subscription licenses can be perpetual from the key's perspective while
    // Lemon Squeezy controls validity through status on subsequent validations.
    return 4102444800; // 2100-01-01
  }

  const parsed = Date.parse(expiresAt);
  if (Number.isNaN(parsed)) {
    throw new LicenseValidationError('License expiry date is invalid.');
  }
  return Math.floor(parsed / 1000);
}

function normalizeStatus(status: string): EntitlementData['status'] {
  if (status === 'active' || status === 'inactive' || status === 'expired') {
    return status;
  }
  return 'inactive';
}

function parseCsv(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}
