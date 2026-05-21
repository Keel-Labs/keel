import { describe, expect, it } from 'vitest';
import { describeLlmError } from '../llmErrors';

describe('describeLlmError', () => {
  describe('out-of-credits detection', () => {
    it('detects Anthropic 400 "credit balance is too low"', () => {
      // Shape mirrors what @anthropic-ai/sdk throws: APIError with .status,
      // nested .error.error.message, and a synthesized outer .message.
      const err = {
        status: 400,
        name: 'BadRequestError',
        message: '400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API."}}',
        error: {
          error: {
            type: 'invalid_request_error',
            message: 'Your credit balance is too low to access the Anthropic API.',
          },
        },
      };
      const out = describeLlmError(err, 'claude');
      expect(out).toMatch(/out of credits/i);
      expect(out).toMatch(/console\.anthropic\.com/);
    });

    it('detects OpenAI 429 "exceeded your current quota"', () => {
      const err = {
        status: 429,
        name: 'RateLimitError',
        message: '429 You exceeded your current quota, please check your plan and billing details.',
        error: {
          type: 'insufficient_quota',
          message: 'You exceeded your current quota, please check your plan and billing details.',
        },
      };
      const out = describeLlmError(err, 'openai');
      expect(out).toMatch(/out of credits/i);
      expect(out).toMatch(/platform\.openai\.com/);
    });

    it('detects OpenRouter 402 payment required', () => {
      const err = { status: 402, message: 'Insufficient credits' };
      const out = describeLlmError(err, 'openrouter');
      expect(out).toMatch(/out of credits/i);
      expect(out).toMatch(/openrouter\.ai\/credits/);
    });

    it('classifies credit error as credit even when outer message says "fetch failed"', () => {
      // Some SDK / proxy combinations wrap the upstream body inside a
      // generic outer string. We should still land on the credit branch.
      const err = {
        message: 'fetch failed',
        cause: { message: 'Your credit balance is too low.' },
      };
      const out = describeLlmError(err, 'claude');
      expect(out).toMatch(/out of credits/i);
    });
  });

  describe('auth detection', () => {
    it('detects 401 invalid API key', () => {
      const err = { status: 401, message: '401 Incorrect API key provided' };
      const out = describeLlmError(err, 'openai');
      expect(out).toMatch(/rejected your API key/i);
    });
  });

  describe('network detection (no false positives)', () => {
    it('reports a real network error', () => {
      const err = { message: 'fetch failed', cause: { code: 'ENOTFOUND' } };
      const out = describeLlmError(err, 'claude');
      expect(out).toMatch(/Couldn't reach Anthropic/);
    });

    it('routes Ollama connection refused to the Ollama-specific message', () => {
      const err = { message: 'fetch failed', code: 'ECONNREFUSED' };
      const out = describeLlmError(err, 'ollama');
      expect(out).toMatch(/ollama serve/i);
    });
  });

  describe('rate limit', () => {
    it('detects 429 without quota keyword', () => {
      const err = { status: 429, message: 'Too many requests' };
      const out = describeLlmError(err, 'claude');
      expect(out).toMatch(/rate-limited/i);
    });
  });

  describe('fallthrough', () => {
    it('passes unknown errors through with a provider prefix', () => {
      const err = { message: 'something weird happened' };
      const out = describeLlmError(err, 'openai');
      expect(out).toMatch(/OpenAI error:/);
      expect(out).toMatch(/something weird/);
    });
  });
});
