import React, { useMemo } from 'react';
import { marked } from 'marked';
import type { Message as MessageType } from '../../shared/types';

const renderer = new marked.Renderer();
renderer.link = ({ href, text }) => {
  return `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`;
};

marked.setOptions({ breaks: true, gfm: true, renderer });

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
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16, paddingLeft: 80 }}>
        <div style={{
          background: '#1e1e1e', color: '#f0f0f0',
          borderRadius: '12px',
          padding: '10px 16px', fontSize: 'var(--text-base)', lineHeight: 1.55,
          whiteSpace: 'pre-wrap', maxWidth: 600,
        }}>
          {message.images && message.images.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {message.images.map((img, i) => (
                <img
                  key={i}
                  src={`data:${img.mediaType};base64,${img.data}`}
                  alt=""
                  style={{
                    maxWidth: 200, maxHeight: 200, borderRadius: 'var(--radius-base)',
                    objectFit: 'cover',
                  }}
                />
              ))}
            </div>
          )}
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 16, maxWidth: 700 }}>
      <div
        className="markdown-body"
        style={{
          fontSize: 'var(--text-base)', lineHeight: 1.7,
          color: 'var(--text-secondary)',
          padding: '4px 24px',
          minWidth: 0,
        }}
        dangerouslySetInnerHTML={{ __html: renderedContent || '' }}
      />
    </div>
  );
}
