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

/**
 * Navigate the Capacitor WebView to a path.
 * Uses window.location for the initial cold-start load (WebView is blank),
 * then uses history API for subsequent in-app navigations to preserve React state.
 */
let initialLoadDone = false

function navigateTo(path) {
  // Ensure path is relative (no external URLs)
  const relativePath = path.startsWith('/') ? path : `/${path}`

  if (!initialLoadDone) {
    // Cold start — WebView has no React app loaded yet, must do a full navigation.
    // The server URL is set in capacitor.config.ts and the WebView base URL matches it.
    window.location.href = relativePath
    initialLoadDone = true
  } else {
    // App is loaded — use history API to avoid full reload
    window.location.assign(relativePath)
  }
}

/**
 * Extract a relative path from a deep link URL.
 * Handles both https://beta.trypzy.com/... and trypzy://...
 */
function extractPath(url) {
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'trypzy:') {
      // trypzy://trips/abc?foo=bar → /trips/abc?foo=bar
      const path = '/' + parsed.host + parsed.pathname
      return path + parsed.search + parsed.hash
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
 * Handle app lifecycle events.
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
