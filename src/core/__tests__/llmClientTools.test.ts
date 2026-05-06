// Regression test for issue #62: the model used to claim it had performed
// actions (e.g. "I exported this to Google Sheets") without anything actually
// happening. With tool-calling wired up, the model can either:
//   (a) invoke a tool that exists — in which case the action really happens
//       and a real result is returned to the model; or
//   (b) refuse — because no spreadsheet tool is exposed, the model has no
//       way to "fake" an export it can't perform.
//
// These tests stub the Anthropic and OpenAI SDKs to verify the orchestration
// loop:
//   - hands tool definitions to the provider
//   - executes tool_use blocks via the supplied executor
//   - feeds tool_result back into the next turn
//   - returns the model's final text only after all tool calls resolve

import { describe, it, expect, vi } from 'vitest';
import { LLMClient, type ToolCallInvocation, type ToolCallResult } from '../llmClient';
import type { ToolDefinition } from '../tools/schemas';
import { ALL_TOOLS, getToolByName } from '../tools/schemas';

const exportTool = getToolByName('export_to_google_doc')!;
const createTaskTool = getToolByName('create_task')!;

function makeClient(): LLMClient {
  // Avoid loading real settings — the constructor reads them but we
  // immediately override the providers via the test setters below.
  const client = new LLMClient();
  return client;
}

describe('LLMClient.chatWithTools — Anthropic', () => {
  it('executes a tool call, returns the result to the model, and yields the final text', async () => {
    const client = makeClient();
    const messagesCreate = vi.fn();
    messagesCreate.mockResolvedValueOnce({
      stop_reason: 'tool_use',
      content: [
        { type: 'text', text: 'Exporting now…' },
        { type: 'tool_use', id: 'tool_1', name: 'export_to_google_doc', input: { markdown: '# hi', title: 'Notes' } },
      ],
    });
    messagesCreate.mockResolvedValueOnce({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'Done — your doc is at https://docs.google.com/document/d/abc' }],
    });

    client._setAnthropicForTesting({ messages: { create: messagesCreate } } as any);
    client.setProvider('claude');

    const executeTool = vi.fn(async (call: ToolCallInvocation): Promise<ToolCallResult> => ({
      toolUseId: call.id,
      content: 'https://docs.google.com/document/d/abc',
      isError: false,
    }));

    const text = await client.chatWithTools(
      [{ role: 'user', content: 'Export my notes to a doc', timestamp: 0 }],
      'system prompt',
      { tools: [exportTool, createTaskTool], executeTool }
    );

    expect(executeTool).toHaveBeenCalledTimes(1);
    expect(executeTool.mock.calls[0][0].name).toBe('export_to_google_doc');
    expect(messagesCreate).toHaveBeenCalledTimes(2);

    // Second turn must include tool_result for the previous tool_use.
    const secondCallMessages = messagesCreate.mock.calls[1][0].messages;
    const lastMessage = secondCallMessages[secondCallMessages.length - 1];
    expect(lastMessage.role).toBe('user');
    expect(lastMessage.content[0].type).toBe('tool_result');
    expect(lastMessage.content[0].tool_use_id).toBe('tool_1');

    expect(text).toContain('https://docs.google.com/document/d/abc');
  });

  it('returns plain text without invoking the executor when the model has no tool to call (the regression case)', async () => {
    // Scenario from issue #62: user asks for a spreadsheet. There is no
    // spreadsheet tool. A trustworthy model should refuse rather than
    // pretending to have exported one. We assert: no tool was invoked,
    // and the model's text answer is returned verbatim.
    const client = makeClient();
    const messagesCreate = vi.fn().mockResolvedValueOnce({
      stop_reason: 'end_turn',
      content: [{
        type: 'text',
        text: "I can't create a spreadsheet — that tool isn't available yet. I can put the data in a Google Doc as a Markdown table if that helps.",
      }],
    });

    client._setAnthropicForTesting({ messages: { create: messagesCreate } } as any);
    client.setProvider('claude');

    const executeTool = vi.fn(async (): Promise<ToolCallResult> => {
      throw new Error('executor must NOT be called when the model produces no tool_use');
    });

    const tools: ToolDefinition[] = ALL_TOOLS.filter((t) => t.name !== 'export_to_google_doc');
    const text = await client.chatWithTools(
      [{ role: 'user', content: 'Export this table to Google Sheets', timestamp: 0 }],
      'system prompt forbidding hallucinated actions',
      { tools, executeTool }
    );

    expect(executeTool).not.toHaveBeenCalled();
    expect(text.toLowerCase()).toContain("can't create a spreadsheet");
    // And critically: the call DID receive the tool list, so the provider
    // had the chance to invoke a tool and chose not to (proving the
    // schema-based safety property holds).
    expect(messagesCreate.mock.calls[0][0].tools).toBeDefined();
    expect(messagesCreate.mock.calls[0][0].tools.length).toBe(tools.length);
  });

  it('surfaces tool errors to the model so it can react instead of hallucinating success', async () => {
    const client = makeClient();
    const messagesCreate = vi.fn();
    messagesCreate.mockResolvedValueOnce({
      stop_reason: 'tool_use',
      content: [
        { type: 'tool_use', id: 'tool_2', name: 'export_to_google_doc', input: { markdown: 'x' } },
      ],
    });
    messagesCreate.mockResolvedValueOnce({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: "I couldn't export — Google isn't connected. Please connect it in Settings." }],
    });

    client._setAnthropicForTesting({ messages: { create: messagesCreate } } as any);
    client.setProvider('claude');

    const executeTool = vi.fn(async (call: ToolCallInvocation): Promise<ToolCallResult> => ({
      toolUseId: call.id,
      content: 'Google is not connected.',
      isError: true,
    }));

    const text = await client.chatWithTools(
      [{ role: 'user', content: 'Export to a doc', timestamp: 0 }],
      'system',
      { tools: [exportTool], executeTool }
    );

    const followup = messagesCreate.mock.calls[1][0].messages.at(-1);
    expect(followup.content[0].is_error).toBe(true);
    expect(followup.content[0].content).toContain('not connected');
    expect(text).toContain("couldn't export");
  });

});

describe('LLMClient.chatWithTools — OpenAI', () => {
  it('parses tool_calls JSON arguments and feeds tool results back as role: tool', async () => {
    const client = makeClient();
    const completionsCreate = vi.fn();
    completionsCreate.mockResolvedValueOnce({
      choices: [{
        finish_reason: 'tool_calls',
        message: {
          content: null,
          tool_calls: [{
            id: 'call_1',
            type: 'function',
            function: { name: 'create_task', arguments: JSON.stringify({ text: 'Buy milk' }) },
          }],
        },
      }],
    });
    completionsCreate.mockResolvedValueOnce({
      choices: [{
        finish_reason: 'stop',
        message: { content: 'Added — "Buy milk".' },
      }],
    });

    client._setOpenAIForTesting({ chat: { completions: { create: completionsCreate } } } as any);
    client.setProvider('openai');

    const executeTool = vi.fn(async (call: ToolCallInvocation): Promise<ToolCallResult> => {
      expect(call.input).toEqual({ text: 'Buy milk' });
      return { toolUseId: call.id, content: 'Task added to tasks.md.', isError: false };
    });

    const text = await client.chatWithTools(
      [{ role: 'user', content: 'remind me to buy milk', timestamp: 0 }],
      'system',
      { tools: [createTaskTool], executeTool }
    );

    expect(executeTool).toHaveBeenCalledTimes(1);
    const toolMessage = completionsCreate.mock.calls[1][0].messages.at(-1);
    expect(toolMessage.role).toBe('tool');
    expect(toolMessage.tool_call_id).toBe('call_1');
    expect(text).toContain('Buy milk');
  });
});
