import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { Message as MessageType } from '../../shared/types';
import Message from './Message';

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

  const sendMessage = async () => {
    const trimmed = input.trim();
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
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 && !isStreaming && (
          <div className="flex items-center justify-center h-full text-white/30 text-sm">
            <div className="text-center">
              <p className="text-3xl mb-3">⚓</p>
              <p>What are you working on?</p>
              <p className="text-xs mt-1 text-white/20">
                Try: /daily-brief · /capture · /eod
              </p>
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

        {/* Loading indicator */}
        {isStreaming && !streamingContent && (
          <div className="flex justify-start mb-3">
            <div className="bg-white/8 rounded-xl px-4 py-2.5 text-sm text-white/50">
              <span className="animate-pulse">Thinking...</span>
            </div>
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="border-t border-white/10 px-4 py-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message Keel..."
            disabled={isStreaming}
            rows={1}
            className="flex-1 bg-white/8 text-white/90 text-sm rounded-xl px-4 py-2.5 resize-none outline-none placeholder:text-white/30 focus:ring-1 focus:ring-white/20 disabled:opacity-50"
          />
          <button
            onClick={sendMessage}
            disabled={isStreaming || !input.trim()}
            className="bg-blue-600 hover:bg-blue-500 disabled:bg-white/10 disabled:text-white/30 text-white text-sm font-medium rounded-xl px-4 py-2.5 transition-colors"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
