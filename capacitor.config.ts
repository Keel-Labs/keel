import type { CapacitorConfig } from '@capacitor/cli';

const isProd = process.env.NODE_ENV === 'production';

const config: CapacitorConfig = {
  appId: 'com.keel.app',
  appName: 'Keel',
  webDir: 'dist/mobile',
  server: {
    // In production, the app loads from bundled assets.
    // For development, uncomment and set your local IP:
    // url: 'http://192.168.x.x:5174',
    androidScheme: 'https',
    iosScheme: 'capacitor',
    allowNavigation: [
      'keel-api.fly.dev',
      '*.fly.dev',
      'localhost',
    ],
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 1500,
      backgroundColor: '#1a1a1a',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
      splashFullScreen: true,
      splashImmersive: true,
    },
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#1a1a1a',
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
  // iOS-specific
  ios: {
    contentInset: 'automatic',
    preferredContentMode: 'mobile',
    scheme: 'Keel',
  },
  // Android-specific
  android: {
    allowMixedContent: false,
    backgroundColor: '#1a1a1a',
  },
};

export default config;
