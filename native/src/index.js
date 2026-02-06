/**
 * Trypzy native app bootstrap.
 *
 * Runs on Capacitor app start. Decides initial route and sets up deep link handling.
 *
 * Cold start flow:
 *   - If Preferences has "trypzy_token" → navigate to /native-bridge
 *   - Else → navigate to /native-login
 *
 * Deep link flow:
 *   - Authenticated: route WebView directly
 *   - Not authenticated: save pending URL, route to /native-login
 */

import { App } from '@capacitor/app'
import { Preferences } from '@capacitor/preferences'
import { SplashScreen } from '@capacitor/splash-screen'

const BASE_URL = 'https://beta.trypzy.com'

/**
 * Navigate the Capacitor WebView to a path.
 */
function navigateTo(path) {
  const url = path.startsWith('http') ? path : `${BASE_URL}${path}`
  window.location.href = url
}

/**
 * Extract a relative path from a deep link URL.
 * Handles both https://beta.trypzy.com/... and trypzy://...
 */
function extractPath(url) {
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'trypzy:') {
      // trypzy://trips/abc → /trips/abc
      return '/' + parsed.host + parsed.pathname
    }
    // https://beta.trypzy.com/trips/abc → /trips/abc
    return parsed.pathname + parsed.search + parsed.hash
  } catch {
    return '/'
  }
}

/**
 * Bootstrap the native app.
 */
async function bootstrap() {
  try {
    // Check for existing auth token
    const { value: token } = await Preferences.get({ key: 'trypzy_token' })

    if (token) {
      // Has token — go through bridge to sync to localStorage
      navigateTo('/native-bridge')
    } else {
      // No token — show native login
      navigateTo('/native-login')
    }
  } catch {
    navigateTo('/native-login')
  } finally {
    // Hide splash screen after navigation decision
    await SplashScreen.hide().catch(() => {})
  }
}

/**
 * Setup deep link listener.
 */
function setupDeepLinks() {
  App.addListener('appUrlOpen', async ({ url }) => {
    if (!url) return

    const path = extractPath(url)

    // Skip if it's a login/bridge page
    if (path.startsWith('/native-login') || path.startsWith('/native-bridge')) {
      return
    }

    // Check if authenticated
    const { value: token } = await Preferences.get({ key: 'trypzy_token' })

    if (token) {
      // Authenticated — route directly
      navigateTo(path)
    } else {
      // Not authenticated — save pending URL and go to login
      await Preferences.set({ key: 'pending_url', value: path })
      navigateTo('/native-login')
    }
  })
}

/**
 * Handle app resume (back from background).
 */
function setupAppStateListeners() {
  App.addListener('backButton', () => {
    // Let the WebView handle back navigation
    window.history.back()
  })
}

// Initialize
setupDeepLinks()
setupAppStateListeners()
bootstrap()
