import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { EntitlementData } from '../../shared/types';
import * as entitlementStore from '../pro/entitlementStore';

describe('entitlementStore', () => {
  let testDir: string;

  beforeEach(async () => {
    // Create a temp directory for this test.
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-pro-'));
  });

  afterEach(async () => {
    // Cleanup.
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (err) {
      // Ignore cleanup errors.
    }
  });

  describe('load', () => {
    it('returns null when file does not exist', async () => {
      const result = await entitlementStore.load(testDir);
      expect(result).toBeNull();
    });

    it('loads and parses a valid entitlement file', async () => {
      const data: EntitlementData = {
        license_key: 'KEEL-TEST-1234-5678-9012',
        instance_id: 'test-instance',
        expires_at: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60,
        cached_at: Math.floor(Date.now() / 1000),
        status: 'active',
        email: 'test@example.com',
      };

      // Manually write the file.
      const filePath = path.join(testDir, 'entitlement.json');
      await fs.writeFile(filePath, JSON.stringify(data));

      const result = await entitlementStore.load(testDir);
      expect(result).toEqual(data);
    });

    it('returns null on parse error', async () => {
      const filePath = path.join(testDir, 'entitlement.json');
      await fs.writeFile(filePath, 'not valid json {]');
      const result = await entitlementStore.load(testDir);
      expect(result).toBeNull();
    });
  });

  describe('save', () => {
    it('saves entitlement data to file', async () => {
      const data: EntitlementData = {
        license_key: 'KEEL-TEST-1234',
        instance_id: 'test-instance',
        expires_at: Math.floor(Date.now() / 1000) + 100 * 24 * 60 * 60,
        cached_at: Math.floor(Date.now() / 1000),
        status: 'active',
        email: 'test@example.com',
      };

      await entitlementStore.save(data, testDir);

      const filePath = path.join(testDir, 'entitlement.json');
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(fileContent);

      expect(parsed).toEqual(data);
    });

    it('creates the app data directory if it does not exist', async () => {
      const nonExistentDir = path.join(testDir, 'sub', 'dir');
      const data: EntitlementData = {
        license_key: 'KEEL-TEST-1234',
        instance_id: 'test-instance',
        expires_at: Math.floor(Date.now() / 1000) + 100 * 24 * 60 * 60,
        cached_at: Math.floor(Date.now() / 1000),
        status: 'active',
        email: 'test@example.com',
      };

      await entitlementStore.save(data, nonExistentDir);

      // Verify directory was created and file exists.
      const filePath = path.join(nonExistentDir, 'entitlement.json');
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(fileContent);

      expect(parsed).toEqual(data);
    });
  });

  describe('isActive', () => {
    it('returns false when no entitlement exists', async () => {
      const result = await entitlementStore.isActive(testDir);
      expect(result).toBe(false);
    });

    it('returns true when entitlement is valid and active', async () => {
      const futureTime = Math.floor(Date.now() / 1000) + 100 * 24 * 60 * 60;
      const data: EntitlementData = {
        license_key: 'KEEL-TEST-1234',
        instance_id: 'test-instance',
        expires_at: futureTime,
        cached_at: Math.floor(Date.now() / 1000),
        status: 'active',
        email: 'test@example.com',
      };

      await entitlementStore.save(data, testDir);

      const result = await entitlementStore.isActive(testDir);
      expect(result).toBe(true);
    });

    it('returns false when entitlement is expired', async () => {
      const pastTime = Math.floor(Date.now() / 1000) - 100 * 24 * 60 * 60;
      const data: EntitlementData = {
        license_key: 'KEEL-TEST-1234',
        instance_id: 'test-instance',
        expires_at: pastTime,
        cached_at: Math.floor(Date.now() / 1000),
        status: 'active',
        email: 'test@example.com',
      };

      await entitlementStore.save(data, testDir);

      const result = await entitlementStore.isActive(testDir);
      expect(result).toBe(false);
    });

    it('returns false when status is not active', async () => {
      const futureTime = Math.floor(Date.now() / 1000) + 100 * 24 * 60 * 60;
      const data: EntitlementData = {
        license_key: 'KEEL-TEST-1234',
        instance_id: 'test-instance',
        expires_at: futureTime,
        cached_at: Math.floor(Date.now() / 1000),
        status: 'inactive',
        email: 'test@example.com',
      };

      await entitlementStore.save(data, testDir);

      const result = await entitlementStore.isActive(testDir);
      expect(result).toBe(false);
    });

    it('returns false when cache is older than 7 days', async () => {
      const futureTime = Math.floor(Date.now() / 1000) + 100 * 24 * 60 * 60;
      const eightDaysAgo = Math.floor(Date.now() / 1000) - 8 * 24 * 60 * 60;
      const data: EntitlementData = {
        license_key: 'KEEL-TEST-1234',
        instance_id: 'test-instance',
        expires_at: futureTime,
        cached_at: eightDaysAgo,
        status: 'active',
        email: 'test@example.com',
      };

      await entitlementStore.save(data, testDir);

      const result = await entitlementStore.isActive(testDir);
      expect(result).toBe(false);
    });
  });

  describe('clear', () => {
    it('removes the entitlement file', async () => {
      const data: EntitlementData = {
        license_key: 'KEEL-TEST-1234',
        instance_id: 'test-instance',
        expires_at: Math.floor(Date.now() / 1000) + 100 * 24 * 60 * 60,
        cached_at: Math.floor(Date.now() / 1000),
        status: 'active',
        email: 'test@example.com',
      };

      await entitlementStore.save(data, testDir);

      // Verify file exists.
      const filePath = path.join(testDir, 'entitlement.json');
      await expect(fs.stat(filePath)).resolves.toBeDefined();

      // Clear and verify it's gone.
      await entitlementStore.clear(testDir);
      await expect(fs.stat(filePath)).rejects.toThrow();
    });

    it('does not throw when file does not exist', async () => {
      await expect(entitlementStore.clear(testDir)).resolves.not.toThrow();
    });
  });
});
