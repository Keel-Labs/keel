/**
 * Google Limited Use policy enforcement.
 *
 * Google's API Services User Data Policy prohibits transferring data
 * obtained via Google APIs to services whose terms reserve the right
 * to train generalized AI models on that data. OpenRouter's TOS does
 * so today, which is why Google rejected our OAuth verification with
 * the architecture in v0.1.0.
 *
 * This module is the single source of truth for "which LLM providers
 * are allowed to coexist with a connected Google account." It is
 * imported by Onboarding (for provider labels), Settings → Connect
 * Google (gate before OAuth), and Settings → Change Model (gate
 * before provider switch).
 *
 * Allowlist criteria: provider's commercial terms must explicitly
 * disclaim using API-submitted data to train generalized models by
 * default. As of 2026-05:
 *   - claude (Anthropic API): no training on API data, no opt-out needed
 *   - openai (OpenAI API):    no training on API data, no opt-out needed
 *   - ollama (local):         data never leaves the machine
 *   - telnyx (Telnyx Inference API): no training on API data, no opt-out needed
 *   - openrouter:             reserves training rights — NOT compatible
 *
 * Re-evaluate this list any time a new provider is added.
 */

import type { Settings } from '../shared/types';

export type Provider = Settings['provider'];

export const GOOGLE_COMPATIBLE_PROVIDERS: ReadonlySet<Provider> = new Set<Provider>([
  'claude',
  'openai',
  'ollama',
  'telnyx',
]);

/**
 * Human-readable rationale shown in confirmation modals. Keep the
 * wording precise — Google reviewers may screenshot this when checking
 * our segregation claim.
 */
export const POLICY_RATIONALE =
  "Keel keeps Google Calendar and Docs data isolated from LLM providers whose terms allow training on submitted data. OpenRouter's terms reserve this right, so we don't allow Google data to flow through it.";

export function isGoogleCompatible(provider: Provider): boolean {
  return GOOGLE_COMPATIBLE_PROVIDERS.has(provider);
}

/**
 * Can the user initiate Google OAuth right now? Disallowed when the
 * active LLM provider isn't on the allowlist — the UI should offer a
 * one-click switch instead of silently blocking.
 */
export function canConnectGoogle(provider: Provider): { ok: true } | { ok: false; reason: string } {
  if (isGoogleCompatible(provider)) return { ok: true };
  return {
    ok: false,
    reason: `${providerLabel(provider)} is not compatible with Google integration. ${POLICY_RATIONALE}`,
  };
}

/**
 * Can the user switch to `nextProvider` given current Google state?
 * Symmetric guard — without this, the OpenRouter gate is trivially
 * bypassed by switching providers post-OAuth.
 */
export function canSwitchProvider(
  nextProvider: Provider,
  googleConnected: boolean,
): { ok: true } | { ok: false; reason: string; requiresGoogleDisconnect: true } {
  if (!googleConnected) return { ok: true };
  if (isGoogleCompatible(nextProvider)) return { ok: true };
  return {
    ok: false,
    reason: `Switching to ${providerLabel(nextProvider)} requires disconnecting Google. ${POLICY_RATIONALE}`,
    requiresGoogleDisconnect: true,
  };
}

export function providerLabel(provider: Provider): string {
  switch (provider) {
    case 'claude': return 'Anthropic (Claude)';
    case 'openai': return 'OpenAI';
    case 'openrouter': return 'OpenRouter';
    case 'ollama': return 'Ollama (local)';
    case 'telnyx': return 'Telnyx Inference';
  }
}

/**
 * Recommended default when we need to force a switch. Picks the
 * compatible provider the user has most plausibly already configured;
 * Claude first since it's the default for fresh installs.
 */
export function suggestCompatibleProvider(settings: Settings): Provider {
  if (settings.anthropicApiKey) return 'claude';
  if (settings.openaiApiKey) return 'openai';
  if (settings.ollamaModel) return 'ollama';
  return 'claude';
}
