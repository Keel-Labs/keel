import type { XAccountProfile, XPublishRequest, XPublishResult } from '../../shared/types';

const X_CREATE_POST_URL = 'https://api.x.com/2/tweets';
export const X_MAX_POST_LENGTH = 280;

export function normalizeXPostText(text: string): string {
  return text.replace(/\r\n/g, '\n').trim();
}

export function validateXPublishRequest(request: XPublishRequest): string {
  const normalizedText = normalizeXPostText(request.text);
  if (!normalizedText) {
    throw new Error('Write your X post draft before publishing.');
  }
  if (normalizedText.length > X_MAX_POST_LENGTH) {
    throw new Error(`X posts in this slice are limited to ${X_MAX_POST_LENGTH} characters.`);
  }
  return normalizedText;
}

export async function publishXPost(
  accessToken: string,
  account: XAccountProfile | undefined,
  request: XPublishRequest,
): Promise<XPublishResult> {
  const text = validateXPublishRequest(request);
  const response = await fetch(X_CREATE_POST_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text }),
  });

  const payload = await response.json() as {
    data?: { id?: string; text?: string };
    title?: string;
    detail?: string;
    errors?: Array<{ message?: string; detail?: string }>;
  };

  if (!response.ok || !payload.data?.id) {
    const reason = payload.errors?.[0]?.message || payload.errors?.[0]?.detail || payload.detail || payload.title || 'X publish failed.';
    throw new Error(reason);
  }

  return {
    id: payload.data.id,
    url: account?.username
      ? `https://x.com/${account.username}/status/${payload.data.id}`
      : `https://x.com/i/web/status/${payload.data.id}`,
    text: payload.data.text || text,
    publishedAt: Date.now(),
  };
}
