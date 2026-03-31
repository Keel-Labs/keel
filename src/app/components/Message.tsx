import React, { useMemo } from 'react';
import { marked } from 'marked';
import type { Message as MessageType } from '../../shared/types';

marked.setOptions({ breaks: true, gfm: true });

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
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16, paddingLeft: 64 }}>
        <div style={{
          background: '#3b82f6', color: 'white',
          borderRadius: '16px 16px 4px 16px',
          padding: '10px 16px', fontSize: 14, lineHeight: 1.6,
          whiteSpace: 'pre-wrap',
        }}>
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 16, paddingRight: 48 }}>
      <div style={{
        width: 24, height: 24, borderRadius: '50%',
        background: 'linear-gradient(135deg, #3b82f6, #2dd4bf)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 10, fontWeight: 700, color: 'white',
        marginRight: 10, marginTop: 4, flexShrink: 0,
      }}>K</div>
      <div
        className="markdown-body"
        style={{
          background: '#252525', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '16px 16px 16px 4px',
          padding: '12px 16px', fontSize: 14, lineHeight: 1.6,
          color: 'rgba(255,255,255,0.9)', minWidth: 0,
        }}
        dangerouslySetInnerHTML={{ __html: renderedContent || '' }}
      />
    </div>
  );
}
