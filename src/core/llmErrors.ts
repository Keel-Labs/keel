// Maps raw SDK / fetch errors from LLM providers into short, actionable
// messages the user can act on. Defaults to passing the original through
// when we can't recognize the shape — better to show a real message than
// a generic one.

export type LlmProvider = 'claude' | 'openai' | 'openrouter' | 'ollama' | 'telnyx';

interface ErrorShape {
  status?: number;
  message: string;
  code?: string;
  name?: string;
}

function extractShape(err: unknown): ErrorShape {
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>;
    const status =
      typeof e.status === 'number' ? (e.status as number)
      : typeof e.statusCode === 'number' ? (e.statusCode as number)
      : undefined;

    // Provider SDKs wrap their server-side error inside nested .error objects.
    // OpenAI: err.error.message ; Anthropic: err.error.error.message.
    // Pull those out so keyword detection sees the real reason, not just a
    // generic "Connection error" / "fetch failed" outer string.
    const parts: string[] = [];
    if (typeof e.message === 'string') parts.push(e.message);
    const inner1 = e.error as Record<string, unknown> | undefined;
    if (inner1 && typeof inner1 === 'object') {
      if (typeof inner1.message === 'string') parts.push(inner1.message);
      const inner2 = inner1.error as Record<string, unknown> | undefined;
      if (inner2 && typeof inner2 === 'object' && typeof inner2.message === 'string') {
        parts.push(inner2.message);
      }
    }
    const cause = e.cause as Record<string, unknown> | undefined;
    if (cause && typeof cause === 'object' && typeof cause.message === 'string') {
      parts.push(cause.message);
    }
    const message = parts.length > 0 ? parts.join(' | ') : String(err);

    const code = typeof e.code === 'string' ? (e.code as string) : undefined;
    const name = typeof e.name === 'string' ? (e.name as string) : undefined;
    return { status, message, code, name };
  }
  return { message: String(err) };
}

function providerLabel(p?: LlmProvider): string {
  switch (p) {
    case 'claude': return 'Anthropic';
    case 'openai': return 'OpenAI';
    case 'openrouter': return 'OpenRouter';
    case 'ollama': return 'Ollama';
    case 'telnyx': return 'Telnyx';
    default: return 'your AI provider';
  }
}

function billingUrl(p?: LlmProvider): string | null {
  switch (p) {
    case 'claude': return 'https://console.anthropic.com/settings/billing';
    case 'openai': return 'https://platform.openai.com/account/billing/overview';
    case 'openrouter': return 'https://openrouter.ai/credits';
    case 'telnyx': return 'https://telnyx.com/';
    default: return null;
  }
}

export function describeLlmError(err: unknown, provider?: LlmProvider): string {
  const { status, message, code, name } = extractShape(err);
  const label = providerLabel(provider);
  const billing = billingUrl(provider);

  // Account/quota checks run BEFORE the network check. SDKs sometimes wrap
  // server-returned errors in an outer "fetch failed" / "Connection error"
  // string, so we need to inspect the inner message (which extractShape
  // already concatenated) to avoid misclassifying a credit error as a
  // network blip.
  const isCredit =
    status === 402
    || /insufficient[_\s-]?quota|exceeded your current quota|credit balance|low balance|out of (credits|funds)|buy credits|top[\s-]?up|billing|payment required|no credits|credit[s]?\b/i.test(message);

  const isAuth =
    status === 401
    || /invalid[_\s-]api[_\s-]key|incorrect api key|unauthor|authentication.*fail/i.test(message);

  if (isCredit) {
    const where = billing ? ` Add credits at ${billing}.` : '';
    return `Your ${label} account is out of credits.${where}`;
  }

  if (isAuth) {
    return `${label} rejected your API key. Open Settings and double-check the key, or generate a new one.`;
  }

  if (status === 403 || /forbid|permission/i.test(message)) {
    return `${label} refused the request (403). The key may not have access to this model, or your account may be restricted.`;
  }

  if (status === 429 || /rate[_\s-]?limit|too many requests/i.test(message)) {
    return `${label} rate-limited the request. Wait a moment and try again, or switch models in Settings.`;
  }

  // Network-level failures — these are what surface as "Fetch failed" in the
  // browser/undici default error message. Checked AFTER credit/auth so a
  // wrapped server error isn't lost to a generic network message.
  const isNetwork =
    /fetch failed|ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|network|socket hang up|connection error/i.test(message)
    || name === 'FetchError'
    || code === 'ENOTFOUND' || code === 'ECONNREFUSED' || code === 'ECONNRESET'
    || code === 'ETIMEDOUT' || code === 'EAI_AGAIN';

  if (provider === 'ollama' && (isNetwork || /connect|ECONNREFUSED/i.test(message))) {
    return "Couldn't reach Ollama. Make sure Ollama is running locally (ollama serve), then try again.";
  }

  if (isNetwork) {
    return `Couldn't reach ${label}. Check your internet connection and try again.`;
  }

  // Certificate trust issues — common on locked-down corporate networks.
  if (/certificate|self-signed|ERR_CERT|issuer/i.test(message)) {
    return `Network certificate validation failed while contacting ${label}. If you're on a corporate network, install your organization's root certificate, or switch to Ollama for offline use.`;
  }

  if (status === 404 || /model.*(not found|does not exist|unknown)/i.test(message)) {
    return `${label} doesn't recognize the selected model. Pick a different model in Settings.`;
  }

  if (status && status >= 500) {
    return `${label} is having issues right now (HTTP ${status}). Try again in a minute.`;
  }

  // Couldn't classify — pass through, prefixed so the user knows which
  // provider it came from.
  return `${label} error: ${message}`;
}
