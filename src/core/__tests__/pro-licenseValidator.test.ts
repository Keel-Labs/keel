import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as entitlementStore from '../pro/entitlementStore';
import * as licenseValidator from '../pro/licenseValidator';
import type { EntitlementData } from '../../shared/types';

vi.unmock('../pro/licenseValidator');

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status || 200,
    statusText: init.statusText,
    headers: { 'Content-Type': 'application/json' },
  });
}

function activeLicenseResponse(overrides: Record<string, unknown> = {}) {
  return {
    activated: true,
    error: null,
    license_key: {
      id: 123,
      key: 'live-license-key',
      status: 'active',
      activation_limit: 2,
      activation_usage: 1,
      expires_at: '2027-07-21T12:00:00.000000Z',
    },
    instance: {
      id: 'instance-from-lemon',
      name: 'Medhas-MacBook',
    },
    meta: {
      store_id: 77,
      product_id: 88,
      product_name: 'Keel Pro',
      variant_id: 1934811,
      variant_name: 'Annual',
      customer_email: 'buyer@example.com',
    },
    ...overrides,
  };
}

describe('pro/licenseValidator', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(entitlementStore, 'save').mockResolvedValue();
    vi.spyOn(entitlementStore, 'load').mockResolvedValue(null);
    delete process.env.KEEL_PRO_LEMONSQUEEZY_STORE_ID;
    delete process.env.KEEL_PRO_LEMONSQUEEZY_PRODUCT_IDS;
    delete process.env.KEEL_PRO_LEMONSQUEEZY_VARIANT_IDS;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('activates a live Lemon Squeezy license and caches the entitlement', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(activeLicenseResponse()));
    vi.stubGlobal('fetch', fetchMock);

    const entitlement = await licenseValidator.activateLicense('live-license-key', 'Medhas-MacBook');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.lemonsqueezy.com/v1/licenses/activate',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        }),
        body: expect.any(URLSearchParams),
      }),
    );
    expect(entitlement).toEqual({
      license_key: 'live-license-key',
      instance_id: 'instance-from-lemon',
      expires_at: 1816171200,
      cached_at: expect.any(Number),
      status: 'active',
      email: 'buyer@example.com',
    });
    expect(entitlementStore.save).toHaveBeenCalledWith(entitlement);
  });

  it('rejects inactive or expired licenses instead of caching them', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(activeLicenseResponse({
      activated: false,
      error: 'This license key has expired.',
    })));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      licenseValidator.activateLicense('expired-key', 'Medhas-MacBook'),
    ).rejects.toThrow('This license key has expired.');
    expect(entitlementStore.save).not.toHaveBeenCalled();
  });

  it('does not use offline cache when Lemon Squeezy says a key is invalid', async () => {
    const cached: EntitlementData = {
      license_key: 'old-key',
      instance_id: 'old-instance',
      expires_at: 1816171200,
      cached_at: Math.floor(Date.now() / 1000),
      status: 'active',
      email: 'buyer@example.com',
    };
    vi.mocked(entitlementStore.load).mockResolvedValue(cached);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      valid: false,
      error: 'This license key has been disabled.',
      license_key: {
        id: 123,
        key: 'old-key',
        status: 'disabled',
        activation_limit: 2,
        activation_usage: 1,
        expires_at: null,
      },
    })));

    await expect(
      licenseValidator.validateLicense('old-key', 'old-instance'),
    ).rejects.toThrow('This license key has been disabled.');
  });

  it('falls back to cached entitlement when validation cannot reach Lemon Squeezy', async () => {
    const cached: EntitlementData = {
      license_key: 'cached-key',
      instance_id: 'cached-instance',
      expires_at: 1816171200,
      cached_at: Math.floor(Date.now() / 1000),
      status: 'active',
      email: 'buyer@example.com',
    };
    vi.mocked(entitlementStore.load).mockResolvedValue(cached);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    await expect(
      licenseValidator.validateLicense('cached-key', 'cached-instance'),
    ).resolves.toEqual(cached);
  });

  it('enforces the baked-in live Keel Pro variant IDs', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(activeLicenseResponse({
      meta: {
        store_id: 77,
        product_id: 88,
        product_name: 'Keel Pro',
        variant_id: 99,
        variant_name: 'Old test variant',
        customer_email: 'buyer@example.com',
      },
    }))));

    await expect(
      licenseValidator.activateLicense('live-license-key', 'Medhas-MacBook'),
    ).rejects.toThrow('License key is not for an active Keel Pro plan.');
    expect(entitlementStore.save).not.toHaveBeenCalled();
  });

  it('lets env-configured variant IDs override the baked-in defaults', async () => {
    process.env.KEEL_PRO_LEMONSQUEEZY_VARIANT_IDS = '100,101';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(activeLicenseResponse())));

    await expect(
      licenseValidator.activateLicense('live-license-key', 'Medhas-MacBook'),
    ).rejects.toThrow('License key is not for an active Keel Pro plan.');
    expect(entitlementStore.save).not.toHaveBeenCalled();
  });
});
