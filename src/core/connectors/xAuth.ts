import * as http from 'http';
import * as crypto from 'crypto';
import { getSyncState, upsertSyncState } from '../db';
import type { XAccountProfile, XStatus } from '../../shared/types';

const CONNECTOR_KEY = 'x-oauth';
const X_AUTHORIZE_URL = 'https://x.com/i/oauth2/authorize';
const X_TOKEN_URL = 'https://api.x.com/2/oauth2/token';
const X_REVOKE_URL = 'https://api.x.com/2/oauth2/revoke';
const X_ME_URL = 'https://api.x.com/2/users/me';

export const X_SCOPES = ['tweet.read', 'users.read', 'bookmark.read', 'offline.access'];

export interface XOAuthConfig {
  clientId: string;
  scopes?: string[];
}

export interface XTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scope?: string;
  account?: XAccountProfile;
}

interface XConnectorMeta {
  tokens?: XTokens | null;
  lastError?: string;
  targetBasePath?: string;
  targetBaseTitle?: string;
}

export async function startXOAuthFlow(
  config: XOAuthConfig,
  BrowserWindow: any,
): Promise<XTokens> {
  return new Promise((resolve, reject) => {
    const server = http.createServer();

    server.listen(0, '127.0.0.1', () => {
      const address = server.address() as { port: number };
      const redirectUri = `http://127.0.0.1:${address.port}/callback`;
      const state = crypto.randomBytes(16).toString('hex');
      const codeVerifier = crypto.randomBytes(32).toString('base64url');
      const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

      const authUrl = new URL(X_AUTHORIZE_URL);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('client_id', config.clientId);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('scope', (config.scopes || X_SCOPES).join(' '));
      authUrl.searchParams.set('state', state);
      authUrl.searchParams.set('code_challenge', codeChallenge);
      authUrl.searchParams.set('code_challenge_method', 'S256');

      const authWindow = new BrowserWindow({
        width: 500,
        height: 720,
        title: 'Connect X',
        webPreferences: { nodeIntegration: false, contextIsolation: true },
      });
      authWindow.loadURL(authUrl.toString());

      let finished = false;
      const timeout = setTimeout(() => cleanup(new Error('X authorization timed out.')), 5 * 60 * 1000);

      function cleanup(error?: Error) {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        try { server.close(); } catch {}
        try { if (!authWindow.isDestroyed()) authWindow.close(); } catch {}
        if (error) reject(error);
      }

      authWindow.on('closed', () => {
        cleanup(new Error('X authorization was cancelled.'));
      });

      server.on('request', async (req, res) => {
        if (!req.url?.startsWith('/callback')) {
          res.writeHead(404);
          res.end();
          return;
        }

        const callbackUrl = new URL(req.url, redirectUri);
        const code = callbackUrl.searchParams.get('code');
        const returnedState = callbackUrl.searchParams.get('state');
        const error = callbackUrl.searchParams.get('error');

        if (error || !code || returnedState !== state) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<html><body><h2>X authorization failed</h2><p>You can close this window and return to Keel.</p></body></html>');
          cleanup(new Error(error || 'Invalid X authorization callback.'));
          return;
        }

        try {
          const tokenResponse = await fetch(X_TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              code,
              grant_type: 'authorization_code',
              client_id: config.clientId,
              redirect_uri: redirectUri,
              code_verifier: codeVerifier,
            }),
          });

          const tokenData = await tokenResponse.json() as Record<string, any>;
          if (!tokenResponse.ok || !tokenData.access_token) {
            throw new Error((tokenData.error_description as string) || (tokenData.error as string) || 'X token exchange failed.');
          }

          const account = await fetchAuthenticatedUser(tokenData.access_token as string);
          const tokens: XTokens = {
            accessToken: tokenData.access_token as string,
            refreshToken: (tokenData.refresh_token as string) || '',
            expiresAt: Date.now() + Number(tokenData.expires_in || 7200) * 1000,
            scope: tokenData.scope as string | undefined,
            account,
          };

          finished = true;
          clearTimeout(timeout);
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<html><body><h2>Connected to X</h2><p>You can close this window and return to Keel.</p></body></html>');
          try { server.close(); } catch {}
          try { if (!authWindow.isDestroyed()) authWindow.close(); } catch {}
          resolve(tokens);
        } catch (err) {
          const message = err instanceof Error ? err.message : 'X authorization failed.';
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`<html><body><h2>X authorization failed</h2><p>${escapeHtml(message)}</p></body></html>`);
          cleanup(err instanceof Error ? err : new Error(message));
        }
      });
    });
  });
}

export async function refreshXAccessToken(
  config: XOAuthConfig,
  refreshToken: string,
): Promise<{ accessToken: string; expiresAt: number }> {
  const response = await fetch(X_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
      client_id: config.clientId,
    }),
  });

  const data = await response.json() as Record<string, any>;
  if (!response.ok || !data.access_token) {
    throw new Error((data.error_description as string) || (data.error as string) || 'X token refresh failed.');
  }

  return {
    accessToken: data.access_token as string,
    expiresAt: Date.now() + Number(data.expires_in || 7200) * 1000,
  };
}

export async function fetchAuthenticatedUser(accessToken: string): Promise<XAccountProfile> {
  const response = await fetch(X_ME_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const payload = await response.json() as { data?: { id: string; username: string; name?: string }; title?: string; detail?: string };
  if (!response.ok || !payload.data?.id) {
    throw new Error(payload.detail || payload.title || 'Failed to resolve the authenticated X account.');
  }

  return {
    id: payload.data.id,
    username: payload.data.username,
    name: payload.data.name,
  };
}

export function saveXTokens(brainPath: string, tokens: XTokens, updates?: { targetBasePath?: string; targetBaseTitle?: string }): void {
  const meta = loadConnectorMeta(brainPath);
  const state = getSyncState(brainPath, CONNECTOR_KEY);
  const nextMeta: XConnectorMeta = {
    ...meta,
    tokens,
    lastError: undefined,
    targetBasePath: updates?.targetBasePath ?? meta.targetBasePath,
    targetBaseTitle: updates?.targetBaseTitle ?? meta.targetBaseTitle,
  };

  upsertSyncState(brainPath, CONNECTOR_KEY, {
    status: 'connected',
    lastSync: state?.lastSync ?? undefined,
    meta: JSON.stringify(nextMeta),
  });
}

export function loadXTokens(brainPath: string): XTokens | null {
  return loadConnectorMeta(brainPath).tokens || null;
}

export async function getValidXAccessToken(brainPath: string, config: XOAuthConfig): Promise<string> {
  const tokens = loadXTokens(brainPath);
  if (!tokens) {
    throw new Error('Not connected to X. Add a Client ID and connect the account first.');
  }

  if (Date.now() < tokens.expiresAt - 60_000) {
    return tokens.accessToken;
  }

  if (!tokens.refreshToken) {
    throw new Error('The X session has expired and no refresh token is available. Reconnect the account.');
  }

  const refreshed = await refreshXAccessToken(config, tokens.refreshToken);
  const nextTokens: XTokens = {
    ...tokens,
    accessToken: refreshed.accessToken,
    expiresAt: refreshed.expiresAt,
  };
  saveXTokens(brainPath, nextTokens);
  return nextTokens.accessToken;
}

export async function revokeXToken(config: XOAuthConfig, token: string): Promise<void> {
  await fetch(X_REVOKE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      token,
      client_id: config.clientId,
    }),
  }).catch(() => undefined);
}

export async function disconnectX(brainPath: string, config?: XOAuthConfig): Promise<void> {
  const tokens = loadXTokens(brainPath);
  if (tokens && config) {
    await revokeXToken(config, tokens.refreshToken || tokens.accessToken).catch(() => undefined);
  }

  const meta = loadConnectorMeta(brainPath);
  upsertSyncState(brainPath, CONNECTOR_KEY, {
    status: 'disconnected',
    cursor: null,
    meta: JSON.stringify({
      ...meta,
      tokens: null,
      lastError: undefined,
    }),
  });
}

export function recordXSyncTarget(brainPath: string, basePath: string, baseTitle: string): void {
  const state = getSyncState(brainPath, CONNECTOR_KEY);
  const meta = loadConnectorMeta(brainPath);
  upsertSyncState(brainPath, CONNECTOR_KEY, {
    status: state?.status || 'connected',
    lastSync: state?.lastSync ?? undefined,
    meta: JSON.stringify({
      ...meta,
      targetBasePath: basePath,
      targetBaseTitle: baseTitle,
    }),
  });
}

export function recordXSyncError(brainPath: string, message: string): void {
  const state = getSyncState(brainPath, CONNECTOR_KEY);
  const meta = loadConnectorMeta(brainPath);
  upsertSyncState(brainPath, CONNECTOR_KEY, {
    status: 'error',
    lastSync: state?.lastSync ?? undefined,
    meta: JSON.stringify({
      ...meta,
      lastError: message,
    }),
  });
}

export function setXSyncing(brainPath: string): void {
  const state = getSyncState(brainPath, CONNECTOR_KEY);
  const meta = loadConnectorMeta(brainPath);
  upsertSyncState(brainPath, CONNECTOR_KEY, {
    status: 'syncing',
    lastSync: state?.lastSync ?? undefined,
    meta: JSON.stringify({
      ...meta,
      lastError: undefined,
    }),
  });
}

export function recordXSyncSuccess(brainPath: string): void {
  const state = getSyncState(brainPath, CONNECTOR_KEY);
  const meta = loadConnectorMeta(brainPath);
  upsertSyncState(brainPath, CONNECTOR_KEY, {
    status: 'connected',
    lastSync: Date.now(),
    meta: JSON.stringify({
      ...meta,
      lastError: undefined,
    }),
  });
}

export function getXStatus(brainPath: string, clientId: string): XStatus {
  const state = getSyncState(brainPath, CONNECTOR_KEY);
  const meta = loadConnectorMeta(brainPath);
  const connected = !!meta.tokens?.accessToken;

  return {
    configured: !!clientId.trim(),
    connected,
    clientId: clientId || undefined,
    account: meta.tokens?.account,
    lastSyncAt: state?.lastSync ?? undefined,
    status: mapXStatus(state?.status, connected),
    error: meta.lastError,
    targetBasePath: meta.targetBasePath,
    targetBaseTitle: meta.targetBaseTitle,
  };
}

export function isXConnected(brainPath: string): boolean {
  const tokens = loadXTokens(brainPath);
  return !!tokens?.accessToken;
}

function loadConnectorMeta(brainPath: string): XConnectorMeta {
  const row = getSyncState(brainPath, CONNECTOR_KEY);
  if (!row?.meta) return {};
  try {
    return JSON.parse(row.meta) as XConnectorMeta;
  } catch {
    return {};
  }
}

function mapXStatus(status: string | undefined, connected: boolean): XStatus['status'] {
  if (status === 'syncing' || status === 'error' || status === 'connected' || status === 'disconnected') {
    return status;
  }
  return connected ? 'connected' : 'idle';
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
