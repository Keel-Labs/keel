// Provider-agnostic tool definitions used for LLM tool calling.
//
// Each tool corresponds to an existing IPC action that the assistant can
// invoke on behalf of the user. The schemas are intentionally minimal so
// they translate cleanly to both Anthropic's tool format and the OpenAI
// "function" tool format.
//
// To add a new tool: declare it here AND add a dispatch case in
// electron/toolExecutor.ts. If you skip the executor wiring, the model
// will see the tool and call it but the call will fail at runtime — which
// is still better than the silent hallucination class this exists to fix.

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
}

export interface ToolAvailability {
  googleConnected: boolean;
  xConnected: boolean;
}

export const ALL_TOOLS: readonly ToolDefinition[] = [
  {
    name: 'create_knowledge_base',
    description:
      'Create a knowledge base from the files in a project folder. Use when the user asks to "build a KB", "create a knowledge base", or "ingest a project".',
    inputSchema: {
      type: 'object',
      properties: {
        project_name: {
          type: 'string',
          description: 'Project name or slug (e.g. "App Development", "social-media").',
        },
      },
      required: ['project_name'],
      additionalProperties: false,
    },
  },
  {
    name: 'refresh_knowledge_base',
    description:
      'Re-ingest new or modified files into an existing project knowledge base.',
    inputSchema: {
      type: 'object',
      properties: {
        project_name: {
          type: 'string',
          description: 'Project name or slug.',
        },
      },
      required: ['project_name'],
      additionalProperties: false,
    },
  },
  {
    name: 'create_task',
    description:
      'Append a new task (markdown checklist item) to a tasks file. Use when the user says "add a task", "remind me to do X" framed as a todo, or asks to capture an action item. For one-off time-based reminders, use create_reminder instead.',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'The task text. Plain prose, no leading "[ ]" or bullet — the system formats it.',
        },
        project_slug: {
          type: 'string',
          description:
            'Optional project slug to scope the task to projects/<slug>/tasks.md. Omit to use the top-level tasks.md.',
        },
      },
      required: ['text'],
      additionalProperties: false,
    },
  },
  {
    name: 'create_reminder',
    description:
      'Schedule a one-off or recurring reminder that fires a system notification at the given time.',
    inputSchema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: 'What to remind the user about.',
        },
        due_at_iso: {
          type: 'string',
          description:
            'When the reminder should fire, as an ISO 8601 timestamp (e.g. "2026-05-08T14:00:00-07:00"). Resolve relative phrasing ("tomorrow at 2pm") against the current date/time and timezone provided in the system prompt.',
        },
        recurring: {
          type: 'string',
          enum: ['daily', 'weekly', 'monthly'],
          description: 'Optional. Set only if the user explicitly asks for recurrence.',
        },
      },
      required: ['message', 'due_at_iso'],
      additionalProperties: false,
    },
  },
  {
    name: 'capture_note',
    description:
      'Capture a note, URL, or fragment into the user\'s workspace. The system extracts action items and routes the note to the relevant project.',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'Plain text or a URL to capture.',
        },
      },
      required: ['text'],
      additionalProperties: false,
    },
  },
  // --- Google ---
  {
    name: 'export_to_google_doc',
    description:
      'Create a new Google Doc in the user\'s Drive containing the given Markdown content. Returns the Doc URL. Only call when the user explicitly asks to export, save to Google Docs, or create a doc.',
    inputSchema: {
      type: 'object',
      properties: {
        markdown: {
          type: 'string',
          description: 'Full Markdown content to render into the doc.',
        },
        title: {
          type: 'string',
          description: 'Document title. If omitted, the system derives one from the content.',
        },
      },
      required: ['markdown'],
      additionalProperties: false,
    },
  },
  {
    name: 'create_calendar_event',
    description:
      'Create a Google Calendar event on the user\'s primary calendar.',
    inputSchema: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'Event title.' },
        start_time_iso: {
          type: 'string',
          description: 'Event start as an ISO 8601 timestamp.',
        },
        end_time_iso: {
          type: 'string',
          description: 'Event end as an ISO 8601 timestamp.',
        },
        description: { type: 'string', description: 'Optional event body.' },
        attendees: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional list of attendee email addresses.',
        },
      },
      required: ['summary', 'start_time_iso', 'end_time_iso'],
      additionalProperties: false,
    },
  },
  // --- X ---
  {
    name: 'publish_x_post',
    description:
      'Publish a post (tweet) to X on behalf of the connected account. Only call when the user explicitly asks to publish, post, or tweet.',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'Post body. Must be 280 characters or fewer.',
        },
      },
      required: ['text'],
      additionalProperties: false,
    },
  },
] as const;

export function getToolsForContext(availability: ToolAvailability): ToolDefinition[] {
  return ALL_TOOLS.filter((tool) => {
    if (tool.name === 'export_to_google_doc' || tool.name === 'create_calendar_event') {
      return availability.googleConnected;
    }
    if (tool.name === 'publish_x_post') {
      return availability.xConnected;
    }
    return true;
  });
}

export function getToolByName(name: string): ToolDefinition | undefined {
  return ALL_TOOLS.find((t) => t.name === name);
}
