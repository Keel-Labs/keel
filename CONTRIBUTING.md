# Contributing to Keel

Thanks for your interest in contributing to Keel! This guide covers both setup for new contributors and repo-specific discipline for maintaining code quality.

## For First-Time Contributors

### Prerequisites

- **Node.js 18+** (check with `node --version`)
- **npm 9+** (check with `npm --version`)
- **Git**
- **macOS, Windows, or Linux** (development on any platform; packaging macOS DMG requires macOS)

### Clone & Install

```bash
git clone https://github.com/Keel-Labs/keel.git
cd keel
npm install
```

### Run Keel in Development

```bash
npm run dev:electron
```

This starts Vite dev server, TypeScript watcher, and Electron window with hot reload.

### Essential Commands

```bash
npm test                 # Run tests once
npm run test:watch      # Run tests in watch mode
npm run build:desktop   # Build renderer + Electron main
```

---

## Internal Working Expectations (For All Contributors)

- Do not work directly on `main`.
- Keep changes narrow and reviewable.
- Prefer behavior changes and refactors in separate commits when practical.
- Treat older product specs as intent documents, not guaranteed implementation truth.
- Report the exact checks you ran before submitting (tests, build, manual verification).

## Codebase Shape

Keel is a local-first Electron desktop app:

- Renderer UI: `src/app/`
- Shared contracts: `src/shared/`
- Desktop boundary: `electron/`
- Core logic, storage, workflows, and connectors: `src/core/`

The repo no longer includes the old server/mobile/cloud-auth runtime as active code. The current contribution baseline is the desktop app plus its local workspace.

## Common Change Areas

| If you need to change... | Start here | Usually also check |
| --- | --- | --- |
| Chat shell or message UI | `src/app/App.tsx`, `src/app/components/Chat.tsx` | `electron/main.ts`, `src/core/contextAssembler.ts` |
| Sidebar or navigation | `src/app/components/Sidebar.tsx` | `src/app/components/DesktopTopBar.tsx`, `src/app/components/WikiWorkspace.tsx` |
| A new desktop action or command | `src/shared/types.ts` | `electron/preload.ts`, `electron/main.ts`, renderer call sites |
| Settings or provider configuration | `src/app/components/Settings.tsx` | `src/core/settings.ts`, `src/core/llmClient.ts` |
| Retrieval or search quality | `src/core/contextAssembler.ts` | `src/core/db.ts`, `src/core/embeddings.ts`, `src/core/vectorStore.ts`, `src/core/reranker.ts` |
| Capture or memory updates | `src/core/workflows/capture.ts` | `src/core/workflows/autoCapture.ts`, `src/core/workflows/memoryExtract.ts` |
| Wiki behavior | `src/core/workflows/wikiBase.ts` | `src/core/workflows/wikiIngest.ts`, `src/core/workflows/wikiMaintenance.ts`, `src/app/components/WikiWorkspace.tsx` |
| Google integrations | `src/core/connectors/googleAuth.ts` | `src/core/connectors/googleCalendar.ts`, `src/core/connectors/googleDocs.ts`, `electron/main.ts` |
| macOS packaging | `electron-builder.config.mjs` | `build/`, `scripts/build-mac-icon.sh`, `package.json` |

## Repo-Specific Gotchas

### IPC changes are multi-file changes

If you add or rename a desktop capability, you usually need to update all of these:

1. `src/shared/types.ts`
2. `electron/preload.ts`
3. `electron/main.ts`
4. the renderer component or hook using `window.keel`

Missing one of those layers is the fastest way to ship a half-wired feature.

### The user's "brain" lives outside the repo

Most durable product data is stored in the configured brain path, not under version control. Be careful not to assume a repo-local fixture when you are changing file layout or data migration logic.

### Retrieval is intentionally hybrid

- SQLite FTS is the reliable floor.
- LanceDB embeddings improve semantic retrieval when available.
- Ollama is used for embeddings and can be unavailable.

If you change retrieval, preserve a useful fallback path.

### Wiki bases have mutable and immutable layers

- `raw/` is the normalized source package layer
- `wiki/`, `outputs/`, and `health/` are generated or curated layers

Do not casually rewrite or repurpose `raw/` files.

### Specs are mixed-purpose

The `specs/` folder now contains:

- current-state contributor docs
- active product specs
- archived reference material

Start at [`specs/README.md`](./specs/README.md) before using a spec as implementation truth.

## Verification Expectations

For most non-trivial changes, run:

```bash
npm test
npm run build:desktop
```

Also run feature-specific validation when relevant:

- wiki changes: exercise base creation, source ingest, compile, and health paths
- provider/settings changes: verify save/load behavior and provider fallback assumptions
- packaging changes: run the relevant packaging command

If you cannot run a check, call that out explicitly in handoff.

## Documentation Discipline

Update docs when you change:

- IPC or renderer-to-main contracts
- workspace layout or storage paths
- contributor workflows
- product surfaces that materially alter how the repo should be understood

At minimum, keep the root [`README.md`](./README.md) and the current-state specs in sync with reality.

---

## Code Style & Conventions

### TypeScript

- Use **strict mode** (no `any`, always type your functions)
- Prefer `const`, then `let` (avoid `var`)
- Use modern syntax (optional chaining `?.`, nullish coalescing `??`)

```typescript
// ✅ Good
interface SettingsUpdate {
  theme?: 'light' | 'dark';
  apiKey?: string;
}

function updateSettings(updates: SettingsUpdate): void {
  const theme = updates.theme ?? settings.theme;
}

// ❌ Avoid
function updateSettings(updates: any): void {
  // ...
}
```

### React Components

- **Functional components only** (no class components)
- Use **hooks** for state and effects
- Props should be typed (no `any`)
- Keep components focused (single responsibility)

### CSS & Styling

- Use **CSS custom properties** (CSS variables) from `docs/UI_STYLE_GUIDE.md`
- BEM-style class names (`component__element--modifier`)

---

## Branch Naming & Commit Messages

### Branch Names

- `feat/` — new feature (`feat/voice-input`)
- `fix/` — bug fix (`fix/chat-context`)
- `docs/` — documentation (`docs/api-reference`)
- `refactor/` — code cleanup (`refactor/llm-client`)
- `chore/` — build, deps, etc. (`chore/upgrade-react`)

### Commits

```
feat(chat): add voice input to message composer

- Add mic button to chat input bar
- Reuse existing whisper transcription pipeline
- Add voice state management (recording, transcribing, idle)
```

**Rules:**
- First line: `type(scope): description` (under 70 chars)
- Blank line, then body
- Explain the *why*, not the *what*
- Reference issues: `Fixes #123` or `Relates to #456`

---

## Testing

### Running Tests

```bash
npm test              # Run all tests once
npm run test:watch   # Watch mode
```

### Writing Tests

Tests live in `src/**/__tests__/` and use **Vitest**.

**Example:**
```typescript
// src/core/__tests__/fileManager.test.ts
import { describe, it, expect } from 'vitest';
import { FileManager } from '../fileManager';

describe('FileManager', () => {
  it('should read a file', async () => {
    const fm = new FileManager('/tmp');
    const content = await fm.readFile('test.txt');
    expect(content).toBe('Hello');
  });
});
```

**Guidelines:**
- Test critical paths: auth, storage, retrieval, chat
- Keep tests focused and fast
- Mock external dependencies when appropriate

---

## Common Development Tasks

### Adding a Settings Option

1. Add field to `Settings` interface (`src/shared/types.ts`)
2. Add default in `src/core/settings.ts`
3. Add UI control in `src/app/components/Settings.tsx`
4. Wire up `window.keel.saveSettings()` call

### Adding a Chat Slash Command

1. Add to `COMMANDS` list in `Chat.tsx`
2. Implement handler in switch statement
3. Update system prompt in `contextAssembler.ts` to document it
4. Add IPC handler in `electron/main.ts` if needed

### Adding an IPC Method

1. **Update type definition** (`src/shared/types.ts` — `KeelAPI` interface)
2. **Update preload bridge** (`electron/preload.ts` — expose method)
3. **Update main handler** (`electron/main.ts` — implement)
4. **Update API docs** (`docs/API.md`)

---

## Security Considerations

- **Never log sensitive data** (API keys, passwords, full chat history)
- **Validate all user input** before file operations or shell commands
- **Don't trust IPC data** from renderer — validate in main process
- **Use environment variables** for secrets (never hardcode)
- **No hardcoded API keys or tokens** anywhere in the codebase

---

## Submitting a Pull Request

1. **Sync with main:**
   ```bash
   git fetch origin
   git rebase origin/main
   ```

2. **Run checks:**
   ```bash
   npm test
   npm run build:desktop
   npm run dev:electron  # Manual testing
   ```

3. **Push and create PR:**
   ```bash
   git push origin your-branch-name
   ```

4. **PR description should include:**
   - What problem does this solve?
   - How does it work?
   - Testing notes
   - Screenshots (if UI changes)

---

## Getting Help

- **Questions?** [GitHub Discussions](https://github.com/Keel-Labs/keel/discussions)
- **Bug report?** [GitHub Issues](https://github.com/Keel-Labs/keel/issues)
- **Feature request?** [Fider Board](https://keel.fider.io)
- **Contact:** medha.ghati@gmail.com

---

## Before You Submit

Checklist:

- [ ] Code follows style guide
- [ ] `npm test` passes
- [ ] `npm run build:desktop` succeeds
- [ ] App runs in dev mode
- [ ] Commit messages are clear
- [ ] PR description explains the change
- [ ] No hardcoded secrets
- [ ] Docs updated (README, API docs, etc.)

---

## License

By contributing, you agree your contributions are licensed under the [MIT License](./LICENSE).

Thanks for making Keel better!
