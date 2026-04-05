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
      <div style={{
        display: 'flex', justifyContent: 'flex-end',
        marginBottom: 6, padding: '0 8px',
      }}>
        <div style={{
          maxWidth: '75%',
          color: 'var(--text-primary)',
          fontSize: 'var(--text-base)', lineHeight: 1.7,
          whiteSpace: 'pre-wrap',
          padding: '10px 16px',
          background: 'var(--bg-surface)',
          borderRadius: 'var(--radius-lg)',
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
    <div style={{
      marginBottom: 6, padding: '0 8px',
    }}>
      <div
        className="markdown-body"
        style={{
          fontSize: 'var(--text-base)', lineHeight: 1.7,
          color: 'var(--text-secondary)',
          padding: '10px 16px',
          minWidth: 0,
        }}
        dangerouslySetInnerHTML={{ __html: renderedContent || '' }}
      />
    </div>
  );
}
