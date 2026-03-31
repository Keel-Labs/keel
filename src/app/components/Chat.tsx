import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { Message as MessageType } from '../../shared/types';
import Message from './Message';

function ThinkingIndicator() {
  return (
    <div className="flex justify-start mb-4">
      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-teal-400 flex items-center justify-center text-xs font-bold text-white mr-2.5 mt-0.5 shrink-0">
        K
      </div>
      <div className="bg-white/[0.06] rounded-2xl px-4 py-3">
        <div className="flex items-center gap-1.5">
          <div className="thinking-dot w-2 h-2 rounded-full bg-blue-400/70" style={{ animationDelay: '0ms' }} />
          <div className="thinking-dot w-2 h-2 rounded-full bg-teal-400/70" style={{ animationDelay: '150ms' }} />
          <div className="thinking-dot w-2 h-2 rounded-full bg-blue-400/70" style={{ animationDelay: '300ms' }} />
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

    // Check for slash commands
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
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-5">
        {messages.length === 0 && !isStreaming && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-md">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-teal-400 flex items-center justify-center text-2xl font-bold text-white mx-auto mb-5 shadow-lg shadow-blue-500/20">
                K
              </div>
              <h2 className="text-xl font-semibold text-white/90 mb-2">Good to see you</h2>
              <p className="text-sm text-white/40 mb-6">
                I'm Keel, your AI chief of staff. I know your projects, priorities, and people. Ask me anything or try a command.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {WELCOME_SUGGESTIONS.map((s) => (
                  <button
                    key={s.label}
                    onClick={() => sendMessage(s.label)}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-white/60 hover:text-white/80 text-sm transition-colors text-left"
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
      <div className="border-t border-white/[0.08] px-5 py-3 bg-[#1a1a1a]">
        <div className="flex items-end gap-2.5">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message Keel..."
            disabled={isStreaming}
            rows={1}
            className="flex-1 bg-white/[0.06] text-white/90 text-sm rounded-xl px-4 py-2.5 resize-none outline-none placeholder:text-white/25 focus:ring-1 focus:ring-blue-500/40 focus:bg-white/[0.08] disabled:opacity-40 transition-all"
          />
          <button
            onClick={() => sendMessage()}
            disabled={isStreaming || !input.trim()}
            className="bg-blue-600 hover:bg-blue-500 disabled:bg-white/[0.06] disabled:text-white/20 text-white text-sm font-medium rounded-xl px-4 py-2.5 transition-all active:scale-95"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
