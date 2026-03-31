import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { Message as MessageType } from '../../shared/types';
import Message from './Message';

function ThinkingIndicator() {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 16, paddingRight: 48 }}>
      <div style={{
        width: 24, height: 24, borderRadius: '50%',
        background: 'linear-gradient(135deg, #3b82f6, #2dd4bf)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 10, fontWeight: 700, color: 'white',
        marginRight: 10, marginTop: 4, flexShrink: 0,
      }}>K</div>
      <div style={{
        background: '#252525', border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '16px 16px 16px 4px', padding: '14px 16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div className="thinking-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: '#60a5fa', animationDelay: '0ms' }} />
          <div className="thinking-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: '#2dd4bf', animationDelay: '150ms' }} />
          <div className="thinking-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: '#60a5fa', animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  );
}

const WELCOME_SUGGESTIONS = [
  { label: 'What am I working on?', icon: '📋' },
  { label: '/daily-brief', icon: '☀️' },
  { label: '/capture', icon: '📎' },
  { label: '/eod', icon: '🌙' },
];

const PDF_COMMAND_RE = /^(make|export|save|create|generate)\s+(a\s+|to\s+|as\s+|it\s+as\s+)?a?\s*pdf$/i;

function isPdfCommand(text: string): boolean {
  return PDF_COMMAND_RE.test(text.trim());
}

function generateSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function Chat() {
  const [messages, setMessages] = useState<MessageType[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [sessionId, setSessionId] = useState<string>(generateSessionId());
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load the last session on mount
  useEffect(() => {
    (async () => {
      try {
        const latestId = await window.keel.getLatestSession();
        if (latestId) {
          const saved = await window.keel.loadChat(latestId);
          if (saved && saved.length > 0) {
            setSessionId(latestId);
            setMessages(saved);
          }
        }
      } catch {
        // First launch, no sessions yet
      }
    })();
  }, []);

  // Auto-save messages whenever they change
  useEffect(() => {
    if (messages.length > 0) {
      window.keel.saveChat(sessionId, messages).catch(() => {});
    }
  }, [messages, sessionId]);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingContent, scrollToBottom]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 120) + 'px';
    }
  }, [input]);

  const getLastAssistantMessage = (): string | null => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') return messages[i].content;
    }
    return null;
  };

  const startNewChat = () => {
    setMessages([]);
    setSessionId(generateSessionId());
  };

  const sendMessage = async (overrideText?: string) => {
    const trimmed = (overrideText || input).trim();
    if (!trimmed || isStreaming) return;

    const userMessage: MessageType = {
      role: 'user',
      content: trimmed,
      timestamp: Date.now(),
    };

    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput('');
    setIsStreaming(true);
    setStreamingContent('');

    // PDF export command
    if (isPdfCommand(trimmed)) {
      const lastContent = getLastAssistantMessage();
      if (!lastContent) {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: 'Nothing to export yet — ask me something first.', timestamp: Date.now() },
        ]);
      } else {
        try {
          const result = await window.keel.exportPdf(lastContent);
          setMessages((prev) => [
            ...prev,
            { role: 'assistant', content: result, timestamp: Date.now() },
          ]);
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'PDF export failed';
          setMessages((prev) => [
            ...prev,
            { role: 'assistant', content: msg, timestamp: Date.now() },
          ]);
        }
      }
      setIsStreaming(false);
      return;
    }

    // /capture command
    if (trimmed.startsWith('/capture ')) {
      try {
        const result = await window.keel.capture(trimmed.slice(9));
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: result, timestamp: Date.now() },
        ]);
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Capture failed';
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: msg, timestamp: Date.now() },
        ]);
      }
      setIsStreaming(false);
      return;
    }

    if (trimmed === '/daily-brief') {
      try {
        const result = await window.keel.dailyBrief();
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: result, timestamp: Date.now() },
        ]);
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Daily brief failed';
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: msg, timestamp: Date.now() },
        ]);
      }
      setIsStreaming(false);
      return;
    }

    if (trimmed === '/eod') {
      try {
        const result = await window.keel.eod(updatedMessages);
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: result, timestamp: Date.now() },
        ]);
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'EOD failed';
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: msg, timestamp: Date.now() },
        ]);
      }
      setIsStreaming(false);
      return;
    }

    // Regular chat — use streaming
    let accumulated = '';

    window.keel.removeStreamListeners();

    window.keel.onStreamChunk((chunk: string) => {
      accumulated += chunk;
      setStreamingContent(accumulated);
    });

    window.keel.onStreamDone(() => {
      window.keel.removeStreamListeners();
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: accumulated, timestamp: Date.now() },
      ]);
      setStreamingContent('');
      setIsStreaming(false);
    });

    window.keel.onStreamError((error: string) => {
      window.keel.removeStreamListeners();
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: error, timestamp: Date.now() },
      ]);
      setStreamingContent('');
      setIsStreaming(false);
    });

    try {
      await window.keel.chatStream(updatedMessages);
    } catch (error) {
      window.keel.removeStreamListeners();
      const msg =
        error instanceof Error
          ? error.message
          : 'AI provider unavailable. Check Settings to configure your AI engine.';
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: msg, timestamp: Date.now() },
      ]);
      setStreamingContent('');
      setIsStreaming(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Message list */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
        {messages.length === 0 && !isStreaming && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <div style={{ textAlign: 'center', maxWidth: 360 }}>
              <div style={{
                width: 56, height: 56, borderRadius: 16,
                background: 'linear-gradient(135deg, #3b82f6, #2dd4bf)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 22, fontWeight: 700, color: 'white',
                margin: '0 auto 20px', boxShadow: '0 8px 24px rgba(59,130,246,0.2)',
              }}>K</div>
              <h2 style={{ fontSize: 18, fontWeight: 600, color: 'rgba(255,255,255,0.9)', marginBottom: 8 }}>Good to see you</h2>
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', marginBottom: 24, lineHeight: 1.6 }}>
                I'm Keel, your AI chief of staff. I know your projects, priorities, and people.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {WELCOME_SUGGESTIONS.map((s) => (
                  <button
                    key={s.label}
                    onClick={() => sendMessage(s.label)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '10px 12px', borderRadius: 12,
                      background: '#252525', border: '1px solid rgba(255,255,255,0.08)',
                      color: 'rgba(255,255,255,0.6)', fontSize: 12,
                      cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#2a2a2a';
                      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)';
                      e.currentTarget.style.color = 'rgba(255,255,255,0.8)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = '#252525';
                      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
                      e.currentTarget.style.color = 'rgba(255,255,255,0.6)';
                    }}
                  >
                    <span>{s.icon}</span>
                    <span>{s.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <Message key={i} message={msg} />
        ))}

        {isStreaming && streamingContent && (
          <Message
            message={{
              role: 'assistant',
              content: streamingContent,
              timestamp: Date.now(),
            }}
          />
        )}

        {isStreaming && !streamingContent && <ThinkingIndicator />}
      </div>

      {/* Input area */}
      <div style={{
        borderTop: '1px solid rgba(255,255,255,0.08)',
        padding: '12px 24px',
        background: '#1a1a1a',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
          {messages.length > 0 && (
            <button
              onClick={startNewChat}
              disabled={isStreaming}
              title="New chat"
              style={{
                background: '#252525', border: '1px solid rgba(255,255,255,0.08)',
                color: 'rgba(255,255,255,0.5)', borderRadius: 12,
                padding: '10px 12px', cursor: 'pointer', fontSize: 14,
                transition: 'all 0.15s', flexShrink: 0,
                opacity: isStreaming ? 0.4 : 1,
              }}
              onMouseEnter={(e) => { if (!isStreaming) e.currentTarget.style.color = 'rgba(255,255,255,0.8)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.5)'; }}
            >
              +
            </button>
          )}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message Keel..."
            disabled={isStreaming}
            rows={1}
            style={{
              flex: 1, background: '#252525', border: '1px solid rgba(255,255,255,0.08)',
              color: 'rgba(255,255,255,0.9)', fontSize: 14, borderRadius: 12,
              padding: '10px 16px', resize: 'none', outline: 'none',
              fontFamily: 'inherit', transition: 'all 0.15s',
              overflow: 'hidden',
              opacity: isStreaming ? 0.4 : 1,
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'rgba(59,130,246,0.4)';
              e.currentTarget.style.background = '#282828';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
              e.currentTarget.style.background = '#252525';
            }}
          />
          <button
            onClick={() => sendMessage()}
            disabled={isStreaming || !input.trim()}
            style={{
              background: isStreaming || !input.trim() ? '#252525' : '#3b82f6',
              border: isStreaming || !input.trim() ? '1px solid rgba(255,255,255,0.08)' : '1px solid transparent',
              color: isStreaming || !input.trim() ? 'rgba(255,255,255,0.2)' : 'white',
              fontSize: 14, fontWeight: 500, borderRadius: 12,
              padding: '10px 16px', cursor: isStreaming || !input.trim() ? 'default' : 'pointer',
              transition: 'all 0.15s', flexShrink: 0,
            }}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
