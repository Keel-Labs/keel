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

  if (isUser) {
    return (
      <div className="flex justify-end mb-4 pl-16">
        <div className="bg-blue-600 text-white rounded-2xl rounded-br-md px-4 py-2.5 text-sm leading-relaxed">
          <span className="whitespace-pre-wrap">{message.content}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start mb-4 pr-12">
      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-teal-400 flex items-center justify-center text-[10px] font-bold text-white mr-2.5 mt-1 shrink-0">
        K
      </div>
      <div className="bg-[#252525] border border-white/[0.08] rounded-2xl rounded-tl-md px-4 py-3 text-sm leading-relaxed text-white/90 markdown-body min-w-0">
        <div dangerouslySetInnerHTML={{ __html: renderedContent || '' }} />
      </div>
    </div>
  );
}
