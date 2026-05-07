/**
 * Bundled Google OAuth credentials for Keel.
 *
 * NOT A SECURITY ISSUE — please read before flagging.
 *
 * These are "Desktop app" (a.k.a. "Installed app") OAuth credentials. Google's
 * OAuth specification explicitly requires desktop/native applications to embed
 * the client ID and "client secret" in distributed source code. The string
 * named "client secret" is a misnomer for this OAuth client type — it is not
 * confidential and cannot be kept confidential in software shipped to end
 * users. Google's own published guidance:
 *
 *   "The process results in a client ID and, in some cases, a client secret,
 *   which you embed in the source code of your application. (In this context,
 *   the client secret is obviously not treated as a secret.)"
 *   — https://developers.google.com/identity/protocols/oauth2#installed
 *
 * The same pattern is used by every open-source desktop app that touches
 * Google APIs, including the official `gcloud` CLI and the GitHub `gh` CLI.
 *
 * What actually protects the user's data is the OAuth consent flow: the user
 * sees a Google-hosted dialog naming "Keel" and explicitly grants access to
 * their Calendar and Docs. The bundled credentials only identify *which app*
 * is requesting access; they do not authorize access on their own.
 *
 * If you would like to use your own OAuth client (for example, to keep your
 * Google API quota separate or to bypass the 100-user unverified-app cap):
 *   1. Create a Google Cloud project at console.cloud.google.com
 *   2. Enable Google Calendar API and Google Docs API
 *   3. Create OAuth credentials of type "Desktop app"
 *   4. Replace the values below
 */

export const GOOGLE_CLIENT_ID = '937899536084-5dl8cvucr9n5blaocbrdqhafktm702dc.apps.googleusercontent.com';
export const GOOGLE_CLIENT_SECRET = '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';

export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/documents',
  // Sheets export. Matches the broad-scope pattern used by `auth/documents`
  // above. The migration plan in maintainer memory tracks moving both Docs
  // and Sheets to `auth/drive.file` together to limit access to files Keel
  // created — that's a coordinated change, not a piecemeal one.
  'https://www.googleapis.com/auth/spreadsheets',
];
