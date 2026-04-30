# Release process

How to cut a signed, notarized macOS DMG for a Keel release. Targets the maintainer; not part of the user-facing docs.

## One-time setup

1. Apple Developer Program enrollment (Individual, $99/yr).
2. **Developer ID Application** certificate installed in **login** keychain — generated from a CSR via Keychain Access → Certificate Assistant.
3. Apple Developer ID intermediate (G2) installed in login keychain so the cert chain validates.
4. App-specific password generated at https://appleid.apple.com → Sign-In and Security → App-Specific Passwords. Label it something like "Keel notarization." This is **not** your Apple ID password — it's a one-purpose token Apple issues you for tools like `notarytool`.

The certificate currently in use is `Developer ID Application: Medha Ghatikesh (L77FWJRVLZ)`. If it ever rotates, update the `identity` string in `electron-builder.config.mjs`.

## Per-release build

```sh
export APPLE_ID="your-apple-id@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"   # the app-specific password, NOT your Apple ID password

npm run dist:mac
```

The build will:

1. Compile the renderer + Electron code.
2. Sign the `.app` with the Developer ID certificate.
3. Submit to Apple's notary service over the network (~3–10 min — be patient).
4. Staple the notarization ticket to the DMG.

If `APPLE_ID` and `APPLE_APP_SPECIFIC_PASSWORD` aren't set, electron-builder skips notarization and produces an ad-hoc-signed build only. That's fine for local testing but will trigger Gatekeeper warnings for end users.

If `KEEL_SKIP_SIGNING=1` is set, signing is also skipped (purely ad-hoc). Useful for local-only iteration when you don't want to wait on the keychain prompt.

## Verify before publishing

```sh
# Should report: source=Notarized Developer ID
spctl --assess --type exec --verbose dist-packages/Keel-0.1.0-mac.dmg

# Should show "accepted" with no errors
codesign --verify --deep --strict --verbose=2 "/Applications/Keel.app"
```

Open the DMG on a Mac that has never seen Keel before — the first launch should not show any "could not verify" or "unidentified developer" dialog. If it does, notarization didn't complete or stapling failed; check the build log for `notarize` errors.

## Publish

```sh
gh release upload v<version> dist-packages/Keel-<version>-mac.dmg --clobber
```

Update the release notes to drop the Sequoia/Gatekeeper install instructions once the DMG is notarized — the dance no longer applies.
