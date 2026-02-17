import type { CapacitorConfig } from '@capacitor/cli'
import { config as dotenvConfig } from 'dotenv'

// Load native/.env so `npx cap sync` picks up CAPACITOR_SERVER_URL
dotenvConfig()

/**
 * Capacitor config for Tripti native shell.
 *
 * SERVER URL:
 *   - For local dev, create native/.env with CAPACITOR_SERVER_URL=http://<your-ip>:3000
 *   - For production builds, leave unset (defaults to https://tripti.ai)
 *   - The `npx cap sync` step reads this file, so changes require a re-sync.
 */

const DEV_SERVER_URL = process.env.CAPACITOR_SERVER_URL
const PROD_URL = 'https://preview.tripti.ai'

const serverUrl = DEV_SERVER_URL || PROD_URL
const isDev = !!DEV_SERVER_URL

const config: CapacitorConfig = {
  appId: 'ai.tripti.app',
  appName: 'Tripti.ai',
  webDir: 'www',
  server: {
    url: serverUrl,
    cleartext: isDev, // Only allow HTTP for local dev
  },
  ios: {
    scheme: 'tripti',
    contentInset: 'automatic',
  },
  android: {
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
      androidClientId: '795030561959-kk4ldem7bisjkruiotru0unviu8hieg7.apps.googleusercontent.com',
      forceCodeForRefreshToken: false,
    },
  },
}

export default config
