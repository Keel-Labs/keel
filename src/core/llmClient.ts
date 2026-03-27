import Anthropic from '@anthropic-ai/sdk';
import { Ollama } from 'ollama';
import type { Message } from '../shared/types';
import { loadSettings } from './settings';

type Provider = 'claude' | 'ollama';

export class LLMClient {
  private provider: Provider;
  private anthropic: Anthropic | null = null;
  private ollama: Ollama;
  private ollamaModel: string;

  constructor() {
    const settings = loadSettings();
    this.provider = settings.provider;
    this.ollamaModel = settings.ollamaModel || 'llama3.2';
    this.ollama = new Ollama();

    if (settings.anthropicApiKey) {
      this.anthropic = new Anthropic({ apiKey: settings.anthropicApiKey });
    }
  }

  setProvider(provider: Provider): void {
    this.provider = provider;
  }

  reload(): void {
    const settings = loadSettings();
    this.provider = settings.provider;
    this.ollamaModel = settings.ollamaModel || 'llama3.2';
    if (settings.anthropicApiKey) {
      this.anthropic = new Anthropic({ apiKey: settings.anthropicApiKey });
    } else {
      this.anthropic = null;
    }
  }

  async chat(messages: Message[], systemPrompt: string): Promise<string> {
    try {
      if (this.provider === 'claude') {
        return await this.chatClaude(messages, systemPrompt);
      }
      return await this.chatOllama(messages, systemPrompt);
    } catch (error) {
      // Fallback: try the other provider
      try {
        if (this.provider === 'claude') {
          return await this.chatOllama(messages, systemPrompt);
        }
        return await this.chatClaude(messages, systemPrompt);
      } catch {
        throw new Error(
          'AI provider unavailable. Check Settings to configure your AI engine.'
        );
      }
    }
  }

  async chatStream(
    messages: Message[],
    systemPrompt: string,
    onChunk: (chunk: string) => void
  ): Promise<void> {
    try {
      if (this.provider === 'claude') {
        return await this.streamClaude(messages, systemPrompt, onChunk);
      }
      return await this.streamOllama(messages, systemPrompt, onChunk);
    } catch (error) {
      // Fallback: try the other provider
      try {
        if (this.provider === 'claude') {
          return await this.streamOllama(messages, systemPrompt, onChunk);
        }
        return await this.streamClaude(messages, systemPrompt, onChunk);
      } catch {
        throw new Error(
          'AI provider unavailable. Check Settings to configure your AI engine.'
        );
      }
    }
  }

  private async chatClaude(messages: Message[], systemPrompt: string): Promise<string> {
    if (!this.anthropic) {
      throw new Error('Anthropic API key not configured');
    }

    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: systemPrompt,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    });

    const textBlock = response.content.find((b) => b.type === 'text');
    return textBlock ? textBlock.text : '';
  }

  private async streamClaude(
    messages: Message[],
    systemPrompt: string,
    onChunk: (chunk: string) => void
  ): Promise<void> {
    if (!this.anthropic) {
      throw new Error('Anthropic API key not configured');
    }

    const stream = this.anthropic.messages.stream({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: systemPrompt,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    });

    for await (const event of stream) {
      if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta'
      ) {
        onChunk(event.delta.text);
      }
    }
  }

  private async chatOllama(messages: Message[], systemPrompt: string): Promise<string> {
    const response = await this.ollama.chat({
      model: this.ollamaModel,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
      ],
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
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
      ],
    });

    for await (const chunk of response) {
      if (chunk.message?.content) {
        onChunk(chunk.message.content);
      }
    }
  }
}
