import { useEffect, useState } from 'react';
import type { MobileCaptureRoutedEvent } from '../../shared/types';

/**
 * Transient banner shown when the inbox watcher routes a capture
 * dropped by the mobile companion. Slides in from the top, auto-
 * dismisses after a few seconds. Clicking it navigates to the
 * Inbox view so the user can review extracted tasks.
 *
 * Listens for the `keel:mobile-capture-routed` IPC event exposed by
 * the preload bridge as `window.keel.onMobileCaptureRouted`.
 */
interface Props {
  onOpenInbox: () => void;
}

interface ToastState {
  id: number;
  device: string;
  routedTo: string;
}

const VISIBLE_MS = 6000;

export default function MobileCaptureToast({ onOpenInbox }: Props) {
  const [toast, setToast] = useState<ToastState | null>(null);

  useEffect(() => {
    let nextId = 1;
    let dismissTimer: number | undefined;

    const unsubscribe = window.keel.onMobileCaptureRouted((event: MobileCaptureRoutedEvent) => {
      // If a toast is already showing, replace it — the newest
      // capture is more relevant than whatever was there.
      window.clearTimeout(dismissTimer);
      setToast({
        id: nextId++,
        device: event.device,
        routedTo: event.routedTo || 'Routed by Keel.',
      });
      dismissTimer = window.setTimeout(() => setToast(null), VISIBLE_MS);
    });

    return () => {
      unsubscribe?.();
      window.clearTimeout(dismissTimer);
    };
  }, []);

  if (!toast) return null;

  return (
    <button
      key={toast.id}
      className="mobile-capture-toast"
      onClick={() => {
        setToast(null);
        onOpenInbox();
      }}
    >
      <span className="mobile-capture-toast__icon" aria-hidden="true">
        {/* Tiny paperplane glyph — matches the Send icon on the phone. */}
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path d="M2 8L14 2L10 14L8 9L2 8Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="mobile-capture-toast__body">
        <span className="mobile-capture-toast__title">Captured from {toast.device}</span>
        <span className="mobile-capture-toast__subtitle">{toast.routedTo}</span>
      </span>
      <span className="mobile-capture-toast__cta">Review →</span>
    </button>
  );
}
