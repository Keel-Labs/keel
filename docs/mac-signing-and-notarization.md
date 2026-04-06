# macOS Signing And Notarization

This repo can produce a distribution-grade Mac DMG through GitHub Actions, but only after the required Apple signing and notarization credentials are configured.

## Recommended Auth Strategy

Use:

- a `Developer ID Application` certificate for code signing
- an `App Store Connect API key` for notarization

This matches the current `electron-builder` and `@electron/notarize` recommendations more closely than Apple ID app-specific passwords.

## Required GitHub Secrets

Create these repository secrets before running the desktop macOS release workflow:

| Secret | Value |
| --- | --- |
| `MAC_CERTIFICATE_P12_BASE64` | Base64-encoded `Developer ID Application` `.p12` certificate |
| `MAC_CERTIFICATE_PASSWORD` | Password used when exporting the `.p12` certificate |
| `APPLE_API_KEY_P8` | Raw contents of `AuthKey_<KEY_ID>.p8` from App Store Connect |
| `APPLE_API_KEY_ID` | App Store Connect API key ID |
| `APPLE_API_ISSUER` | App Store Connect issuer ID |

Recommended repository variable:

| Variable | Value |
| --- | --- |
| `KEEL_APP_ID` | Final macOS bundle identifier, for example `com.keel.desktop` or your production bundle ID |

## How To Produce `MAC_CERTIFICATE_P12_BASE64`

Export your `Developer ID Application` certificate as a `.p12`, then base64-encode it:

```bash
base64 -i Keel-DeveloperID.p12 | pbcopy
```

Paste that base64 output into the `MAC_CERTIFICATE_P12_BASE64` GitHub secret.

## How To Create The App Store Connect API Key

In App Store Connect:

1. Open `Users and Access`.
2. Open the `Integrations` tab.
3. Create a `Team Key` with `App Manager` access.
4. Save the `Issuer ID`.
5. Save the `Key ID`.
6. Download the `.p8` file once.

Then:

- put the file contents into `APPLE_API_KEY_P8`
- put the key ID into `APPLE_API_KEY_ID`
- put the issuer UUID into `APPLE_API_ISSUER`

## Release Workflow

The release workflow is [desktop-macos-release.yml](/Users/djsam/.codex/worktrees/20fe/Keel/.github/workflows/desktop-macos-release.yml).

It does the following:

1. validates the required secrets
2. writes the App Store Connect `.p8` key to a temporary file
3. passes `CSC_LINK` and `CSC_KEY_PASSWORD` to `electron-builder`
4. enables `forceCodeSigning` for the release build
5. notarizes the signed app
6. builds the final DMG
7. uploads the DMG as a workflow artifact

## Local Release Build

If you want to run a true release-grade local build on a configured Mac:

```bash
export CSC_LINK="<base64 .p12 contents>"
export CSC_KEY_PASSWORD="<p12 password>"
export APPLE_API_KEY="/absolute/path/to/AuthKey_XXXXXXXXXX.p8"
export APPLE_API_KEY_ID="<key id>"
export APPLE_API_ISSUER="<issuer uuid>"
export KEEL_APP_ID="<bundle id>"

npm run dist:mac:release
```

`dist:mac:release` differs from `dist:mac` by forcing signing to be present. If signing credentials are missing or invalid, the release build should fail instead of silently falling back to ad-hoc signing.
