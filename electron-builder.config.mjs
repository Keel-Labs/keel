const splitArtifacts = process.env.KEEL_MAC_SPLIT === '1';

const artifactName = splitArtifacts
  ? '${productName}-${version}-mac-${arch}.${ext}'
  : '${productName}-${version}-mac.${ext}';

export default {
  appId: process.env.KEEL_APP_ID || 'com.keel.desktop',
  productName: 'Keel',
  directories: {
    output: 'dist-packages',
    buildResources: 'build',
  },
  // Auto-update via electron-updater reads from GitHub releases. Setting this
  // here also makes electron-builder generate latest-mac.yml in dist-packages
  // during dist:mac, which we upload as a release asset alongside the DMG.
  publish: [
    {
      provider: 'github',
      owner: 'Keel-Labs',
      repo: 'keel',
    },
  ],
  files: [
    'dist/**/*',
    'package.json',
    '!dist-packages/**/*',
    '!**/*.map',
  ],
  asar: true,
  asarUnpack: [
    'node_modules/**/*.node',
  ],
  // Bundle pre-compiled whisper binary outside ASAR so it can be executed
  extraResources: [
    {
      from: 'resources/whisper',
      to: 'whisper',
      filter: ['**/*'],
    },
  ],
  mac: {
    category: 'public.app-category.productivity',
    icon: 'build/icon.icns',
    target: ['dmg'],
    artifactName,
    // Per-arch native deps are pre-staged into node_modules by
    // scripts/install-universal-mac-deps.mjs (see dist:mac), so the universal
    // merge sees identical, already-universal binaries in both arch slices.
    // No x64ArchFiles / arm64ArchFiles overrides are needed; the previous
    // pattern here was inverted and effectively did nothing.
    hardenedRuntime: true,
    gatekeeperAssess: false,
    // Sign with the Developer ID Application certificate when available; fall
    // back to ad-hoc signing for local dev builds (no cert installed).
    identity: process.env.KEEL_SKIP_SIGNING ? null : 'Medha Ghatikesh (L77FWJRVLZ)',
    // Notarize with Apple when APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD +
    // APPLE_TEAM_ID are set in the environment. electron-builder@26.x requires
    // `notarize` to be a boolean; team id comes from APPLE_TEAM_ID env var.
    notarize: !!(process.env.APPLE_ID && process.env.APPLE_APP_SPECIFIC_PASSWORD && process.env.APPLE_TEAM_ID),
    entitlements: 'build/entitlements.mac.plist',
    entitlementsInherit: 'build/entitlements.mac.inherit.plist',
    extendInfo: {
      NSMicrophoneUsageDescription: 'Keel uses your microphone to transcribe meetings and voice notes locally on your device.',
    },
  },
  dmg: {
    artifactName,
    writeUpdateInfo: false,
    // dmg-builder under-sizes the RW image (bytes / 1000 + "K" suffix gives
    // ~2.4% headroom) and HFS+ catalog overhead pushes us over for ~1.9GB+
    // payloads. ditto then exits with "no space" mid-copy and dmgbuild
    // doesn't check the exit code, silently dropping files.
    // "3g" gives ~58% headroom against the current ~1.9GB payload.
    size: '3g',
    window: {
      width: 640,
      height: 420,
    },
    contents: [
      { x: 180, y: 190, type: 'file' },
      { x: 460, y: 190, type: 'link', path: '/Applications' },
    ],
  },
};
