// Adapters that translate provider-agnostic ToolDefinition[] into the
// shapes Anthropic and OpenAI expect.

import type { ToolDefinition } from './schemas';

export function toAnthropicTools(tools: ToolDefinition[]): Array<{
  name: string;
  description: string;
  input_schema: ToolDefinition['inputSchema'];
}> {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema,
  }));
}

export function toOpenAITools(tools: ToolDefinition[]): Array<{
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: ToolDefinition['inputSchema'];
  };
}> {
  return tools.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema,
    },
  }));
}

export function toolsSystemAddendum(tools: ToolDefinition[]): string {
  if (tools.length === 0) {
    return [
      '',
      'TOOL USE:',
      '- You currently have NO action tools available. You can answer questions and write content, but you cannot perform actions like creating tasks, exporting docs, or scheduling events.',
      '- NEVER claim to have performed an action. Do NOT say "I\'ve added it to your tasks", "I\'ve exported this", "I\'ve scheduled it", or similar. Tell the user the action is not available right now and suggest they connect the relevant integration in Settings (or use a slash command).',
    ].join('\n');
  }

  const list = tools.map((t) => `- ${t.name}: ${t.description}`).join('\n');
  return [
    '',
    'TOOL USE:',
    '- You have access to the following tools. INVOKE them rather than describing the action in prose.',
    list,
    '- NEVER claim to have performed an action you did not invoke through one of these tools. If a user asks you to do something there is no tool for, say so directly — do not pretend you did it.',
    '- Tool results are real. After a tool call succeeds, summarize what was done using the data returned (e.g. include the URL the tool returned). After a tool call fails, surface the error honestly and ask the user how to proceed.',
    '- Only invoke a tool when the user has clearly asked for that action. Do not silently perform side effects in response to questions.',
  ].join('\n');
}
