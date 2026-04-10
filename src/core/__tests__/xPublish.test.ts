import { afterEach, describe, expect, it, vi } from 'vitest';
import { publishXPost, validateXPublishRequest, X_MAX_POST_LENGTH } from '../connectors/xPublish';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('validateXPublishRequest', () => {
  it('trims and validates post text', () => {
    expect(validateXPublishRequest({ text: '  hello world  ' })).toBe('hello world');
  });

  it('rejects posts over the current text limit', () => {
    expect(() => validateXPublishRequest({ text: 'x'.repeat(X_MAX_POST_LENGTH + 1) })).toThrow(
      `${X_MAX_POST_LENGTH} characters`,
    );
  });
});

describe('publishXPost', () => {
  it('posts text to X and returns the created post URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          id: '12345',
          text: 'hello world',
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await publishXPost('token', { id: 'acct-1', username: 'keel', name: 'Keel' }, { text: ' hello world ' });

    expect(fetchMock).toHaveBeenCalledWith('https://api.x.com/2/tweets', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        Authorization: 'Bearer token',
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify({ text: 'hello world' }),
    }));
    expect(result.id).toBe('12345');
    expect(result.url).toBe('https://x.com/keel/status/12345');
    expect(result.text).toBe('hello world');
  });

  it('surfaces API error details when publish fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({
        detail: 'tweet.write permission missing',
      }),
    }));

    await expect(publishXPost('token', { id: 'acct-1', username: 'keel' }, { text: 'hello world' })).rejects.toThrow(
      'tweet.write permission missing',
    );
  });
});
