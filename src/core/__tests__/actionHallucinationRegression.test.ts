// Regression suite for issue #62 — "Trust: model claims to take actions it
// can't actually take".
//
// These tests pin the *contract* that prevents fabricated action claims:
//
//   1. The model is always given the schema for every tool that *is* wired up
//      in the current context.
//   2. For prompts that match a real tool, the model has the option to call
//      it and the orchestration loop will execute it.
//   3. For prompts that match NO real tool, the model receives no
//      corresponding schema, so it cannot pretend to invoke one. The expected
//      behavior — enforced by the system prompt and verified here at the
//      orchestration layer — is that no tool is invoked and the assistant
//      replies with a refusal/explanation.
//
// Each case below is one of the four scenarios called out in the issue:
//   - "Export this table to Google Sheets"   → no Sheets tool → refuse
//   - "Add this to my calendar"               → create_calendar_event exists → call it
//   - "Send a Slack message to X"             → no Slack tool → refuse
//   - "Refresh the wiki for me"               → refresh_knowledge_base exists → call it
//
// We do not call a real LLM here. The tests stub the Anthropic SDK and assert
// the orchestration loop's externally observable behavior:
//   - which tools were exposed to the provider
//   - whether the executor was invoked, and with what name
//   - whether the final assistant text matches the expected mode (call result
//     vs. honest refusal)
//
// A live-LLM version of these scenarios would require a provider key and is
// inherently flaky for a default test run. If/when one is added, it should
// be gated behind an env var (e.g. KEEL_LIVE_LLM_TESTS=1) so CI never depends
// on a third-party API.

import { describe, it, expect, vi } from 'vitest';
import { LLMClient, type ToolCallInvocation, type ToolCallResult } from '../llmClient';
import { ALL_TOOLS, getToolByName, getToolsForContext } from '../tools/schemas';

function makeClient(): LLMClient {
  return new LLMClient();
}

/**
 * Stub a single Anthropic `messages.create` round-trip with a canned response,
 * wire it into a fresh LLMClient, and return both the client and the spy.
 */
function stubAnthropic(responses: any[]): {
  client: LLMClient;
  messagesCreate: ReturnType<typeof vi.fn>;
} {
  const client = makeClient();
  const messagesCreate = vi.fn();
  for (const r of responses) messagesCreate.mockResolvedValueOnce(r);
  client._setAnthropicForTesting({ messages: { create: messagesCreate } } as any);
  client.setProvider('claude');
  return { client, messagesCreate };
}

describe('Issue #62 regression — fabricated action claims', () => {
  describe('"Email this to my team" — no email tool exists', () => {
    // The original scenario used Google Sheets, but a spreadsheet tool was
    // added to ALL_TOOLS in the meantime, invalidating the premise. Email
    // is the closest still-genuinely-missing capability.
    it('does not invoke any tool and the model is forced to acknowledge it cannot', async () => {
      const tools = getToolsForContext({ googleConnected: true, xConnected: true });

      // Sanity: there is genuinely no email tool. If a future commit adds
      // one, this assertion will fail and the test author will need to
      // update the regression scenario.
      expect(tools.some((t) => /email|mail/i.test(t.name))).toBe(false);

      const { client, messagesCreate } = stubAnthropic([
        {
          stop_reason: 'end_turn',
          content: [
            {
              type: 'text',
              text:
                "I can't send email — that tool isn't available. " +
                'I can draft the message and you can send it yourself if that helps.',
            },
          ],
        },
      ]);

      const executeTool = vi.fn(async (): Promise<ToolCallResult> => {
        throw new Error('executor must NOT be called when no tool matches');
      });

      const text = await client.chatWithTools(
        [{ role: 'user', content: 'Email this to my team', timestamp: 0 }],
        'system prompt forbidding fabricated actions',
        { tools, executeTool },
      );

      expect(executeTool).not.toHaveBeenCalled();
      expect(messagesCreate).toHaveBeenCalledTimes(1);
      // Must be an explicit refusal, not a claim of success.
      expect(text).toMatch(/can'?t|cannot|isn'?t available|not (yet )?supported/i);
      expect(text).not.toMatch(/i'?ve (sent|emailed|delivered) (an? )?(email|message)/i);
    });
  });

  describe('"Add this to my calendar" — create_calendar_event tool exists when Google is connected', () => {
    it('invokes create_calendar_event and only claims success after the tool returns', async () => {
      const tools = getToolsForContext({ googleConnected: true, xConnected: false });
      expect(tools.some((t) => t.name === 'create_calendar_event')).toBe(true);

      const { client, messagesCreate } = stubAnthropic([
        {
          stop_reason: 'tool_use',
          content: [
            {
              type: 'tool_use',
              id: 'tool_cal_1',
              name: 'create_calendar_event',
              input: {
                summary: 'Coffee with Alex',
                start_time_iso: '2026-05-08T09:00:00-07:00',
                end_time_iso: '2026-05-08T09:30:00-07:00',
              },
            },
          ],
        },
        {
          stop_reason: 'end_turn',
          content: [
            { type: 'text', text: 'Added — Coffee with Alex on Friday at 9am.' },
          ],
        },
      ]);

      const executeTool = vi.fn(async (call: ToolCallInvocation): Promise<ToolCallResult> => ({
        toolUseId: call.id,
        content: 'Event created: https://calendar.google.com/event?eid=abc',
        isError: false,
      }));

      const text = await client.chatWithTools(
        [{ role: 'user', content: 'Add coffee with Alex tomorrow at 9am to my calendar', timestamp: 0 }],
        'system',
        { tools, executeTool },
      );

      expect(executeTool).toHaveBeenCalledTimes(1);
      expect(executeTool.mock.calls[0][0].name).toBe('create_calendar_event');
      expect(text).toMatch(/added|scheduled|created/i);
    });

    it('does not invoke a calendar tool when Google is NOT connected and refuses honestly', async () => {
      const tools = getToolsForContext({ googleConnected: false, xConnected: false });
      // create_calendar_event must be filtered out when Google is disconnected.
      expect(tools.some((t) => t.name === 'create_calendar_event')).toBe(false);

      const { client, messagesCreate } = stubAnthropic([
        {
          stop_reason: 'end_turn',
          content: [
            {
              type: 'text',
              text:
                "I can't add it — Google isn't connected. Connect Google in Settings, " +
                'then ask again.',
            },
          ],
        },
      ]);

      const executeTool = vi.fn(async (): Promise<ToolCallResult> => {
        throw new Error('executor must NOT be called when calendar tool is unavailable');
      });

      const text = await client.chatWithTools(
        [{ role: 'user', content: 'Add this to my calendar', timestamp: 0 }],
        'system',
        { tools, executeTool },
      );

      expect(executeTool).not.toHaveBeenCalled();
      expect(messagesCreate).toHaveBeenCalledTimes(1);
      expect(text).toMatch(/can'?t|cannot|not connected|isn'?t connected/i);
      expect(text).not.toMatch(/i'?ve (added|scheduled|created)/i);
    });
  });

  describe('"Send a Slack message to X" — no Slack tool exists', () => {
    it('does not invoke any tool and refuses honestly rather than claiming the message was sent', async () => {
      const tools = getToolsForContext({ googleConnected: true, xConnected: true });
      expect(tools.some((t) => /slack|discord|teams/i.test(t.name))).toBe(false);

      const { client, messagesCreate } = stubAnthropic([
        {
          stop_reason: 'end_turn',
          content: [
            {
              type: 'text',
              text:
                "I can't send Slack messages — that integration isn't available in Keel. " +
                "I can draft the message text for you to paste.",
            },
          ],
        },
      ]);

      const executeTool = vi.fn(async (): Promise<ToolCallResult> => {
        throw new Error('executor must NOT be called when no Slack tool exists');
      });

      const text = await client.chatWithTools(
        [{ role: 'user', content: 'Send a Slack message to Jamie saying I will be 5 min late', timestamp: 0 }],
        'system',
        { tools, executeTool },
      );

      expect(executeTool).not.toHaveBeenCalled();
      expect(messagesCreate).toHaveBeenCalledTimes(1);
      expect(text).toMatch(/can'?t|cannot|isn'?t available|not (yet )?supported/i);
      expect(text).not.toMatch(/i'?ve (sent|messaged|posted)/i);
    });
  });

  describe('"Refresh the wiki / KB for me" — refresh_knowledge_base tool exists', () => {
    it('invokes refresh_knowledge_base and reports success based on the tool result', async () => {
      const tools = getToolsForContext({ googleConnected: false, xConnected: false });
      expect(tools.some((t) => t.name === 'refresh_knowledge_base')).toBe(true);

      const { client, messagesCreate } = stubAnthropic([
        {
          stop_reason: 'tool_use',
          content: [
            {
              type: 'tool_use',
              id: 'tool_refresh_1',
              name: 'refresh_knowledge_base',
              input: { project_name: 'Social media' },
            },
          ],
        },
        {
          stop_reason: 'end_turn',
          content: [
            { type: 'text', text: 'Refreshed — re-ingested 3 changed files.' },
          ],
        },
      ]);

      const executeTool = vi.fn(async (call: ToolCallInvocation): Promise<ToolCallResult> => ({
        toolUseId: call.id,
        content: 'Re-ingested 3 changed files.',
        isError: false,
      }));

      const text = await client.chatWithTools(
        [{ role: 'user', content: 'Refresh the social media wiki for me', timestamp: 0 }],
        'system',
        { tools, executeTool },
      );

      expect(executeTool).toHaveBeenCalledTimes(1);
      expect(executeTool.mock.calls[0][0].name).toBe('refresh_knowledge_base');
      expect(text).toMatch(/refresh|re-ingest|updated/i);
    });
  });

  describe('Tool surface invariants', () => {
    it('every tool advertised to the model must have a matching dispatch case in the executor (enforced by code review)', () => {
      // We can't import electron/toolExecutor.ts here without booting Electron,
      // so this is a soft invariant: every tool name should be referenced in
      // electron/toolExecutor.ts. The hard check lives in CONTRIBUTING.md.
      // What we *can* assert: every tool has a non-empty schema and description.
      for (const tool of ALL_TOOLS) {
        expect(tool.name).toMatch(/^[a-z_]+$/);
        expect(tool.description.length).toBeGreaterThan(20);
        expect(tool.inputSchema.type).toBe('object');
      }
    });

    it('exposes Google-gated tools only when googleConnected is true', () => {
      const off = getToolsForContext({ googleConnected: false, xConnected: true }).map((t) => t.name);
      const on = getToolsForContext({ googleConnected: true, xConnected: true }).map((t) => t.name);
      expect(off).not.toContain('export_to_google_doc');
      expect(off).not.toContain('create_calendar_event');
      expect(on).toContain('export_to_google_doc');
      expect(on).toContain('create_calendar_event');
    });

    it('exposes X-gated tools only when xConnected is true', () => {
      const off = getToolsForContext({ googleConnected: true, xConnected: false }).map((t) => t.name);
      const on = getToolsForContext({ googleConnected: true, xConnected: true }).map((t) => t.name);
      expect(off).not.toContain('publish_x_post');
      expect(on).toContain('publish_x_post');
    });

    it('regression-pins the set of tools that exist (so adding a capability without a tool will fail loud)', () => {
      const allNames = ALL_TOOLS.map((t) => t.name).sort();
      // If you add or remove a tool, update this list AND the corresponding
      // executor case AND a regression scenario above. The point of pinning
      // this is to force that conversation in code review.
      expect(allNames).toEqual([
        'capture_note',
        'create_calendar_event',
        'create_knowledge_base',
        'create_local_spreadsheet',
        'create_reminder',
        'create_task',
        'export_to_google_doc',
        'export_to_google_sheets',
        'publish_x_post',
        'refresh_knowledge_base',
      ]);

      // And the issue-#62-class hallucinations all map to NON-existent tools:
      expect(getToolByName('create_spreadsheet' as any)).toBeUndefined();
      expect(getToolByName('send_email' as any)).toBeUndefined();
      expect(getToolByName('send_slack_message' as any)).toBeUndefined();
    });
  });
});
