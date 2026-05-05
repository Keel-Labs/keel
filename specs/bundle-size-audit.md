# Bundle size audit — v0.2 slimming

Status: research / proposal. No code changes yet.
Measured against: `dist-packages/mac-universal/Keel.app` from the v0.1.1 release build.

## Headline

The asar is **not** bloated by node_modules. The 1.5 GB asar contains a **1.43 GB recursive copy of a previous build** at `/dist/mac-arm64/keel.app/Contents/...` — including a nested 999 MB `app.asar`, the Electron Framework binary (170 MB), libvk_swiftshader, locale paks, the lancedb `.node` (91 MB), the canvas `.node` (23 MB), and ffmpeg (43 MB). All duplicated. This is a packaging bug, not a dependency problem.

Fixing just that bug should drop the unpacked `.app` from 2.1 GB to ~700 MB and the DMG from ~1.0 GB to ~300 MB without touching a single dependency.

The rest of the proposal is incremental polish on top of that fix.

## Inventory

`npx asar list ... | size aggregation by top-level path`. Total in asar: **1668 MB across 5698 files**.

Top entries:

| Size | Path |
|---:|---|
| **1432 MB** | `/dist/mac-arm64/keel.app/Contents/...` — recursive prior build (BUG) |
| 91.6 MB | `node_modules/@lancedb/lancedb-darwin-arm64` (the `.node` itself) |
| 43.5 MB | `node_modules/ffmpeg-static` |
| 23.3 MB | `node_modules/@napi-rs/canvas-darwin-arm64` |
| 16.0 MB | `node_modules/pdfjs-dist` |
| 13.4 MB | `node_modules/better-sqlite3` (incl. 8.96 MB of `sqlite3.c` source) |
| 10.0 MB | `node_modules/pdf-parse` |
| 7.0 MB | `node_modules/react-dom` |
| 6.6 MB | `node_modules/jsdom` |
| 4.0 MB | `node_modules/openai` |
| 1.6 MB | `node_modules/@anthropic-ai/sdk` |
| 1.6 MB | `node_modules/mammoth` |
| 1.4 MB | `node_modules/undici` |
| 1.3 MB | `node_modules/css-tree` |
| 1.1 MB | `node_modules/@lancedb/lancedb` (JS wrapper) |

What is **not** present (despite the original suspicion list): no `googleapis`, no `@aws-sdk/*`, no `@anthropic-ai/agent-sdk`, no `@types/*` leak, no `vite`/`vitest`/`typescript` leak. The deps are fine.

Native binaries observation: the universal `.app` only contains `darwin-arm64` `.node` files — no `darwin-x64` slices for lancedb or canvas, and `ffmpeg-static/ffmpeg` is `Mach-O arm64` only. Either Intel Macs are silently broken or `x64ArchFiles` semantics in [electron-builder.config.mjs:37](../electron-builder.config.mjs:37) are inverted. Out of scope for this audit but worth a separate look — fixing it will *add* mass to the universal, so the size targets below assume Intel support is restored (≈ +160 MB for the x64 slices of those native modules).

## How the recursive leak happens

`electron-builder.config.mjs`:

```js
files: ['dist/**/*', 'package.json', '!dist-packages/**/*', '!**/*.map']
```

When building the universal target, electron-builder builds arm64 first, stages the resulting `.app` into a `dist/mac-arm64/` subdirectory (intermediate output, not the configured `dist-packages/` final), then runs the asar packaging step. That step re-evaluates the `files` glob — `dist/**/*` matches the staged `dist/mac-arm64/keel.app/**`, so the entire previously-built per-arch `.app` (including its own asar) gets swallowed into the universal asar. The `dist-packages/**/*` exclusion doesn't help because the staging is in `dist/`, not `dist-packages/`.

Reproduction signal: total asar is 1.67 GB, but only ~232 MB is actual node_modules/source. The remaining 1.43 GB is `/dist/mac-arm64/...`. (Today, `dist/` on disk is only 1.5 MB — the staging is created and deleted inside the build, but it's present at the moment asar is sealed.)

## Proposal

### Quick wins

Ranked by MB-saved-per-line-of-config-change. Estimates assume both arm64 + x64 native modules are correctly bundled in the universal (so today's 2.1 GB is the baseline only because Intel binaries are missing).

1. **Fix the `files` glob to exclude staged builds.** `≈ 1.43 GB` (the headline finding).
   - Current: `'dist/**/*'`
   - Proposed: enumerate exactly what we ship — `'dist/electron/**/*'`, `'dist/renderer/**/*'`, `'dist/mobile/**/*'`, plus `'!dist/mac-*/**'` and `'!dist/builder-*'` as belt-and-suspenders.
   - One-line change. Verify by listing the new asar after a clean `dist:mac` run.

2. **Restrict Electron locale paks to ones we actually ship.** `≈ 30–40 MB`.
   - The Electron Framework ships ~50 `.lproj/locale.pak` files (1–2 MB each). The app appears English-only. Add `electronLanguages: ['en', 'en-GB']` to the `mac` block in electron-builder config.
   - One-line change, no code impact.

3. **Exclude `better-sqlite3` source/build artifacts.** `≈ 9 MB`.
   - 8.96 MB of `sqlite3.c` source is shipped — useless at runtime; only the prebuilt `.node` is needed.
   - Add to `files`: `'!**/node_modules/better-sqlite3/deps/**'`, `'!**/node_modules/better-sqlite3/src/**'`, keep `build/Release/better_sqlite3.node`.

4. **Generic dead-weight excludes.** `≈ 5–10 MB` cumulative.
   - `'!**/node_modules/*/{test,tests,__tests__,docs,doc,example,examples}/**'`
   - `'!**/node_modules/*/*.md'` (READMEs, CHANGELOGs)
   - `'!**/node_modules/*/{.eslintrc*,.prettierrc*,.editorconfig,.npmignore,tsconfig*.json}'`
   - `'!**/node_modules/*/{*.ts,*.tsx,*.map}'` excluding `*.d.ts` only if `vite`/the bundler doesn't reference type files at runtime (it shouldn't).
   - electron-builder has [a default ignore list](https://www.electron.build/configuration#files) that already covers some of these; verify what survives in the new asar before adding more.

**Total quick wins: ~1.48 GB saved.** Universal `.app` drops from 2.1 GB → ~620–660 MB. DMG drops from ~1.0 GB → ~270–310 MB. ~5 lines of config touched, no source changes.

### Riskier changes

5. **Replace `pdf-parse` with a smaller PDF text extractor.** `≈ 30–40 MB`.
   - `pdf-parse` (10 MB) pulls in `pdfjs-dist` (16 MB) + transitively `@napi-rs/canvas` (23 MB native, ×2 for universal). Canvas is needed only for rendering pages to images, not for text extraction. Keel's PDF use is purely text — see [`src/core/workflows/wikiIngest.ts`](../src/core/workflows/wikiIngest.ts) (`PDFParse` import).
   - Options: (a) use `pdfjs-dist` directly via its node entry without the canvas font-rendering path; (b) swap to `unpdf` or similar lightweight node-first extractor.
   - Risk: PDF parsing edge cases regress; needs a small fixture suite. Worth ~50 LOC of work for ~40 MB universal-build savings.

6. **Audit `jsdom` (6.6 MB) usage.** `≈ 4–5 MB`.
   - Used in [`wikiIngest.ts`](../src/core/workflows/wikiIngest.ts) and [`capture.ts`](../src/core/workflows/capture.ts), almost certainly for `@mozilla/readability`. `jsdom` carries a full HTML/CSS engine, css-tree (1.3 MB), tldts, etc. Lighter alternatives: `linkedom` or `parse5` + readability shim. Likely behavior-preserving but needs validation against current fixtures.
   - Modest payoff; defer unless touching that area anyway.

7. **OpenAI SDK (4 MB) — keep.** Used in two places ([`src/core/llmClient.ts`](../src/core/llmClient.ts), [`electron/main.ts`](../electron/main.ts)). At 4 MB it's not worth replacing with hand-rolled fetch calls.

### Don't bother

- **`@lancedb/lancedb-darwin-arm64` (91 MB).** Native vector DB. Load-bearing. No way to slim short of swapping the embedded vector store entirely.
- **`ffmpeg-static` (43 MB).** Required for the whisper audio pipeline. Could be moved out of the bundle and downloaded on first run, but that breaks Keel's offline-by-default promise. Skip.
- **Electron Framework (465 MB universal fat binary).** Chrome+V8+Node, unavoidable. Quick-win #2 trims its locale paks.
- **`@anthropic-ai/sdk` (1.6 MB), `mammoth` (1.6 MB), `undici` (1.4 MB), `react`/`react-dom` (7.2 MB combined).** All in normal range; refactoring cost dwarfs savings.
- **`@types/dompurify` in `dependencies`.** Cosmetic — `@types/*` packages are tiny and don't end up in the runtime JS, but it's a 5-second move to `devDependencies` for hygiene.

## Estimated end state after quick wins (#1–#4)

| Slice | Before | After | Δ |
|---|---:|---:|---:|
| Unpacked `.app` (arm64-only, current) | 2.1 GB | ~620 MB | −71% |
| DMG | ~1.0 GB | ~280 MB | −72% |
| asar | 1.5 GB | ~190 MB | −87% |

Plus #5 (pdf-parse swap) brings the unpacked `.app` to ~580 MB. That's already in the typical range for an Electron app of this complexity, and we stop here.

## Proposed work order for v0.2

1. Land quick win #1 alone first. Cut a build, diff the asar listing, confirm 1.4 GB drop. This is the single highest-leverage change in the project right now — should be its own commit.
2. Investigate the universal-build native-binary issue (separate bug, will *add* x64 slices for lancedb/canvas/ffmpeg, ≈ +160 MB). Numbers above already account for that.
3. Land #2 (`electronLanguages`) and #3 (better-sqlite3 source exclude) together. Trivial.
4. #4 generic excludes — only after the above are baseline; iterate by re-listing asar.
5. Defer #5 (pdf-parse swap) to its own PR with a fixture-based test for the wiki ingest path.
