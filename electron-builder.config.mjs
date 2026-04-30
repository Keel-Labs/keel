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
    identity: process.env.KEEL_SKIP_SIGNING ? null : 'Developer ID Application: Medha Ghatikesh (L77FWJRVLZ)',
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
