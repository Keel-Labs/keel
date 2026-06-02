import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import ProBriefDashboard from '../components/ProBriefDashboard';
import type { ProStatus, FileEntry } from '../../shared/types';

// Mock window.keel
const mockProStatus = vi.fn();
const mockListFiles = vi.fn();
const mockReadFile = vi.fn();
const mockOnMemoryUpdated = vi.fn();

Object.defineProperty(window, 'keel', {
  value: {
    proStatus: mockProStatus,
    listFiles: mockListFiles,
    readFile: mockReadFile,
    onMemoryUpdated: mockOnMemoryUpdated,
  },
  writable: true,
});

describe('ProBriefDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOnMemoryUpdated.mockReturnValue(() => {});
  });

  it('shows upsell teaser for free users', async () => {
    mockProStatus.mockResolvedValue({
      isPro: false,
      reason: 'no-active-entitlement',
    } as ProStatus);

    render(<ProBriefDashboard />);

    await waitFor(() => {
      expect(
        screen.getByText(/Upgrade to Pro for daily briefings/i)
      ).toBeInTheDocument();
      expect(screen.getByText(/Upgrade to Pro/i)).toBeInTheDocument();
    });
  });

  it('loads and displays briefs for Pro users', async () => {
    mockProStatus.mockResolvedValue({
      isPro: true,
      subscription: { tier: 'pro' },
    } as ProStatus);

    const mockFiles: FileEntry[] = [
      {
        name: '2026-06-02.md',
        path: 'daily-log/2026-06-02.md',
        isDirectory: false,
        updatedAt: Date.now(),
      },
      {
        name: '2026-06-01.md',
        path: 'daily-log/2026-06-01.md',
        isDirectory: false,
        updatedAt: Date.now() - 86400000,
      },
    ];

    mockListFiles.mockResolvedValue(mockFiles);
    mockReadFile.mockResolvedValue(`
# Daily Log

## Morning Brief

### Top Priorities
- Finish Pro launch
- Review model-of-you

### Suggested Focus Blocks
- 9-11am: Deep work
- 2-4pm: Meetings
    `);

    render(<ProBriefDashboard />);

    await waitFor(() => {
      expect(screen.getByText(/Daily Briefs/i)).toBeInTheDocument();
      expect(screen.getByText(/2 briefs in the last 7 days/i)).toBeInTheDocument();
      expect(screen.getByText(/Finish Pro launch/i)).toBeInTheDocument();
    });
  });

  it('shows empty state when no briefs exist', async () => {
    mockProStatus.mockResolvedValue({
      isPro: true,
      subscription: { tier: 'pro' },
    } as ProStatus);

    mockListFiles.mockResolvedValue([]);

    render(<ProBriefDashboard />);

    await waitFor(() => {
      expect(
        screen.getByText(/No briefings yet/i)
      ).toBeInTheDocument();
      expect(
        screen.getByText(/\/daily-brief/i)
      ).toBeInTheDocument();
    });
  });

  it('filters out non-markdown files', async () => {
    mockProStatus.mockResolvedValue({
      isPro: true,
      subscription: { tier: 'pro' },
    } as ProStatus);

    const mixedFiles: FileEntry[] = [
      {
        name: '2026-06-02.md',
        path: 'daily-log/2026-06-02.md',
        isDirectory: false,
        updatedAt: Date.now(),
      },
      {
        name: '.DS_Store',
        path: 'daily-log/.DS_Store',
        isDirectory: false,
        updatedAt: Date.now(),
      },
    ];

    mockListFiles.mockResolvedValue(mixedFiles);
    mockReadFile.mockResolvedValue('## Morning Brief\nPriority 1');

    render(<ProBriefDashboard />);

    await waitFor(() => {
      // Should only process the .md file
      expect(mockReadFile).toHaveBeenCalledWith('daily-log/2026-06-02.md');
      expect(mockReadFile).not.toHaveBeenCalledWith('daily-log/.DS_Store');
    });
  });

  it('limits briefs to last 7 days', async () => {
    mockProStatus.mockResolvedValue({
      isPro: true,
      subscription: { tier: 'pro' },
    } as ProStatus);

    const manyFiles: FileEntry[] = Array.from({ length: 15 }, (_, i) => ({
      name: `2026-05-${String(20 - i).padStart(2, '0')}.md`,
      path: `daily-log/2026-05-${String(20 - i).padStart(2, '0')}.md`,
      isDirectory: false,
      updatedAt: Date.now() - i * 86400000,
    }));

    mockListFiles.mockResolvedValue(manyFiles);
    mockReadFile.mockResolvedValue('## Morning Brief\nBrief content');

    render(<ProBriefDashboard />);

    await waitFor(() => {
      // Should only read 7 files
      expect(mockReadFile).toHaveBeenCalledTimes(7);
    });
  });

  it('reloads briefs when memory updates', async () => {
    mockProStatus.mockResolvedValue({
      isPro: true,
      subscription: { tier: 'pro' },
    } as ProStatus);

    mockListFiles.mockResolvedValue([]);

    let onMemoryCallback: (() => void) | null = null;
    mockOnMemoryUpdated.mockImplementation((cb) => {
      onMemoryCallback = cb;
      return () => {};
    });

    const { rerender } = render(<ProBriefDashboard />);

    await waitFor(() => {
      expect(mockProStatus).toHaveBeenCalled();
    });

    const initialCallCount = mockListFiles.mock.calls.length;

    // Trigger memory update
    if (onMemoryCallback) {
      onMemoryCallback();
    }

    await waitFor(() => {
      expect(mockListFiles.mock.calls.length).toBeGreaterThan(initialCallCount);
    });
  });
});
