import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.trypzy.app',
  appName: 'Trypzy',
  webDir: 'www',
  server: {
    // Hosted mode — WebView loads the web app
    // For local dev: http://<your-ip>:3000 (requires cleartext: true)
    // For production: https://beta.trypzy.com
    url: 'http://192.168.86.31:3000',
    cleartext: true,
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
      serverClientId: '795030561959-kk4ldem7bisjkruiotru0unviu8hieg7.apps.googleusercontent.com',
      iosClientId: '795030561959-0rhoh8dih6vfimsd2v5fu5e4j3e4mt7e.apps.googleusercontent.com',
      forceCodeForRefreshToken: false,
    },
  },
}

export default config
