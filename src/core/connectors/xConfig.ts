import { X_SCOPES } from '../../shared/xScopes';

/**
 * Bundled X OAuth public client configuration for Keel.
 *
 * This is a PKCE public client, so the client ID is expected to ship with the app.
 * Users should only need to authorize their account from the desktop UI.
 */
export const X_CLIENT_ID = 'NHZGdUNwS085RGhFcElINTdMYUE6MTpjaQ';
export const X_REDIRECT_URI = 'http://127.0.0.1:43027/callback';

export const X_CONFIG = {
  clientId: X_CLIENT_ID,
  redirectUri: X_REDIRECT_URI,
  scopes: [...X_SCOPES],
};
