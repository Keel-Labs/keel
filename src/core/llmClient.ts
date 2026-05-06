import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { Ollama } from 'ollama';
import type { Message } from '../shared/types';
import { loadSettings } from './settings';
import type { ToolDefinition } from './tools/schemas';
import { toAnthropicTools, toOpenAITools } from './tools/format';

type Provider = 'claude' | 'openai' | 'openrouter' | 'ollama';

export interface ToolCallInvocation {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolCallResult {
  toolUseId: string;
  content: string;
  isError: boolean;
}

export type ToolExecutor = (call: ToolCallInvocation) => Promise<ToolCallResult>;

export interface ChatWithToolsOptions {
  tools: ToolDefinition[];
  executeTool: ToolExecutor;
  onChunk?: (chunk: string) => void;
  onToolStart?: (call: ToolCallInvocation) => void;
  onToolEnd?: (result: ToolCallResult & { name: string }) => void;
  signal?: AbortSignal;
  maxIterations?: number;
}

const DEFAULT_MAX_TOOL_ITERATIONS = 5;

function getDesktopFetch(): typeof fetch {
  if (!process.versions.electron) {
    return fetch;
  }

  try {
    // Electron's network stack uses the OS trust store, which avoids Node TLS
    // certificate issues some desktop environments hit with undici/fetch.
    const { net } = require('electron') as typeof import('electron');
    if (net?.fetch) {
      return ((input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
        return net.fetch(url, init as any) as unknown as Promise<Response>;
      }) as typeof fetch;
    }
  } catch {
    // Fall back to the default fetch implementation.
  }

  return fetch;
}

function createOpenAIClient(apiKey: string, baseURL?: string): OpenAI {
  return new OpenAI({
    apiKey,
    baseURL,
    fetch: getDesktopFetch(),
  });
}

function emitTextAsChunks(text: string, onChunk?: (chunk: string) => void): void {
  if (!onChunk || !text) return;
  // Emit in modest chunks so the UI feels responsive even though the
  // underlying call wasn't true SSE streaming. Using ~80-char windows
  // matches the streaming flush threshold used elsewhere.
  const SIZE = 80;
  for (let i = 0; i < text.length; i += SIZE) {
    onChunk(text.slice(i, i + SIZE));
  }
}

export class LLMClient {
  private provider: Provider;
  private anthropic: Anthropic | null = null;
  private openai: OpenAI | null = null;
  private openrouter: OpenAI | null = null;
  private ollama: Ollama;
  private claudeModel: string;
  private openaiModel: string;
  private openrouterModel: string;
  private ollamaModel: string;

  constructor() {
    const settings = loadSettings();
    this.provider = settings.provider;
    this.claudeModel = settings.claudeModel || 'claude-sonnet-4-20250514';
    this.openaiModel = settings.openaiModel || 'gpt-4o';
    this.openrouterModel = settings.openrouterModel || '';
    this.ollamaModel = settings.ollamaModel || 'llama3.2';
    this.ollama = new Ollama();

    if (settings.anthropicApiKey) {
      this.anthropic = new Anthropic({
        apiKey: settings.anthropicApiKey,
        ...(settings.anthropicBaseUrl ? { baseURL: settings.anthropicBaseUrl } : {}),
      });
    }
    if (settings.openaiApiKey) {
      this.openai = createOpenAIClient(settings.openaiApiKey, settings.openaiBaseUrl || undefined);
    }
    if (settings.openrouterApiKey) {
      this.openrouter = createOpenAIClient(
        settings.openrouterApiKey,
        settings.openrouterBaseUrl || 'https://openrouter.ai/api/v1'
      );
    }
  }

  setProvider(provider: Provider): void {
    this.provider = provider;
  }

  reload(): void {
    const settings = loadSettings();
    this.provider = settings.provider;
    this.claudeModel = settings.claudeModel || 'claude-sonnet-4-20250514';
    this.openaiModel = settings.openaiModel || 'gpt-4o';
    this.openrouterModel = settings.openrouterModel || '';
    this.ollamaModel = settings.ollamaModel || 'llama3.2';

    if (settings.anthropicApiKey) {
      this.anthropic = new Anthropic({
        apiKey: settings.anthropicApiKey,
        ...(settings.anthropicBaseUrl ? { baseURL: settings.anthropicBaseUrl } : {}),
      });
    } else {
      this.anthropic = null;
    }
    if (settings.openaiApiKey) {
      this.openai = createOpenAIClient(settings.openaiApiKey, settings.openaiBaseUrl || undefined);
    } else {
      this.openai = null;
    }
    if (settings.openrouterApiKey) {
      this.openrouter = createOpenAIClient(
        settings.openrouterApiKey,
        settings.openrouterBaseUrl || 'https://openrouter.ai/api/v1'
      );
    } else {
      this.openrouter = null;
    }
  }

  // For tests / dependency injection.
  _setAnthropicForTesting(client: Anthropic | null): void {
    this.anthropic = client;
  }

  _setOpenAIForTesting(client: OpenAI | null): void {
    this.openai = client;
  }

  async chat(messages: Message[], systemPrompt: string): Promise<string> {
    const attempts: Provider[] = [this.provider];
    // Add fallbacks
    for (const p of ['claude', 'openai', 'openrouter', 'ollama'] as Provider[]) {
      if (!attempts.includes(p)) attempts.push(p);
    }

    for (const provider of attempts) {
      try {
        switch (provider) {
          case 'claude': return await this.chatClaude(messages, systemPrompt);
          case 'openai': return await this.chatOpenAI(this.openai, this.openaiModel, messages, systemPrompt);
          case 'openrouter': return await this.chatOpenAI(this.openrouter, this.openrouterModel, messages, systemPrompt);
          case 'ollama': return await this.chatOllama(messages, systemPrompt);
        }
      } catch {
        continue;
      }
    }
    throw new Error('AI provider unavailable. Check Settings to configure your AI engine.');
  }

  async chatStream(
    messages: Message[],
    systemPrompt: string,
    onChunk: (chunk: string) => void,
    signal?: AbortSignal
  ): Promise<void> {
    const attempts: Provider[] = [this.provider];
    for (const p of ['claude', 'openai', 'openrouter', 'ollama'] as Provider[]) {
      if (!attempts.includes(p)) attempts.push(p);
    }

    for (const provider of attempts) {
      try {
        switch (provider) {
          case 'claude': return await this.streamClaude(messages, systemPrompt, onChunk, signal);
          case 'openai': return await this.streamOpenAI(this.openai, this.openaiModel, messages, systemPrompt, onChunk, signal);
          case 'openrouter': return await this.streamOpenAI(this.openrouter, this.openrouterModel, messages, systemPrompt, onChunk, signal);
          case 'ollama': return await this.streamOllama(messages, systemPrompt, onChunk, signal);
        }
      } catch {
        continue;
      }
    }
    throw new Error('AI provider unavailable. Check Settings to configure your AI engine.');
  }

  /**
   * Chat with tool-calling. Runs an inner loop: send messages + tools,
   * execute any tool_use blocks the model emits, append tool_result back,
   * and repeat until the model produces a text-only response. Final text
   * is emitted via onChunk to preserve streaming UX.
   *
   * Tool calling is a Claude / OpenAI capability; for Ollama we still pass
   * the tool list because some local models (llama3.1+, qwen2.5+) honor it,
   * but we degrade to plain chatStream if the model never emits a tool_call.
   */
  async chatWithTools(
    messages: Message[],
    systemPrompt: string,
    options: ChatWithToolsOptions
  ): Promise<string> {
    if (options.tools.length === 0) {
      // No tools to expose — the orchestration loop is unnecessary. Use the
      // existing streaming path so we keep real SSE for plain-text chat.
      let buffer = '';
      const sink = (chunk: string) => {
        buffer += chunk;
        options.onChunk?.(chunk);
      };
      await this.chatStream(messages, systemPrompt, sink, options.signal);
      return buffer;
    }

    const attempts: Provider[] = [this.provider];
    for (const p of ['claude', 'openai', 'openrouter', 'ollama'] as Provider[]) {
      if (!attempts.includes(p)) attempts.push(p);
    }

    let lastError: unknown;
    for (const provider of attempts) {
      try {
        switch (provider) {
          case 'claude':
            return await this.chatClaudeWithTools(messages, systemPrompt, options);
          case 'openai':
            return await this.chatOpenAIWithTools(this.openai, this.openaiModel, messages, systemPrompt, options);
          case 'openrouter':
            return await this.chatOpenAIWithTools(this.openrouter, this.openrouterModel, messages, systemPrompt, options);
          case 'ollama':
            return await this.chatOllamaWithTools(messages, systemPrompt, options);
        }
      } catch (err) {
        lastError = err;
        continue;
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error('AI provider unavailable. Check Settings to configure your AI engine.');
  }

  // --- Claude ---

  private formatClaudeMessages(messages: Message[]): any[] {
    return messages.map((m) => {
      if (m.images && m.images.length > 0) {
        const content: any[] = m.images.map((img) => ({
          type: 'image',
          source: { type: 'base64', media_type: img.mediaType, data: img.data },
        }));
        content.push({ type: 'text', text: m.content });
        return { role: m.role, content };
      }
      return { role: m.role, content: m.content };
    });
  }

  private formatOpenAIMessages(messages: Message[], systemPrompt: string): any[] {
    const formatted: any[] = [{ role: 'system', content: systemPrompt }];
    for (const m of messages) {
      if (m.images && m.images.length > 0) {
        const content: any[] = m.images.map((img) => ({
          type: 'image_url',
          image_url: { url: `data:${img.mediaType};base64,${img.data}` },
        }));
        content.push({ type: 'text', text: m.content });
        formatted.push({ role: m.role, content });
      } else {
        formatted.push({ role: m.role as 'user' | 'assistant', content: m.content });
      }
    }
    return formatted;
  }

  private async chatClaude(messages: Message[], systemPrompt: string): Promise<string> {
    if (!this.anthropic) throw new Error('Anthropic API key not configured');

    const response = await this.anthropic.messages.create({
      model: this.claudeModel,
      max_tokens: 4096,
      system: systemPrompt,
      messages: this.formatClaudeMessages(messages),
    });

    const textBlock = response.content.find((b) => b.type === 'text');
    return textBlock ? textBlock.text : '';
  }

  private async streamClaude(
    messages: Message[],
    systemPrompt: string,
    onChunk: (chunk: string) => void,
    signal?: AbortSignal
  ): Promise<void> {
    if (!this.anthropic) throw new Error('Anthropic API key not configured');

    const stream = this.anthropic.messages.stream({
      model: this.claudeModel,
      max_tokens: 4096,
      system: systemPrompt,
      messages: this.formatClaudeMessages(messages),
    });

    for await (const event of stream) {
      if (signal?.aborted) { stream.abort(); break; }
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        onChunk(event.delta.text);
      }
    }
  }

  private async chatClaudeWithTools(
    messages: Message[],
    systemPrompt: string,
    options: ChatWithToolsOptions
  ): Promise<string> {
    if (!this.anthropic) throw new Error('Anthropic API key not configured');
    const maxIter = options.maxIterations ?? DEFAULT_MAX_TOOL_ITERATIONS;
    const apiMessages: any[] = this.formatClaudeMessages(messages);
    const anthropicTools = toAnthropicTools(options.tools);

    for (let iter = 0; iter < maxIter; iter++) {
      if (options.signal?.aborted) throw new Error('aborted');

      const response = await this.anthropic.messages.create({
        model: this.claudeModel,
        max_tokens: 4096,
        system: systemPrompt,
        tools: anthropicTools as any,
        messages: apiMessages,
      });

      const toolUses = response.content.filter((b: any) => b.type === 'tool_use') as Array<{
        type: 'tool_use';
        id: string;
        name: string;
        input: Record<string, unknown>;
      }>;

      if (response.stop_reason !== 'tool_use' || toolUses.length === 0) {
        const textParts = response.content
          .filter((b: any) => b.type === 'text')
          .map((b: any) => b.text as string);
        const finalText = textParts.join('');
        emitTextAsChunks(finalText, options.onChunk);
        return finalText;
      }

      // Append the assistant turn (containing the tool_use blocks) and a
      // single user message with one tool_result per tool_use, in order.
      apiMessages.push({ role: 'assistant', content: response.content });

      const toolResults: any[] = [];
      for (const tu of toolUses) {
        const call: ToolCallInvocation = { id: tu.id, name: tu.name, input: tu.input || {} };
        options.onToolStart?.(call);
        let result: ToolCallResult;
        try {
          result = await options.executeTool(call);
        } catch (err) {
          result = {
            toolUseId: tu.id,
            content: err instanceof Error ? err.message : 'Tool execution failed.',
            isError: true,
          };
        }
        options.onToolEnd?.({ ...result, name: tu.name });
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tu.id,
          content: result.content,
          is_error: result.isError,
        });
      }
      apiMessages.push({ role: 'user', content: toolResults });
    }

    throw new Error(`Tool-calling loop exceeded ${maxIter} iterations.`);
  }

  // --- OpenAI / OpenRouter (shared implementation) ---

  private async chatOpenAI(
    client: OpenAI | null,
    model: string,
    messages: Message[],
    systemPrompt: string
  ): Promise<string> {
    if (!client || !model) throw new Error('OpenAI client not configured');

    const response = await client.chat.completions.create({
      model,
      messages: this.formatOpenAIMessages(messages, systemPrompt),
    });

    return response.choices[0]?.message?.content || '';
  }

  private async streamOpenAI(
    client: OpenAI | null,
    model: string,
    messages: Message[],
    systemPrompt: string,
    onChunk: (chunk: string) => void,
    signal?: AbortSignal
  ): Promise<void> {
    if (!client || !model) throw new Error('OpenAI client not configured');

    const stream = await client.chat.completions.create({
      model,
      stream: true,
      messages: this.formatOpenAIMessages(messages, systemPrompt),
    });

    for await (const chunk of stream) {
      if (signal?.aborted) break;
      const content = chunk.choices[0]?.delta?.content;
      if (content) onChunk(content);
    }
  }

  private async chatOpenAIWithTools(
    client: OpenAI | null,
    model: string,
    messages: Message[],
    systemPrompt: string,
    options: ChatWithToolsOptions
  ): Promise<string> {
    if (!client || !model) throw new Error('OpenAI client not configured');
    const maxIter = options.maxIterations ?? DEFAULT_MAX_TOOL_ITERATIONS;
    const apiMessages: any[] = this.formatOpenAIMessages(messages, systemPrompt);
    const openaiTools = toOpenAITools(options.tools);

    for (let iter = 0; iter < maxIter; iter++) {
      if (options.signal?.aborted) throw new Error('aborted');

      const response = await client.chat.completions.create({
        model,
        messages: apiMessages,
        tools: openaiTools as any,
      });

      const choice = response.choices[0];
      const message = choice?.message;
      if (!message) {
        return '';
      }

      const toolCalls = (message.tool_calls || []) as Array<{
        id: string;
        type: 'function';
        function: { name: string; arguments: string };
      }>;

      if (!toolCalls.length || choice.finish_reason !== 'tool_calls') {
        const finalText = message.content || '';
        emitTextAsChunks(finalText, options.onChunk);
        return finalText;
      }

      // Echo the assistant message back so the model sees its own tool_calls.
      apiMessages.push({
        role: 'assistant',
        content: message.content ?? null,
        tool_calls: toolCalls,
      });

      for (const tc of toolCalls) {
        let parsedInput: Record<string, unknown> = {};
        try {
          parsedInput = tc.function.arguments ? JSON.parse(tc.function.arguments) : {};
        } catch {
          parsedInput = { _raw: tc.function.arguments };
        }
        const call: ToolCallInvocation = { id: tc.id, name: tc.function.name, input: parsedInput };
        options.onToolStart?.(call);
        let result: ToolCallResult;
        try {
          result = await options.executeTool(call);
        } catch (err) {
          result = {
            toolUseId: tc.id,
            content: err instanceof Error ? err.message : 'Tool execution failed.',
            isError: true,
          };
        }
        options.onToolEnd?.({ ...result, name: tc.function.name });
        apiMessages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: result.isError ? `[error] ${result.content}` : result.content,
        });
      }
    }

    throw new Error(`Tool-calling loop exceeded ${maxIter} iterations.`);
  }

  // --- Ollama ---

  private formatOllamaMessages(messages: Message[], systemPrompt: string): any[] {
    const formatted: any[] = [{ role: 'system', content: systemPrompt }];
    for (const m of messages) {
      const msg: any = { role: m.role as 'user' | 'assistant', content: m.content };
      if (m.images && m.images.length > 0) {
        msg.images = m.images.map((img) => img.data);
      }
      formatted.push(msg);
    }
    return formatted;
  }

  private async chatOllama(messages: Message[], systemPrompt: string): Promise<string> {
    const response = await this.ollama.chat({
      model: this.ollamaModel,
      messages: this.formatOllamaMessages(messages, systemPrompt),
    });

    return response.message.content;
  }

  private async streamOllama(
    messages: Message[],
    systemPrompt: string,
    onChunk: (chunk: string) => void,
    signal?: AbortSignal
  ): Promise<void> {
    const response = await this.ollama.chat({
      model: this.ollamaModel,
      stream: true,
      messages: this.formatOllamaMessages(messages, systemPrompt),
    });

    for await (const chunk of response) {
      if (signal?.aborted) break;
      if (chunk.message?.content) {
        onChunk(chunk.message.content);
      }
    }
  }

  private async chatOllamaWithTools(
    messages: Message[],
    systemPrompt: string,
    options: ChatWithToolsOptions
  ): Promise<string> {
    const maxIter = options.maxIterations ?? DEFAULT_MAX_TOOL_ITERATIONS;
    const apiMessages: any[] = this.formatOllamaMessages(messages, systemPrompt);
    const ollamaTools = options.tools.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.inputSchema,
      },
    }));

    for (let iter = 0; iter < maxIter; iter++) {
      if (options.signal?.aborted) throw new Error('aborted');

      let response: any;
      try {
        response = await this.ollama.chat({
          model: this.ollamaModel,
          messages: apiMessages,
          tools: ollamaTools as any,
        });
      } catch (err) {
        // Many local models choke when tools are passed. Drop tools and
        // retry once — the system prompt still tells the model not to
        // claim actions it can't perform.
        if (iter === 0) {
          response = await this.ollama.chat({
            model: this.ollamaModel,
            messages: apiMessages,
          });
        } else {
          throw err;
        }
      }

      const toolCalls = (response.message?.tool_calls || []) as Array<{
        function: { name: string; arguments: Record<string, unknown> };
      }>;

      if (!toolCalls.length) {
        const finalText = response.message?.content || '';
        emitTextAsChunks(finalText, options.onChunk);
        return finalText;
      }

      apiMessages.push({
        role: 'assistant',
        content: response.message?.content || '',
        tool_calls: toolCalls,
      });

      for (let i = 0; i < toolCalls.length; i++) {
        const tc = toolCalls[i];
        const id = `ollama-tool-${iter}-${i}`;
        const call: ToolCallInvocation = {
          id,
          name: tc.function.name,
          input: (tc.function.arguments as Record<string, unknown>) || {},
        };
        options.onToolStart?.(call);
        let result: ToolCallResult;
        try {
          result = await options.executeTool(call);
        } catch (err) {
          result = {
            toolUseId: id,
            content: err instanceof Error ? err.message : 'Tool execution failed.',
            isError: true,
          };
        }
        options.onToolEnd?.({ ...result, name: tc.function.name });
        apiMessages.push({
          role: 'tool',
          content: result.isError ? `[error] ${result.content}` : result.content,
        });
      }
    }

    throw new Error(`Tool-calling loop exceeded ${maxIter} iterations.`);
  }
}
