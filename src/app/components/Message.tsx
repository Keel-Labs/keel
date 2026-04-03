import React, { useMemo } from 'react';
import { marked } from 'marked';
import type { Message as MessageType } from '../../shared/types';
import { KeelIcon } from './KeelIcon';

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
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16, paddingLeft: 64 }}>
        <div style={{
          background: '#CF7A5C', color: 'white',
          borderRadius: '16px 16px 4px 16px',
          padding: '10px 16px', fontSize: 14, lineHeight: 1.6,
          whiteSpace: 'pre-wrap',
        }}>
          {message.images && message.images.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {message.images.map((img, i) => (
                <img
                  key={i}
                  src={`data:${img.mediaType};base64,${img.data}`}
                  alt=""
                  style={{
                    maxWidth: 200, maxHeight: 200, borderRadius: 8,
                    objectFit: 'cover', border: '2px solid rgba(255,255,255,0.2)',
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
    <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 16, paddingRight: 48 }}>
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
