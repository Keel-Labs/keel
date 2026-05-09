# Release process

How to cut Keel desktop release artifacts. Targets the maintainer; not part of the user-facing docs.

## One-time macOS setup

1. Apple Developer Program enrollment (Individual, $99/yr).
2. **Developer ID Application** certificate installed in **login** keychain — generated from a CSR via Keychain Access → Certificate Assistant.
3. Apple Developer ID intermediate (G2) installed in login keychain so the cert chain validates.
4. App-specific password generated at https://appleid.apple.com → Sign-In and Security → App-Specific Passwords. Label it something like "Keel notarization." This is **not** your Apple ID password — it's a one-purpose token Apple issues you for tools like `notarytool`.

The certificate currently in use is `Developer ID Application: Medha Ghatikesh (L77FWJRVLZ)`. If it ever rotates, update the `identity` string in `electron-builder.config.mjs`.

## One-time Windows setup

1. Windows release builds should run on Windows x64.
2. Code signing is not configured yet. Unsigned installers are suitable for internal testing but can trigger Microsoft Defender SmartScreen warnings for end users.
3. Before a public Windows release, provision an Authenticode code-signing certificate and configure electron-builder signing environment variables.

## Per-release build

Before building either desktop package, make sure the **Build Whisper Binaries** GitHub Actions workflow has completed successfully for the current release baseline. `dist:mac` expects `whisper-macos-universal`; `dist:win` expects `whisper-windows-x64.exe`.

Build macOS on macOS:

```sh
export APPLE_ID="your-apple-id@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"   # the app-specific password, NOT your Apple ID password

npm run dist:mac
```

The macOS build will:

1. Compile the renderer + Electron code.
2. Sign the `.app` with the Developer ID certificate.
3. Submit to Apple's notary service over the network (~3–10 min — be patient).
4. Staple the notarization ticket to the DMG.

If `APPLE_ID` and `APPLE_APP_SPECIFIC_PASSWORD` aren't set, electron-builder skips notarization and produces an ad-hoc-signed build only. That's fine for local testing but will trigger Gatekeeper warnings for end users.

If `KEEL_SKIP_SIGNING=1` is set, signing is also skipped (purely ad-hoc). Useful for local-only iteration when you don't want to wait on the keychain prompt.

Build Windows on Windows:

```sh
npm run dist:win
```

The Windows build will:

1. Download the Windows whisper.cpp binary into `resources/whisper.exe`.
2. Compile the renderer + Electron code.
3. Rebuild/install native Electron dependencies.
4. Produce an NSIS installer, ZIP, and `latest.yml` update manifest in `dist-packages/`.

## Verify before publishing

macOS:

```sh
# Should report: source=Notarized Developer ID
spctl --assess --type exec --verbose dist-packages/Keel-<version>-mac.dmg

# Should show "accepted" with no errors
codesign --verify --deep --strict --verbose=2 "/Applications/Keel.app"
```

Open the DMG on a Mac that has never seen Keel before — the first launch should not show any "could not verify" or "unidentified developer" dialog. If it does, notarization didn't complete or stapling failed; check the build log for `notarize` errors.

Windows:

```powershell
# Should print the product version metadata.
(Get-Item "dist-packages\win-unpacked\Keel.exe").VersionInfo

# Should start without missing DLL, native module, or tray icon errors.
Start-Process "dist-packages\win-unpacked\Keel.exe"
```

On a clean Windows machine, install `dist-packages\Keel-<version>-win-x64.exe`, launch Keel, and verify the onboarding screen, tray menu, update check log entry, and local whisper status.

## Publish

```sh
gh release upload v<version> \
  dist-packages/Keel-<version>-mac.dmg \
  dist-packages/latest-mac.yml \
  dist-packages/Keel-<version>-win-x64.exe \
  dist-packages/Keel-<version>-win-x64.zip \
  dist-packages/latest.yml \
  --clobber
```

Update the release notes to drop the Sequoia/Gatekeeper install instructions once the DMG is notarized — the dance no longer applies.
