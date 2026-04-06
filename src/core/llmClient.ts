import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { Ollama } from 'ollama';
import type { Message } from '../shared/types';
import { loadSettings } from './settings';

type Provider = 'claude' | 'openai' | 'openrouter' | 'ollama';

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
      this.anthropic = new Anthropic({ apiKey: settings.anthropicApiKey });
    }
    if (settings.openaiApiKey) {
      this.openai = createOpenAIClient(settings.openaiApiKey);
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
      this.anthropic = new Anthropic({ apiKey: settings.anthropicApiKey });
    } else {
      this.anthropic = null;
    }
    if (settings.openaiApiKey) {
      this.openai = createOpenAIClient(settings.openaiApiKey);
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
    onChunk: (chunk: string) => void
  ): Promise<void> {
    const attempts: Provider[] = [this.provider];
    for (const p of ['claude', 'openai', 'openrouter', 'ollama'] as Provider[]) {
      if (!attempts.includes(p)) attempts.push(p);
    }

    for (const provider of attempts) {
      try {
        switch (provider) {
          case 'claude': return await this.streamClaude(messages, systemPrompt, onChunk);
          case 'openai': return await this.streamOpenAI(this.openai, this.openaiModel, messages, systemPrompt, onChunk);
          case 'openrouter': return await this.streamOpenAI(this.openrouter, this.openrouterModel, messages, systemPrompt, onChunk);
          case 'ollama': return await this.streamOllama(messages, systemPrompt, onChunk);
        }
      } catch {
        continue;
      }
    }
    throw new Error('AI provider unavailable. Check Settings to configure your AI engine.');
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
    onChunk: (chunk: string) => void
  ): Promise<void> {
    if (!this.anthropic) throw new Error('Anthropic API key not configured');

    const stream = this.anthropic.messages.stream({
      model: this.claudeModel,
      max_tokens: 4096,
      system: systemPrompt,
      messages: this.formatClaudeMessages(messages),
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        onChunk(event.delta.text);
      }
    }
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
    onChunk: (chunk: string) => void
  ): Promise<void> {
    if (!client || !model) throw new Error('OpenAI client not configured');

    const stream = await client.chat.completions.create({
      model,
      stream: true,
      messages: this.formatOpenAIMessages(messages, systemPrompt),
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) onChunk(content);
    }
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
    onChunk: (chunk: string) => void
  ): Promise<void> {
    const response = await this.ollama.chat({
      model: this.ollamaModel,
      stream: true,
      messages: this.formatOllamaMessages(messages, systemPrompt),
    });

    for await (const chunk of response) {
      if (chunk.message?.content) {
        onChunk(chunk.message.content);
      }
    }
  }
}
