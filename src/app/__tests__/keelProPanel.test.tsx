import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import KeelProPanel from '../components/KeelProPanel';
import type { ProStatus } from '../../shared/types';

// Mock window.keel
const mockProStatus = vi.fn();
const mockProActivate = vi.fn();
const mockProCancel = vi.fn();
const mockOnProStatusChanged = vi.fn();

Object.defineProperty(window, 'keel', {
  value: {
    proStatus: mockProStatus,
    proActivate: mockProActivate,
    proCancel: mockProCancel,
    onProStatusChanged: mockOnProStatusChanged,
  },
  writable: true,
});

describe('KeelProPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: free status
    mockProStatus.mockResolvedValue({
      isPro: false,
      reason: 'no-active-entitlement',
    } as ProStatus);
    mockOnProStatusChanged.mockReturnValue(() => {});
  });

  it('renders upgrade button when user is free', async () => {
    render(<KeelProPanel />);
    await waitFor(() => {
      expect(screen.getByText(/Upgrade to Pro/i)).toBeInTheDocument();
    });
  });

  it('opens Pro pricing page when upgrade button is clicked', async () => {
    const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<KeelProPanel />);
    await waitFor(() => {
      const button = screen.getByText(/Upgrade to Pro/i);
      fireEvent.click(button);
      expect(windowOpenSpy).toHaveBeenCalledWith(
        'https://keel-labs.org/pro',
        '_blank'
      );
    });
  });

  it('shows Pro status when user is subscribed', async () => {
    mockProStatus.mockResolvedValue({
      isPro: true,
      subscription: {
        tier: 'pro',
        email: 'test@example.com',
        expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
      },
    } as ProStatus);

    render(<KeelProPanel />);
    await waitFor(() => {
      expect(screen.getByText('test@example.com')).toBeInTheDocument();
      expect(screen.getByText(/Active/i)).toBeInTheDocument();
    });
  });

  it('activates Pro with license key', async () => {
    mockProActivate.mockResolvedValue({
      ok: true,
      subscription: {
        email: 'user@example.com',
        expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000,
      },
    });

    render(<KeelProPanel />);

    await waitFor(() => {
      const input = screen.getByPlaceholderText(/KEEL-/i) as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'KEEL-TEST-KEY' } });
    });

    const button = screen.getByText(/Verify & Activate/i);
    fireEvent.click(button);

    await waitFor(() => {
      expect(mockProActivate).toHaveBeenCalledWith('KEEL-TEST-KEY');
    });
  });

  it('shows error message on activation failure', async () => {
    mockProActivate.mockResolvedValue({
      ok: false,
      error: 'Invalid license key',
    });

    render(<KeelProPanel />);

    await waitFor(() => {
      const input = screen.getByPlaceholderText(/KEEL-/i) as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'BAD-KEY' } });
    });

    const button = screen.getByText(/Verify & Activate/i);
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText(/Invalid license key/i)).toBeInTheDocument();
    });
  });

  it('subscribes to Pro status changes', async () => {
    let statusCallback: ((status: ProStatus) => void) | null = null;
    mockOnProStatusChanged.mockImplementation((cb) => {
      statusCallback = cb;
      return () => {};
    });

    render(<KeelProPanel />);

    await waitFor(() => {
      expect(mockOnProStatusChanged).toHaveBeenCalled();
    });

    // Simulate Pro status change
    if (statusCallback) {
      statusCallback({
        isPro: true,
        subscription: {
          tier: 'pro',
          email: 'new@example.com',
        },
      } as ProStatus);
    }

    await waitFor(() => {
      expect(screen.getByText('new@example.com')).toBeInTheDocument();
    });
  });
});
