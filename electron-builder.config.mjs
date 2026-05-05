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
    x64ArchFiles: '**/{*.darwin-arm64.node,ffmpeg-static/ffmpeg}',
    hardenedRuntime: true,
    gatekeeperAssess: false,
    // Sign with the Developer ID Application certificate when available; fall
    // back to ad-hoc signing for local dev builds (no cert installed).
    identity: process.env.KEEL_SKIP_SIGNING ? null : 'Medha Ghatikesh (L77FWJRVLZ)',
    // Notarize with Apple when APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD are set
    // in the environment. Skipped automatically if creds are absent.
    notarize: process.env.APPLE_ID && process.env.APPLE_APP_SPECIFIC_PASSWORD
      ? { teamId: 'L77FWJRVLZ' }
      : false,
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
