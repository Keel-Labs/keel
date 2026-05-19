// Magic-link sign-in flow. Proxies through our server's /auth/* routes
// so the desktop doesn't have to embed a Supabase SDK. Same pattern
// the iOS app will use.

import * as tokenStore from './tokenStore';
import { request } from './cloudClient';

export interface VerifyResponse {
  access_token: string;
  refresh_token: string;
  // Supabase emits expires_at as a UNIX timestamp (seconds since epoch).
  expires_at?: number;
  user: { id: string; email?: string };
}

export async function requestMagicLink(baseUrl: string, email: string): Promise<void> {
  await request<{ ok: boolean }>({
    baseUrl,
    method: 'POST',
    path: '/auth/magic-link',
    body: { email },
    auth: false,
  });
}

export async function verifyCode(baseUrl: string, email: string, token: string): Promise<{ email: string }> {
  const response = await request<VerifyResponse>({
    baseUrl,
    method: 'POST',
    path: '/auth/verify',
    body: { email, token },
    auth: false,
  });

  // expires_at is seconds since epoch from Supabase; convert to ms
  // and apply a 60s safety margin so we don't try to use a token that
  // is about to expire mid-request.
  const expiresAtMs = (response.expires_at ?? Math.floor(Date.now() / 1000) + 3600) * 1000 - 60_000;

  tokenStore.save({
    accessToken: response.access_token,
    refreshToken: response.refresh_token,
    email: response.user.email ?? email,
    expiresAt: expiresAtMs,
  });

  return { email: response.user.email ?? email };
}

export function signOut(): void {
  tokenStore.clear();
}

export function currentEmail(): string | null {
  const session = tokenStore.load();
  return session?.email ?? null;
}
