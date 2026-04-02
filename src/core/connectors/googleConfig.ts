/**
 * Bundled Google OAuth credentials for Keel.
 *
 * These are "Desktop app" OAuth credentials — the client ID is not a secret
 * in the traditional sense. Google expects native/desktop apps to embed them.
 * The user's data is still protected by the OAuth consent flow.
 *
 * To set up your own:
 * 1. Create a Google Cloud project at console.cloud.google.com
 * 2. Enable Google Calendar API and Google Docs API
 * 3. Create OAuth credentials (Desktop app type)
 * 4. Set the values below
 */

export const GOOGLE_CLIENT_ID = '937899536084-5dl8cvucr9n5blaocbrdqhafktm702dc.apps.googleusercontent.com';
export const GOOGLE_CLIENT_SECRET = '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';

export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/documents',
];
