import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { Ollama } from 'ollama';
import type { Message, Settings } from '../shared/types';
import { runClaudeCli, runCodexCli } from './connectors/providerCli';
import { loadSettings } from './settings';

type Provider = 'claude' | 'openai' | 'openrouter' | 'ollama';

export class LLMClient {
  private provider: Provider;
  private anthropic: Anthropic | null = null;
  private openai: OpenAI | null = null;
  private openrouter: OpenAI | null = null;
  private ollama: Ollama;
  private settings: Settings;
  private claudeModel: string;
  private openaiModel: string;
  private openrouterModel: string;
  private ollamaModel: string;

  constructor() {
    this.settings = loadSettings();
    this.provider = this.settings.provider;
    this.claudeModel = this.settings.claudeModel || 'claude-sonnet-4-20250514';
    this.openaiModel = this.settings.openaiModel || 'gpt-4o';
    this.openrouterModel = this.settings.openrouterModel || '';
    this.ollamaModel = this.settings.ollamaModel || 'llama3.2';
    this.ollama = new Ollama();

    if (this.settings.anthropicApiKey) {
      this.anthropic = new Anthropic({ apiKey: this.settings.anthropicApiKey });
    }
    if (this.settings.openaiApiKey) {
      this.openai = new OpenAI({ apiKey: this.settings.openaiApiKey });
    }
    if (this.settings.openrouterApiKey) {
      this.openrouter = new OpenAI({
        apiKey: this.settings.openrouterApiKey,
        baseURL: this.settings.openrouterBaseUrl || 'https://openrouter.ai/api/v1',
      });
    }
  }

  setProvider(provider: Provider): void {
    this.provider = provider;
  }

  reload(): void {
    this.settings = loadSettings();
    this.provider = this.settings.provider;
    this.claudeModel = this.settings.claudeModel || 'claude-sonnet-4-20250514';
    this.openaiModel = this.settings.openaiModel || 'gpt-4o';
    this.openrouterModel = this.settings.openrouterModel || '';
    this.ollamaModel = this.settings.ollamaModel || 'llama3.2';

    if (this.settings.anthropicApiKey) {
      this.anthropic = new Anthropic({ apiKey: this.settings.anthropicApiKey });
    } else {
      this.anthropic = null;
    }
    if (this.settings.openaiApiKey) {
      this.openai = new OpenAI({ apiKey: this.settings.openaiApiKey });
    } else {
      this.openai = null;
    }
    if (this.settings.openrouterApiKey) {
      this.openrouter = new OpenAI({
        apiKey: this.settings.openrouterApiKey,
        baseURL: this.settings.openrouterBaseUrl || 'https://openrouter.ai/api/v1',
      });
    } else {
      this.openrouter = null;
    }
  }

  async chat(messages: Message[], systemPrompt: string): Promise<string> {
    switch (this.provider) {
      case 'claude':
        return this.chatClaude(messages, systemPrompt);
      case 'openai':
        return this.chatOpenAI(this.openai, this.openaiModel, messages, systemPrompt, true);
      case 'openrouter':
        return this.chatOpenAI(this.openrouter, this.openrouterModel, messages, systemPrompt, false);
      case 'ollama':
        return this.chatOllama(messages, systemPrompt);
    }
  }

  async chatStream(
    messages: Message[],
    systemPrompt: string,
    onChunk: (chunk: string) => void
  ): Promise<void> {
    switch (this.provider) {
      case 'claude':
        return this.streamClaude(messages, systemPrompt, onChunk);
      case 'openai':
        return this.streamOpenAI(this.openai, this.openaiModel, messages, systemPrompt, onChunk, true);
      case 'openrouter':
        return this.streamOpenAI(this.openrouter, this.openrouterModel, messages, systemPrompt, onChunk, false);
      case 'ollama':
        return this.streamOllama(messages, systemPrompt, onChunk);
    }
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
    if (this.settings.anthropicAuthMode === 'cli') {
      return runClaudeCli(messages, systemPrompt, {
        cwd: this.settings.brainPath,
        model: this.settings.anthropicCliModel || undefined,
      });
    }

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
    if (this.settings.anthropicAuthMode === 'cli') {
      await runClaudeCli(messages, systemPrompt, {
        cwd: this.settings.brainPath,
        model: this.settings.anthropicCliModel || undefined,
        onChunk,
      });
      return;
    }

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
    systemPrompt: string,
    useCodexCli: boolean
  ): Promise<string> {
    if (useCodexCli && this.settings.openaiAuthMode === 'cli') {
      return runCodexCli(messages, systemPrompt, {
        cwd: this.settings.brainPath,
        model: this.settings.openaiCliModel || undefined,
      });
    }

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
    useCodexCli: boolean
  ): Promise<void> {
    if (useCodexCli && this.settings.openaiAuthMode === 'cli') {
      await runCodexCli(messages, systemPrompt, {
        cwd: this.settings.brainPath,
        model: this.settings.openaiCliModel || undefined,
        onChunk,
      });
      return;
    }

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
