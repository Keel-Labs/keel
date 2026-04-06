import React from 'react';
import type { SessionIndicatorState } from '../sessionState';

interface Props {
  indicator?: SessionIndicatorState;
  className?: string;
}

export default function SessionStatusIndicator({ indicator, className }: Props) {
  if (!indicator) return null;

  if (indicator.isStreaming) {
    return (
      <span
        className={className ? `session-status session-status--spinner ${className}` : 'session-status session-status--spinner'}
        aria-label="Response in progress"
      />
    );
  }

  if (indicator.unread) {
    return (
      <span
        className={className ? `session-status session-status--unread ${className}` : 'session-status session-status--unread'}
        aria-label="Unread response"
      />
    );
  }

  return null;
}
