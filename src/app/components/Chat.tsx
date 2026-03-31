import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { Message as MessageType } from '../../shared/types';
import Message from './Message';

function ThinkingIndicator() {
  return (
    <div className="flex justify-start mb-4 pr-12">
      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-teal-400 flex items-center justify-center text-[10px] font-bold text-white mr-2.5 mt-1 shrink-0">
        K
      </div>
      <div className="bg-[#252525] border border-white/[0.08] rounded-2xl rounded-tl-md px-4 py-3.5">
        <div className="flex items-center gap-1.5">
          <div className="thinking-dot w-1.5 h-1.5 rounded-full bg-blue-400" style={{ animationDelay: '0ms' }} />
          <div className="thinking-dot w-1.5 h-1.5 rounded-full bg-teal-400" style={{ animationDelay: '150ms' }} />
          <div className="thinking-dot w-1.5 h-1.5 rounded-full bg-blue-400" style={{ animationDelay: '300ms' }} />
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

// Matches "make a pdf", "export to pdf", "save as pdf", "create a pdf", etc.
const PDF_COMMAND_RE = /^(make|export|save|create|generate)\s+(a\s+|to\s+|as\s+|it\s+as\s+)?a?\s*pdf$/i;

function isPdfCommand(text: string): boolean {
  return PDF_COMMAND_RE.test(text.trim());
}

export default function Chat() {
  const [messages, setMessages] = useState<MessageType[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom
  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingContent, scrollToBottom]);

  // Auto-resize textarea
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
    <div className="flex-1 flex flex-col min-h-0">
      {/* Message list */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-5">
        {messages.length === 0 && !isStreaming && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-sm">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-teal-400 flex items-center justify-center text-xl font-bold text-white mx-auto mb-5 shadow-lg shadow-blue-500/20">
                K
              </div>
              <h2 className="text-lg font-semibold text-white/90 mb-2">Good to see you</h2>
              <p className="text-sm text-white/40 mb-6 leading-relaxed">
                I'm Keel, your AI chief of staff. I know your projects, priorities, and people.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {WELCOME_SUGGESTIONS.map((s) => (
                  <button
                    key={s.label}
                    onClick={() => sendMessage(s.label)}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-[#252525] border border-white/[0.08] hover:bg-[#2a2a2a] hover:border-white/[0.15] text-white/60 hover:text-white/80 text-xs transition-all text-left"
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

        {/* Streaming message */}
        {isStreaming && streamingContent && (
          <Message
            message={{
              role: 'assistant',
              content: streamingContent,
              timestamp: Date.now(),
            }}
          />
        )}

        {/* Thinking indicator */}
        {isStreaming && !streamingContent && <ThinkingIndicator />}
      </div>

      {/* Input area */}
      <div className="border-t border-white/[0.08] px-6 py-3 bg-[#1a1a1a]">
        <div className="flex items-end gap-2.5">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message Keel..."
            disabled={isStreaming}
            rows={1}
            className="flex-1 bg-[#252525] border border-white/[0.08] text-white/90 text-sm rounded-xl px-4 py-2.5 resize-none outline-none placeholder:text-white/25 focus:border-blue-500/40 focus:bg-[#282828] disabled:opacity-40 transition-all"
          />
          <button
            onClick={() => sendMessage()}
            disabled={isStreaming || !input.trim()}
            className="bg-blue-600 hover:bg-blue-500 disabled:bg-[#252525] disabled:border disabled:border-white/[0.08] disabled:text-white/20 text-white text-sm font-medium rounded-xl px-4 py-2.5 transition-all active:scale-95"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
