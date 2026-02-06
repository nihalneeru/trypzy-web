import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.trypzy.app',
  appName: 'Trypzy',
  webDir: 'www',
  server: {
    // Hosted mode — WebView loads the deployed beta site
    url: 'https://beta.trypzy.com',
    // Clear cookies/cache on app start to avoid stale sessions
    cleartext: false,
  },
  ios: {
    scheme: 'trypzy',
    contentInset: 'automatic',
  },
  android: {
    // Required for hosted URL mode
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 1500,
      backgroundColor: '#FFFFFF',
      showSpinner: false,
    },
    GoogleAuth: {
      scopes: ['profile', 'email'],
      // Set via environment — iOS uses reversed client ID in Info.plist
      // Android uses google-services.json
      serverClientId: 'SET_YOUR_GOOGLE_WEB_CLIENT_ID_HERE',
      forceCodeForRefreshToken: false,
    },
  },
}

export default config
