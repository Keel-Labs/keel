import React, { useMemo } from 'react';
import { marked } from 'marked';
import type { Message as MessageType } from '../../shared/types';

// Configure marked for safe rendering
marked.setOptions({
  breaks: true,
  gfm: true,
});

interface Props {
  message: MessageType;
}

export default function Message({ message }: Props) {
  const isUser = message.role === 'user';

  const renderedContent = useMemo(() => {
    if (isUser) return null;
    return marked.parse(message.content) as string;
  }, [message.content, isUser]);

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-teal-400 flex items-center justify-center text-xs font-bold text-white mr-2.5 mt-0.5 shrink-0">
          K
        </div>
      )}
      <div
        className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
          isUser
            ? 'max-w-[75%] bg-blue-600 text-white'
            : 'max-w-[85%] bg-white/[0.06] text-white/90 markdown-body'
        }`}
      >
        {isUser ? (
          <span className="whitespace-pre-wrap">{message.content}</span>
        ) : (
          <div dangerouslySetInnerHTML={{ __html: renderedContent || '' }} />
        )}
      </div>
    </div>
  );
}
