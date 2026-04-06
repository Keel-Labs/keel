# Cloud & Mobile Architecture (Archived)

This document describes the cloud server, mobile app, and authentication architecture that was removed in favor of a desktop-only (Electron) approach. It is intended as a reference for future reimplementation.

## Overview

Keel originally supported three deployment targets:
1. **Desktop** — Electron app with local SQLite + filesystem storage (retained)
2. **Cloud/Web** — Fastify API server on Fly.io with Postgres storage (removed)
3. **Mobile** — Capacitor-wrapped web app for iOS and Android (removed)

The desktop app used Electron IPC (`window.keel`) for all operations. The web and mobile apps used an HTTP API client (`src/lib/api-client.ts`) that implemented the same `KeelAPI` interface over REST + SSE.

---

## Server (Fly.io)

### Stack
- **Runtime**: Node.js 22 on Fly.io (`app = "keel-ai"`, region `sjc`)
- **Framework**: Fastify with CORS and multipart plugins
- **Database**: Postgres with Drizzle ORM
- **Auth**: JWT (access token: 1h, refresh token: 30d)
- **Deployment**: Dockerfile → `flyctl deploy --remote-only` via GitHub Actions
- **VM**: `shared-cpu-1x`, 512MB RAM

### API Routes
All routes were prefixed with `/api/`:

| Route | Method | Description |
|-------|--------|-------------|
| `/api/health` | GET | Health check |
| `/api/auth/register` | POST | Create account (email + password → JWT pair) |
| `/api/auth/login` | POST | Login (email + password → JWT pair) |
| `/api/auth/refresh` | POST | Refresh access token |
| `/api/settings` | GET/PUT | User settings (provider, API keys, preferences) |
| `/api/chat` | POST | Single-turn chat |
| `/api/chat/stream` | POST | SSE streaming chat |
| `/api/chat/sessions/:id` | GET/PUT | Load/save chat session |
| `/api/chat/sessions/latest` | GET | Get latest session ID |
| `/api/chat/sessions` | GET | List all sessions |
| `/api/brain/files` | GET | List brain files in directory |
| `/api/brain/file` | GET/PUT | Read/write a brain file |
| `/api/reminders` | GET/POST | List/create reminders |
| `/api/reminders/:id` | DELETE | Delete reminder |
| `/api/reminders/:id/fire` | POST | Mark reminder as fired |
| `/api/reminders/due` | GET | Get due reminders |
| `/api/workflows/capture` | POST | Run capture workflow |
| `/api/workflows/daily-brief` | POST | Run daily brief |
| `/api/workflows/eod` | POST | Run end-of-day workflow |
| `/api/team/files` | GET | List team brain files |
| `/api/team/file` | GET/PUT | Read/write team brain file |
| `/api/migrate/*` | POST | Data migration endpoints |

### Postgres Schema (Drizzle ORM)

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `users` | User accounts | id, email, passwordHash, name |
| `user_settings` | Per-user settings | userId, provider, API keys, preferences |
| `brain_files` | User's brain files (replaces local FS) | userId, path, content, hash |
| `chunks` | Search chunks for context assembly | fileId, breadcrumb, content, startLine, endLine |
| `chat_sessions` | Persisted conversations | id, userId, messages (JSONB) |
| `activity_log` | User activity tracking | userId, action, detail |
| `reminders` | Scheduled reminders | userId, message, dueAt, recurring, fired |
| `sync_state` | Connector sync state (Google, etc.) | userId, connector, cursor, lastSync |
| `team_brain_files` | Shared team knowledge | path, content, hash, lastEditedBy |
| `file_uploads` | S3 file references | userId, s3Key, filename, contentType, sizeBytes |

### Fly.io Configuration
```toml
app = "keel-ai"
primary_region = "sjc"
internal_port = 3000
force_https = true
auto_stop_machines = "stop"
auto_start_machines = true
min_machines_running = 1
```

### Environment Variables
- `DATABASE_URL` — Postgres connection string
- `JWT_SECRET` — Token signing secret
- `CORS_ORIGIN` — Allowed origins
- `FLY_API_TOKEN` — Fly.io deploy token (GitHub secret)
- `KEEL_GOOGLE_CLIENT_ID` / `KEEL_GOOGLE_CLIENT_SECRET` — Google OAuth
- `VITE_API_URL` — API base URL for web/mobile builds

---

## Authentication

### Flow
1. User registers or logs in via `AuthScreen` component
2. Server returns JWT access token (1h) + refresh token (30d)
3. Tokens stored in `localStorage` (`keel_access_token`, `keel_refresh_token`)
4. Every API request includes `Authorization: Bearer <accessToken>`
5. On 401, client auto-refreshes using the refresh token
6. If refresh fails, tokens are cleared and `onAuthExpired` callback fires

### Components
- `src/app/components/AuthScreen.tsx` — Login/signup form
- `src/lib/api-client.ts` — Token management (`setTokens`, `loadTokens`, `clearTokens`, `isAuthenticated`, `refreshAccessToken`)
- `server/src/middleware/auth.ts` — JWT signing/verification (`signAccessToken`, `signRefreshToken`, `verifyToken`, `requireAuth` middleware)
- `server/src/routes/auth.ts` — Register/login/refresh endpoints

---

## API Client (`src/lib/api-client.ts`)

The API client implemented the full `KeelAPI` interface (defined in `src/shared/types.ts`) over HTTP:

- **Chat streaming**: SSE (Server-Sent Events) with event types: `chunk`, `thinking`, `thinking_delta`, `done`, `error`
- **Notifications**: Poll-based (30s interval) for due reminders
- **File operations**: REST endpoints for brain file CRUD
- **Routing logic**: `getKeelAPI()` returns `window.keel` (IPC) in Electron, or `apiClient` (HTTP) in web/mobile

---

## Mobile (Capacitor)

### Configuration
- **App ID**: `com.keel.app`
- **Web directory**: `dist/mobile` (built via `vite.mobile.config.ts`)
- **Allowed navigation**: `keel-api.fly.dev`, `*.fly.dev`, `localhost`

### Capacitor Plugins
- `@capacitor/camera` — Photo capture
- `@capacitor/keyboard` — Keyboard resize handling
- `@capacitor/push-notifications` — Push notifications
- `@capacitor/share` — Native share sheet
- `@capacitor/splash-screen` — Launch screen (dark background, 1.5s)
- `@capacitor/status-bar` — Dark status bar style
- `@capacitor/haptics` — Haptic feedback

### Build Scripts
```
npm run build:mobile    # tsc && vite build --config vite.mobile.config.ts
npm run cap:sync        # build + npx cap sync
npm run cap:ios         # build + sync + open Xcode
npm run cap:android     # build + sync + open Android Studio
```

### Mobile UI Components
- `MobileNav` — Bottom tab bar (chat, history, wiki, settings)
- `MobileHistory` — Chat history list view
- `useIsMobile` hook — Viewport width < 768px detection (still used for responsive layout in WikiWorkspace)

### CI Workflows
- `mobile-ios.yml` — Builds iOS app, uses `VITE_API_URL` secret
- `mobile-android.yml` — Builds Android app, uses `VITE_API_URL` secret

---

## CI/CD

### Removed Workflows
| Workflow | Trigger | Action |
|----------|---------|--------|
| `deploy.yml` | Push to `server/**` on main | Build + deploy to Fly.io |
| `mobile-ios.yml` | Push to main | Build iOS Capacitor app |
| `mobile-android.yml` | Push to main | Build Android Capacitor app |
| `ci.yml` (server job) | PR/push to main | Typecheck + build server |

### Retained
- `ci.yml` (desktop job) — Typecheck + build desktop app

---

## Reimplementation Notes

To bring back cloud/mobile support:
1. **Server**: Restore from `archive/server/`. Update Drizzle schema, regenerate migrations. Set up a new Fly.io app or alternative hosting.
2. **Auth**: The JWT flow is self-contained. Restore `AuthScreen`, auth functions in `api-client.ts`, and server auth middleware.
3. **API Client**: Restore the HTTP `apiClient` implementation and the routing logic in `getKeelAPI()`.
4. **Mobile**: Restore from `archive/ios/` and `archive/android/`. Run `npx cap sync`. Restore Capacitor dependencies.
5. **Data migration**: The `server/src/routes/migrate.ts` and `electron/migrate-to-cloud.ts` handle migrating local data to the cloud schema.
