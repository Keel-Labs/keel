/**
 * API client shim — desktop-only (Electron IPC).
 *
 * All operations go through the preload bridge at window.keel.
 * See specs/cloud-mobile-architecture.md for the former HTTP implementation.
 */

import type { KeelAPI } from '../shared/types';

export function getKeelAPI(): KeelAPI {
  return (window as any).keel;
}
