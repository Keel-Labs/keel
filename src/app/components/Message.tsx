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
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 18, paddingLeft: 72 }}>
        <div style={{
          background: 'var(--user-message-bg)', color: 'var(--user-message-color)',
          border: '1px solid var(--user-message-border)',
          borderRadius: '18px 18px 8px 18px',
          padding: '11px 16px', fontSize: 'var(--text-base)', lineHeight: 1.65,
          whiteSpace: 'pre-wrap',
          maxWidth: 'min(680px, 82%)',
          boxShadow: '0 10px 24px rgba(0,0,0,0.08)',
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
                    objectFit: 'cover', border: '1px solid var(--panel-border-strong)',
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
    <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 26, paddingRight: 88 }}>
      <div
        className="markdown-body"
        style={{
          background: 'var(--assistant-message-bg)',
          border: '1px solid var(--assistant-message-border)',
          borderRadius: 0,
          padding: 0,
          fontSize: 'var(--text-base)',
          lineHeight: 1.78,
          color: 'var(--text-primary)',
          minWidth: 0,
          maxWidth: 'min(760px, 100%)',
        }}
        dangerouslySetInnerHTML={{ __html: renderedContent || '' }}
      />
    </div>
  );
}
