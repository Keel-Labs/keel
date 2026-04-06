# Mac DMG Packaging For Keel

## Goal

Package the Electron desktop app as a Mac installer that is easy for non-technical users to download, open, and install on both Intel and Apple Silicon Macs.

For this project, "easy to use" means:

- one obvious download path for most users
- drag-to-Applications install flow
- no Terminal steps
- no scary unsigned-app warnings beyond normal first-open confirmation
- successful launch on both Apple Silicon and Intel hardware

## Current State

Keel already has an Electron desktop surface:

- Electron main process in [electron/main.ts](/Users/djsam/.codex/worktrees/20fe/Keel/electron/main.ts)
- Electron preload bridge in [electron/preload.ts](/Users/djsam/.codex/worktrees/20fe/Keel/electron/preload.ts)
- Desktop entrypoint and build scripts in [package.json](/Users/djsam/.codex/worktrees/20fe/Keel/package.json)

What is missing today:

- no Mac packaging config
- no DMG target
- no app signing setup
- no notarization flow
- no architecture strategy for Intel vs Apple Silicon

## Packaging Model

The `DMG` is only the delivery container. The actual compatibility question is the `.app` inside the DMG.

There are two viable ways to distribute Keel on macOS:

### Option A: One Universal DMG

Ship one `Keel.dmg` that contains a universal `Keel.app`.

The app bundle includes:

- a universal Electron binary
- universal native modules where required
- the packaged renderer and preload files

Pros:

- best user experience
- one download link
- no architecture choice required by the user
- simplest release messaging

Cons:

- larger download size
- stricter requirements for native dependencies
- more signing and packaging complexity

### Option B: Two Separate DMGs

Ship:

- `Keel-mac-arm64.dmg`
- `Keel-mac-x64.dmg`

Pros:

- simpler fallback if universal packaging is blocked
- smaller per-download artifact
- easier to diagnose architecture-specific issues

Cons:

- worse user experience
- users must choose the right file
- more room for support mistakes

## Recommendation

Recommend Option A as the default product decision:

- publish a universal signed and notarized DMG
- keep per-architecture DMGs as a fallback build path during development and release recovery

This is the right default because the product requirement is ease of use, not smallest artifact size.

## Important Constraint: Native Dependencies

Keel currently depends on native or architecture-sensitive modules, including:

- `better-sqlite3`
- `@lancedb/lancedb`

These are the main risk to universal packaging.

Universal DMG is only acceptable if:

- the packaged app launches on Apple Silicon
- the packaged app launches on Intel
- the native modules load correctly in both environments

If either dependency blocks universal app creation or runtime, the release process must fall back to two architecture-specific DMGs rather than shipping a broken universal artifact.

## Proposed Tooling

Use `electron-builder` for Mac packaging.

Reasons:

- mature support for `dmg` targets
- built-in `mac`, `x64`, `arm64`, and `universal` support
- established signing and notarization flow
- straightforward artifact naming and release config

This would be a new dependency and should be added in the implementation phase, not in this spec-only change.

## Proposed Build Outputs

Primary release artifact:

- `Keel-<version>-mac.dmg`

Fallback artifacts:

- `Keel-<version>-mac-arm64.dmg`
- `Keel-<version>-mac-x64.dmg`

Optional internal artifacts:

- unpacked `.app` bundles for smoke testing before DMG creation

## Proposed App Packaging Shape

The packaged `.app` should include:

- Electron main bundle
- Electron preload bundle
- Vite renderer output
- app metadata and icon assets

The packaged app should not require:

- a separate Node install
- a separate browser runtime
- a separate local server process started manually by the user

## Signing And Notarization

For a consumer-friendly Mac install flow, Keel should be:

- code signed with an Apple Developer ID Application certificate
- notarized by Apple
- stapled after notarization

Without this, users will hit avoidable Gatekeeper friction.

Required Apple-side setup:

- Apple Developer account
- Developer ID Application certificate
- app-specific notarization credentials

Recommended secret inputs for CI or release automation:

- Apple signing identity
- Apple ID or App Store Connect notarization credentials
- team ID
- app bundle identifier

## Proposed `electron-builder` Shape

Implementation should add a packaging config roughly like this:

```json
{
  "appId": "com.keel.app",
  "productName": "Keel",
  "directories": {
    "output": "dist-packages"
  },
  "files": [
    "dist/**",
    "dist/electron/**",
    "package.json"
  ],
  "mac": {
    "category": "public.app-category.productivity",
    "target": [
      {
        "target": "dmg",
        "arch": [
          "universal"
        ]
      }
    ]
  },
  "dmg": {
    "sign": true
  }
}
```

The final implementation will likely need extra entries for:

- icons
- entitlements
- artifact naming
- extra resources
- unpack rules for native modules if needed

## Proposed NPM Scripts

Implementation should introduce scripts along these lines:

```json
{
  "scripts": {
    "build:desktop": "npm run build && npm run build:electron",
    "dist:mac": "npm run build:desktop && electron-builder --mac dmg --universal",
    "dist:mac:arm64": "npm run build:desktop && electron-builder --mac dmg --arm64",
    "dist:mac:x64": "npm run build:desktop && electron-builder --mac dmg --x64"
  }
}
```

The exact command shape may vary depending on whether the config lives in:

- `package.json`
- `electron-builder.yml`
- `electron-builder.json`

## Release Flow

Recommended release flow:

1. Build renderer and Electron bundles.
2. Package unsigned `.app` for smoke testing.
3. Build signed `.app`.
4. Notarize the signed app.
5. Create the DMG.
6. Staple notarization data.
7. Smoke test the final DMG on a clean machine.

Recommended smoke tests:

- open DMG
- drag app to Applications
- launch app successfully
- confirm no missing-binary or missing-module crash
- verify local database access works
- verify at least one core AI flow opens and renders correctly

## Architecture Strategy

### Default Strategy

Use universal builds for public releases.

### Fallback Strategy

If universal packaging fails because of native dependency constraints:

1. continue producing separate `arm64` and `x64` artifacts
2. label them clearly on the download page
3. keep the universal path as a tracked follow-up, not a silent abandonment

## CI And Release Automation

Later implementation should support both:

- local release builds from a configured Mac developer machine
- CI release builds on macOS runners

The CI pipeline should:

- install dependencies cleanly
- build desktop artifacts
- package the Mac app
- sign and notarize
- upload release artifacts

## Open Questions

- Whether `better-sqlite3` packages cleanly into a universal Electron app for the Electron version in use
- Whether `@lancedb/lancedb` requires special handling for universal builds
- Whether Keel needs hardened runtime entitlements beyond standard Electron defaults
- What the final bundle identifier should be
- Whether auto-update is planned later, which may affect signing and artifact strategy

## Non-Goals For This Slice

This spec does not implement:

- actual `electron-builder` setup
- signing certificates
- notarization credentials
- CI automation
- auto-update

## Definition Of Done For The Future Implementation

This packaging work should be considered done only when:

- Keel can produce a signed notarized Mac DMG
- the default public artifact works on Apple Silicon and Intel
- the app installs by drag-to-Applications with no Terminal steps
- release documentation names the fallback path if universal must be deferred
- the exact release command and checks are documented
