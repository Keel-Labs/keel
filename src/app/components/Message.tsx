import React from 'react';
import type { Message as MessageType } from '../../shared/types';

interface Props {
  message: MessageType;
}

export default function Message({ message }: Props) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div
        className={`max-w-[80%] rounded-xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? 'bg-blue-600 text-white'
            : 'bg-white/8 text-white/90'
        }`}
      >
        {message.content}
      </div>
    </div>
  );
}
