import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

interface LLMSettings {
  provider: string | null;
  anthropicApiKey: string | null;
  claudeModel: string | null;
  openaiApiKey: string | null;
  openaiModel: string | null;
  openrouterApiKey: string | null;
  openrouterModel: string | null;
  openrouterBaseUrl: string | null;
  ollamaModel: string | null;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  images?: Array<{ data: string; mediaType: string }>;
  timestamp?: number;
}

export interface LLMClient {
  chat(messages: Message[], systemPrompt: string): Promise<string>;
  stream(
    messages: Message[],
    systemPrompt: string,
    onChunk: (chunk: string) => void,
    onThinking?: (thinking: string) => void
  ): Promise<void>;
}

// Models that support extended thinking
function supportsThinking(model: string): boolean {
  return /claude-(sonnet|opus)-4/i.test(model) || /claude-3-7/i.test(model);
}

export function getLLMClient(settings: LLMSettings): LLMClient {
  const provider = settings.provider || 'claude';

  return {
    async chat(messages: Message[], systemPrompt: string): Promise<string> {
      switch (provider) {
        case 'claude':
          return chatClaude(settings, messages, systemPrompt);
        case 'openai':
          return chatOpenAI(settings, messages, systemPrompt, false);
        case 'openrouter':
          return chatOpenAI(settings, messages, systemPrompt, true);
        default:
          throw new Error(`Provider ${provider} not supported on server`);
      }
    },

    async stream(
      messages: Message[],
      systemPrompt: string,
      onChunk: (chunk: string) => void,
      onThinking?: (thinking: string) => void
    ): Promise<void> {
      switch (provider) {
        case 'claude':
          return streamClaude(settings, messages, systemPrompt, onChunk, onThinking);
        case 'openai':
          return streamOpenAI(settings, messages, systemPrompt, onChunk, false);
        case 'openrouter':
          return streamOpenAI(settings, messages, systemPrompt, onChunk, true);
        default:
          throw new Error(`Provider ${provider} not supported on server`);
      }
    },
  };
}

// --- Claude ---

function formatClaudeMessages(messages: Message[]): any[] {
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

async function chatClaude(
  settings: LLMSettings,
  messages: Message[],
  systemPrompt: string
): Promise<string> {
  const client = new Anthropic({ apiKey: settings.anthropicApiKey! });
  const response = await client.messages.create({
    model: settings.claudeModel || 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: systemPrompt,
    messages: formatClaudeMessages(messages),
  });

  return response.content
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('');
}

async function streamClaude(
  settings: LLMSettings,
  messages: Message[],
  systemPrompt: string,
  onChunk: (chunk: string) => void,
  onThinking?: (thinking: string) => void
): Promise<void> {
  const client = new Anthropic({ apiKey: settings.anthropicApiKey! });
  const model = settings.claudeModel || 'claude-sonnet-4-20250514';
  const useThinking = supportsThinking(model);

  const params: any = {
    model,
    max_tokens: useThinking ? 16000 : 4096,
    system: systemPrompt,
    messages: formatClaudeMessages(messages),
  };

  if (useThinking) {
    params.thinking = { type: 'enabled', budget_tokens: 10000 };
  }

  const stream = client.messages.stream(params);

  for await (const event of stream) {
    if (event.type === 'content_block_delta') {
      const delta = event.delta as any;
      if (delta.type === 'thinking_delta' && onThinking) {
        onThinking(delta.thinking);
      } else if (delta.type === 'text_delta') {
        onChunk(delta.text);
      }
    }
  }
}

// --- OpenAI / OpenRouter ---

function formatOpenAIMessages(messages: Message[], systemPrompt: string): any[] {
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
      formatted.push({ role: m.role, content: m.content });
    }
  }
  return formatted;
}

async function chatOpenAI(
  settings: LLMSettings,
  messages: Message[],
  systemPrompt: string,
  isOpenRouter: boolean
): Promise<string> {
  const client = new OpenAI({
    apiKey: isOpenRouter ? settings.openrouterApiKey! : settings.openaiApiKey!,
    baseURL: isOpenRouter
      ? settings.openrouterBaseUrl || 'https://openrouter.ai/api/v1'
      : undefined,
  });

  const model = isOpenRouter
    ? settings.openrouterModel || ''
    : settings.openaiModel || 'gpt-4o';

  const response = await client.chat.completions.create({
    model,
    messages: formatOpenAIMessages(messages, systemPrompt),
  });

  return response.choices[0]?.message?.content || '';
}

async function streamOpenAI(
  settings: LLMSettings,
  messages: Message[],
  systemPrompt: string,
  onChunk: (chunk: string) => void,
  isOpenRouter: boolean
): Promise<void> {
  const client = new OpenAI({
    apiKey: isOpenRouter ? settings.openrouterApiKey! : settings.openaiApiKey!,
    baseURL: isOpenRouter
      ? settings.openrouterBaseUrl || 'https://openrouter.ai/api/v1'
      : undefined,
  });

  const model = isOpenRouter
    ? settings.openrouterModel || ''
    : settings.openaiModel || 'gpt-4o';

  const stream = await client.chat.completions.create({
    model,
    stream: true,
    messages: formatOpenAIMessages(messages, systemPrompt),
  });

  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content;
    if (text) onChunk(text);
  }
}
