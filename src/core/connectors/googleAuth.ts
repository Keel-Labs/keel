/**
 * Google OAuth2 flow for Electron.
 *
 * Uses a loopback redirect (http://localhost:{port}/callback) per Google's
 * recommended flow for desktop apps. The user authenticates in a popup
 * BrowserWindow, and tokens are stored in Keel's sync_state table.
 */

import * as http from 'http';
import * as url from 'url';
import * as crypto from 'crypto';
import { getSyncState, upsertSyncState } from '../db';

const CONNECTOR_KEY = 'google-oauth';

// These are expected to be set by the user in settings.
// For development, placeholder client ID/secret can be used.
export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  scopes: string[];
}

export interface GoogleTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // unix ms
}

/**
 * Start the OAuth2 authorization flow. Opens a BrowserWindow and returns tokens.
 */
export async function startOAuthFlow(
  config: GoogleOAuthConfig,
  BrowserWindow: any // Electron BrowserWindow constructor, passed to avoid importing electron in core
): Promise<GoogleTokens> {
  return new Promise((resolve, reject) => {
    // Start local HTTP server to receive the callback
    const server = http.createServer();
    let port = 0;

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number };
      port = addr.port;
      const redirectUri = `http://127.0.0.1:${port}/callback`;

      // PKCE code verifier/challenge
      const codeVerifier = crypto.randomBytes(32).toString('base64url');
      const codeChallenge = crypto
        .createHash('sha256')
        .update(codeVerifier)
        .digest('base64url');

      const state = crypto.randomBytes(16).toString('hex');

      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      authUrl.searchParams.set('client_id', config.clientId);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('scope', config.scopes.join(' '));
      authUrl.searchParams.set('access_type', 'offline');
      authUrl.searchParams.set('prompt', 'consent');
      authUrl.searchParams.set('state', state);
      authUrl.searchParams.set('code_challenge', codeChallenge);
      authUrl.searchParams.set('code_challenge_method', 'S256');

      // Open auth URL in a popup window
      const authWindow = new BrowserWindow({
        width: 500,
        height: 700,
        title: 'Sign in with Google',
        webPreferences: { nodeIntegration: false, contextIsolation: true },
      });
      authWindow.loadURL(authUrl.toString());

      let resolved = false;

      const cleanup = () => {
        if (!resolved) {
          resolved = true;
          reject(new Error('OAuth flow cancelled'));
        }
        try { server.close(); } catch {}
        try { if (!authWindow.isDestroyed()) authWindow.close(); } catch {}
      };

      authWindow.on('closed', () => {
        if (!resolved) cleanup();
      });

      // Timeout after 5 minutes
      const timeout = setTimeout(cleanup, 5 * 60 * 1000);

      server.on('request', async (req, res) => {
        if (!req.url?.startsWith('/callback')) {
          res.writeHead(404);
          res.end();
          return;
        }

        const parsed = new URL(req.url, `http://127.0.0.1:${port}`);
        const code = parsed.searchParams.get('code');
        const returnedState = parsed.searchParams.get('state');
        const error = parsed.searchParams.get('error');

        if (error || !code || returnedState !== state) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<html><body><h2>Authorization failed</h2><p>You can close this window.</p></body></html>');
          cleanup();
          return;
        }

        // Exchange code for tokens
        try {
          const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              code,
              client_id: config.clientId,
              client_secret: config.clientSecret,
              redirect_uri: redirectUri,
              grant_type: 'authorization_code',
              code_verifier: codeVerifier,
            }),
          });

          const tokenData = await tokenResponse.json() as any;

          if (!tokenData.access_token) {
            throw new Error(tokenData.error_description || 'Token exchange failed');
          }

          const tokens: GoogleTokens = {
            accessToken: tokenData.access_token,
            refreshToken: tokenData.refresh_token || '',
            expiresAt: Date.now() + (tokenData.expires_in || 3600) * 1000,
          };

          resolved = true;
          clearTimeout(timeout);

          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<html><body><h2>Connected to Google!</h2><p>You can close this window and return to Keel.</p></body></html>');

          try { server.close(); } catch {}
          try { if (!authWindow.isDestroyed()) authWindow.close(); } catch {}

          resolve(tokens);
        } catch (err) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<html><body><h2>Authorization failed</h2><p>Please try again.</p></body></html>');
          cleanup();
          reject(err);
        }
      });
    });
  });
}

/**
 * Refresh an expired access token using the refresh token.
 */
export async function refreshAccessToken(
  config: GoogleOAuthConfig,
  refreshToken: string
): Promise<{ accessToken: string; expiresAt: number }> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: 'refresh_token',
    }),
  });

  const data = await response.json() as any;
  if (!data.access_token) {
    throw new Error(data.error_description || 'Token refresh failed');
  }

  return {
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
  };
}

/**
 * Save tokens to sync_state table.
 */
export function saveTokens(brainPath: string, tokens: GoogleTokens): void {
  upsertSyncState(brainPath, CONNECTOR_KEY, {
    status: 'connected',
    meta: JSON.stringify(tokens),
    lastSync: Date.now(),
  });
}

/**
 * Load tokens from sync_state table. Returns null if not connected.
 */
export function loadTokens(brainPath: string): GoogleTokens | null {
  const row = getSyncState(brainPath, CONNECTOR_KEY);
  if (!row?.meta) return null;
  try {
    return JSON.parse(row.meta);
  } catch {
    return null;
  }
}

/**
 * Get a valid access token, refreshing if expired.
 */
export async function getValidAccessToken(
  brainPath: string,
  config: GoogleOAuthConfig
): Promise<string> {
  const tokens = loadTokens(brainPath);
  if (!tokens) throw new Error('Not connected to Google. Please connect in Settings.');

  if (Date.now() < tokens.expiresAt - 60_000) {
    return tokens.accessToken;
  }

  // Token expired — refresh
  const refreshed = await refreshAccessToken(config, tokens.refreshToken);
  const updated: GoogleTokens = {
    ...tokens,
    accessToken: refreshed.accessToken,
    expiresAt: refreshed.expiresAt,
  };
  saveTokens(brainPath, updated);
  return updated.accessToken;
}

/**
 * Disconnect Google (remove tokens).
 */
export function disconnectGoogle(brainPath: string): void {
  upsertSyncState(brainPath, CONNECTOR_KEY, {
    status: 'disconnected',
    meta: null,
    cursor: null,
  });
}

/**
 * Check if Google is connected.
 */
export function isGoogleConnected(brainPath: string): boolean {
  const tokens = loadTokens(brainPath);
  return tokens !== null && tokens.refreshToken !== '';
}
