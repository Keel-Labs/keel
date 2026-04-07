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

function extractGdocUrl(content: string): { cleanContent: string; gdocUrl: string | null } {
  const match = content.match(/<!-- gdoc:(https:\/\/docs\.google\.com\/document\/d\/[^\s]+?) -->/);
  if (!match) return { cleanContent: content, gdocUrl: null };
  const cleanContent = content.replace(/\n*<!-- gdoc:.+? -->/, '').trim();
  return { cleanContent, gdocUrl: match[1] };
}

export default function Message({ message }: Props) {
  const isUser = message.role === 'user';

  const { cleanContent, gdocUrl } = useMemo(
    () => (isUser ? { cleanContent: message.content, gdocUrl: null } : extractGdocUrl(message.content)),
    [message.content, isUser]
  );

  const renderedContent = useMemo(() => {
    if (isUser) return null;
    return marked.parse(cleanContent) as string;
  }, [cleanContent, isUser]);

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
      <div style={{ minWidth: 0, maxWidth: 'min(760px, 100%)' }}>
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
          }}
          dangerouslySetInnerHTML={{ __html: renderedContent || '' }}
        />
        {gdocUrl && (
          <a
            href={gdocUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              marginTop: 10,
              padding: '7px 14px',
              background: 'var(--accent-bg-subtle)',
              border: '1px solid var(--accent-border-subtle)',
              borderRadius: 'var(--radius-lg)',
              color: 'var(--accent-link)',
              fontSize: 13,
              fontWeight: 500,
              textDecoration: 'none',
              transition: 'background 0.15s, border-color 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--accent-bg)';
              e.currentTarget.style.borderColor = 'var(--accent)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--accent-bg-subtle)';
              e.currentTarget.style.borderColor = 'var(--accent-border-subtle)';
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
            Open Google Doc
          </a>
        )}
      </div>
    </div>
  );
}
