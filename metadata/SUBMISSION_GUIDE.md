# App Store Submission Guide

## Prerequisites

### Apple (iOS)
1. [Apple Developer Account](https://developer.apple.com/programs/) ($99/year)
2. App registered in [App Store Connect](https://appstoreconnect.apple.com)
3. Code signing certificates + provisioning profiles (via `fastlane match`)
4. App icon: 1024x1024 PNG (no alpha, no rounded corners — Apple adds them)
5. Screenshots: at minimum 6.7" (iPhone 15 Pro Max) and 6.5" (iPhone 14 Plus)

### Google (Android)
1. [Google Play Developer Account](https://play.google.com/console) ($25 one-time)
2. App created in Google Play Console
3. Upload signing key (or use Play App Signing — recommended)
4. App icon: 512x512 PNG
5. Feature graphic: 1024x500 PNG
6. Screenshots: at minimum phone and 7" tablet

---

## Step-by-Step: iOS

### 1. Set up code signing

```bash
# Install fastlane match (manages certs in a private git repo)
cd ios
fastlane match init
# Choose "git" storage, provide a private repo URL

# Generate certificates
fastlane match appstore
```

### 2. Set GitHub secrets

| Secret | Description |
|--------|-------------|
| `APPLE_ID` | Your Apple ID email |
| `APPLE_TEAM_ID` | Team ID from developer.apple.com |
| `ITC_TEAM_ID` | App Store Connect team ID |
| `APPLE_APP_ID` | Numeric App ID from App Store Connect |
| `MATCH_PASSWORD` | Encryption password for match certificates |
| `MATCH_GIT_URL` | Git repo URL for match certificates |
| `APPLE_APP_SPECIFIC_PASSWORD` | Generated at appleid.apple.com |
| `API_URL` | Production server URL (e.g., `https://keel-api.fly.dev`) |

### 3. Add app icon

Replace the placeholder icon files:
```
ios/App/App/Assets.xcassets/AppIcon.appiconset/
```
Use a tool like [App Icon Generator](https://www.appicon.co/) to generate all sizes from a single 1024x1024 PNG.

### 4. Add screenshots

Take screenshots on simulator or device, then upload via:
- App Store Connect web interface, or
- Fastlane `deliver` with screenshots in `ios/fastlane/screenshots/`

### 5. Submit

```bash
# TestFlight (internal testing)
cd ios && fastlane beta

# Production
cd ios && fastlane release
```

Or trigger via GitHub Actions: **Actions → iOS Build & Deploy → Run workflow**

---

## Step-by-Step: Android

### 1. Generate signing key

```bash
keytool -genkey -v -keystore release.keystore \
  -alias keel -keyalg RSA -keysize 2048 -validity 10000
```

### 2. Set GitHub secrets

| Secret | Description |
|--------|-------------|
| `ANDROID_KEYSTORE_BASE64` | `base64 -i release.keystore` output |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password |
| `ANDROID_KEY_ALIAS` | Key alias (e.g., `keel`) |
| `ANDROID_KEY_PASSWORD` | Key password |
| `GOOGLE_PLAY_JSON_KEY_BASE64` | Base64-encoded service account JSON from Play Console |
| `API_URL` | Production server URL |

### 3. Add app icon

Replace the placeholder icons:
```
android/app/src/main/res/mipmap-*/ic_launcher.png
android/app/src/main/res/mipmap-*/ic_launcher_round.png
```
Use [Android Asset Studio](https://romannurik.github.io/AndroidAssetStudio/) to generate all densities.

### 4. First upload (manual)

Google Play requires the first AAB upload to be done manually:
1. Build: `cd android && ./gradlew bundleRelease`
2. Upload AAB at: Play Console → Your app → Production → Create new release

### 5. Subsequent releases

```bash
# Internal testing
cd android && fastlane beta

# Production
cd android && fastlane release
```

Or trigger via GitHub Actions: **Actions → Android Build & Deploy → Run workflow**

---

## App Icon Specifications

| Platform | Size | Format | Notes |
|----------|------|--------|-------|
| iOS App Store | 1024x1024 | PNG | No transparency, no rounded corners |
| iOS App | Various (20-1024) | PNG | Generated from 1024x1024 |
| Android Play Store | 512x512 | PNG | 32-bit with alpha |
| Android App | mdpi to xxxhdpi | PNG | Adaptive icon recommended |
| Android Feature Graphic | 1024x500 | PNG/JPEG | Shown on Play Store listing |

---

## Content Rating

Both stores require a content rating questionnaire:
- iOS: Completed in App Store Connect under "App Information"
- Android: Completed in Play Console under "Content rating"

Keel should qualify for:
- iOS: **4+** (no objectionable content)
- Android: **Everyone** (IARC rating)

---

## Privacy Policy

Both stores require a privacy policy URL. Key points to cover:
- What data is collected (email, chat messages, brain files)
- Where data is stored (user's self-hosted server or Keel cloud)
- API keys are stored server-side, not shared
- No data is sold to third parties
- User can delete account and all data

---

## Review Tips

### iOS App Review
- Ensure the app works without crashing on latest iOS
- Provide demo credentials in review notes if login is required
- The review notes in `metadata/app-store.json` explain the API key requirement
- Avoid mentioning competing platforms by name in the description

### Google Play Review
- Ensure the app targets the latest API level (currently 36)
- Data safety form must be completed in Play Console
- Declare network access and camera usage
