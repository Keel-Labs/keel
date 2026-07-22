import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as entitlements from '../pro/entitlements';
import * as entitlementStore from '../pro/entitlementStore';
import * as licenseValidator from '../pro/licenseValidator';
import type { EntitlementData } from '../../shared/types';

// Unmock entitlements for this test file so we test the real implementation
vi.unmock('../pro/entitlements');

describe('pro/entitlements', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getProStatus', () => {
    it('returns free status when no entitlement', async () => {
      vi.spyOn(entitlementStore, 'isActive').mockResolvedValue(false);

      const status = await entitlements.getProStatus();
      expect(status).toEqual({
        isPro: false,
        reason: 'no-active-entitlement',
      });
    });

    it('returns pro status with subscription details when active', async () => {
      const data: EntitlementData = {
        license_key: 'KEEL-TEST-1234',
        instance_id: 'test-instance',
        expires_at: Math.floor(Date.now() / 1000) + 100 * 24 * 60 * 60,
        cached_at: Math.floor(Date.now() / 1000),
        status: 'active',
        email: 'test@example.com',
      };

      vi.spyOn(entitlementStore, 'isActive').mockResolvedValue(true);
      vi.spyOn(entitlementStore, 'load').mockResolvedValue(data);

      const status = await entitlements.getProStatus();
      expect(status.isPro).toBe(true);
      expect(status.reason).toBe('active');
      expect(status.subscription).toEqual({
        tier: 'pro',
        expiresAt: data.expires_at * 1000,
        email: 'test@example.com',
      });
    });

    it('returns free status on error', async () => {
      vi.spyOn(entitlementStore, 'isActive').mockRejectedValue(new Error('Test error'));

      const status = await entitlements.getProStatus();
      expect(status.isPro).toBe(false);
    });
  });

  describe('activateProLicense', () => {
    it('returns success with subscription details on activation', async () => {
      const data: EntitlementData = {
        license_key: 'KEEL-TEST-1234',
        instance_id: 'test-instance',
        expires_at: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60,
        cached_at: Math.floor(Date.now() / 1000),
        status: 'active',
        email: 'user@example.com',
      };

      vi.spyOn(licenseValidator, 'activateLicense').mockResolvedValue(data);

      const result = await entitlements.activateProLicense('KEEL-TEST-1234', 'instance-1');
      expect(result.ok).toBe(true);
      expect(result.subscription).toEqual({
        email: 'user@example.com',
        expiresAt: data.expires_at * 1000,
      });
    });

    it('returns error on activation failure', async () => {
      vi.spyOn(licenseValidator, 'activateLicense').mockRejectedValue(new Error('Invalid key'));

      const result = await entitlements.activateProLicense('BAD-KEY', 'instance-1');
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('returns a friendly error when Lemon Squeezy cannot find the key', async () => {
      vi.spyOn(licenseValidator, 'activateLicense').mockRejectedValue(new Error('license_key not found.'));

      const result = await entitlements.activateProLicense('BAD-KEY', 'instance-1');
      expect(result).toEqual({
        ok: false,
        error: "We couldn't find that license key. Check the key from your Lemon Squeezy receipt and try again.",
      });
    });
  });

  describe('validateProLicense', () => {
    it('returns success on valid license', async () => {
      const data: EntitlementData = {
        license_key: 'KEEL-TEST-1234',
        instance_id: 'test-instance',
        expires_at: Math.floor(Date.now() / 1000) + 100 * 24 * 60 * 60,
        cached_at: Math.floor(Date.now() / 1000),
        status: 'active',
        email: 'test@example.com',
      };

      vi.spyOn(entitlementStore, 'load').mockResolvedValue(null);
      vi.spyOn(licenseValidator, 'validateLicense').mockResolvedValue(data);

      const result = await entitlements.validateProLicense('KEEL-TEST-1234', 'instance-1');
      expect(result.ok).toBe(true);
    });

    it('validates against the cached Lemon Squeezy instance after activation', async () => {
      const data: EntitlementData = {
        license_key: 'KEEL-TEST-1234',
        instance_id: 'lemon-instance-id',
        expires_at: Math.floor(Date.now() / 1000) + 100 * 24 * 60 * 60,
        cached_at: Math.floor(Date.now() / 1000),
        status: 'active',
        email: 'test@example.com',
      };

      vi.spyOn(entitlementStore, 'load').mockResolvedValue(data);
      const validateSpy = vi.spyOn(licenseValidator, 'validateLicense').mockResolvedValue(data);

      const result = await entitlements.validateProLicense('KEEL-TEST-1234', 'hostname-fallback');
      expect(result.ok).toBe(true);
      expect(validateSpy).toHaveBeenCalledWith('KEEL-TEST-1234', 'lemon-instance-id');
    });

    it('returns error on validation failure', async () => {
      vi.spyOn(entitlementStore, 'load').mockResolvedValue(null);
      vi.spyOn(licenseValidator, 'validateLicense').mockRejectedValue(new Error('Network error'));

      const result = await entitlements.validateProLicense('KEEL-TEST-1234', 'instance-1');
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.revoked).toBe(false);
    });

    it('revokes cached entitlement when Lemon Squeezy says the license expired', async () => {
      const data: EntitlementData = {
        license_key: 'KEEL-TEST-1234',
        instance_id: 'lemon-instance-id',
        expires_at: Math.floor(Date.now() / 1000) + 100 * 24 * 60 * 60,
        cached_at: Math.floor(Date.now() / 1000),
        status: 'active',
        email: 'test@example.com',
      };

      vi.spyOn(entitlementStore, 'load').mockResolvedValue(data);
      const clearSpy = vi.spyOn(entitlementStore, 'clear').mockResolvedValue();
      vi.spyOn(licenseValidator, 'validateLicense').mockRejectedValue(new Error('License is expired.'));

      const result = await entitlements.validateProLicense('KEEL-TEST-1234', 'hostname-fallback');
      expect(result.ok).toBe(false);
      expect(result.revoked).toBe(true);
      expect(clearSpy).toHaveBeenCalled();
    });

    it('revokes cached entitlement when Lemon Squeezy says the activation instance is gone', async () => {
      const data: EntitlementData = {
        license_key: 'KEEL-TEST-1234',
        instance_id: 'lemon-instance-id',
        expires_at: Math.floor(Date.now() / 1000) + 100 * 24 * 60 * 60,
        cached_at: Math.floor(Date.now() / 1000),
        status: 'active',
        email: 'test@example.com',
      };

      vi.spyOn(entitlementStore, 'load').mockResolvedValue(data);
      const clearSpy = vi.spyOn(entitlementStore, 'clear').mockResolvedValue();
      vi.spyOn(licenseValidator, 'validateLicense').mockRejectedValue(new Error('instance_id not found.'));

      const result = await entitlements.validateProLicense('KEEL-TEST-1234', 'hostname-fallback');
      expect(result).toEqual({
        ok: false,
        error: 'This Keel Pro activation is no longer valid. Activate again with an active license key.',
        revoked: true,
      });
      expect(clearSpy).toHaveBeenCalled();
    });

    it('keeps cached entitlement when validation fails for a network reason', async () => {
      const data: EntitlementData = {
        license_key: 'KEEL-TEST-1234',
        instance_id: 'lemon-instance-id',
        expires_at: Math.floor(Date.now() / 1000) + 100 * 24 * 60 * 60,
        cached_at: Math.floor(Date.now() / 1000),
        status: 'active',
        email: 'test@example.com',
      };

      vi.spyOn(entitlementStore, 'load').mockResolvedValue(data);
      const clearSpy = vi.spyOn(entitlementStore, 'clear').mockResolvedValue();
      vi.spyOn(licenseValidator, 'validateLicense').mockRejectedValue(new Error('fetch failed'));

      const result = await entitlements.validateProLicense('KEEL-TEST-1234', 'hostname-fallback');
      expect(result.ok).toBe(false);
      expect(result.revoked).toBe(false);
      expect(clearSpy).not.toHaveBeenCalled();
    });
  });

  describe('cancelProLicense', () => {
    it('clears entitlement and returns success', async () => {
      const clearSpy = vi.spyOn(entitlementStore, 'clear').mockResolvedValue();

      const result = await entitlements.cancelProLicense();
      expect(result.ok).toBe(true);
      expect(clearSpy).toHaveBeenCalled();
    });

    it('returns error on clear failure', async () => {
      vi.spyOn(entitlementStore, 'clear').mockRejectedValue(new Error('Cleanup failed'));

      const result = await entitlements.cancelProLicense();
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('canAccessFeature', () => {
    it('returns true when user is Pro', async () => {
      vi.spyOn(entitlementStore, 'isActive').mockResolvedValue(true);
      const data: EntitlementData = {
        license_key: 'KEEL-TEST-1234',
        instance_id: 'test-instance',
        expires_at: Math.floor(Date.now() / 1000) + 100 * 24 * 60 * 60,
        cached_at: Math.floor(Date.now() / 1000),
        status: 'active',
        email: 'test@example.com',
      };
      vi.spyOn(entitlementStore, 'load').mockResolvedValue(data);

      const result = await entitlements.canAccessFeature('model-of-you');
      expect(result).toBe(true);
    });

    it('returns false when user is free', async () => {
      vi.spyOn(entitlementStore, 'isActive').mockResolvedValue(false);

      const result = await entitlements.canAccessFeature('model-of-you');
      expect(result).toBe(false);
    });
  });
});
