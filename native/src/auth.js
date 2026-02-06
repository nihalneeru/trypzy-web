/**
 * Native Google Sign-In + Trypzy token exchange.
 *
 * Flow:
 *   1. System Google Sign-In dialog (native, NOT WebView)
 *   2. POST Google ID token to backend
 *   3. Backend verifies, returns Trypzy JWT
 *   4. Store JWT in Capacitor Preferences
 *   5. Navigate WebView to /native-bridge (which copies to localStorage)
 */

import { Preferences } from '@capacitor/preferences'

const API_BASE = 'https://beta.trypzy.com'

/**
 * Trigger native Google Sign-In and exchange for Trypzy JWT.
 * Returns { token, user } on success or throws on failure.
 */
export async function nativeGoogleSignIn() {
  // Dynamic import — only loaded when called from native context
  const { GoogleAuth } = await import('@codetrix-studio/capacitor-google-auth')

  // Initialize (required on Android, no-op on iOS if already initialized)
  await GoogleAuth.initialize()

  // Show native Google Sign-In
  const googleUser = await GoogleAuth.signIn()
  const idToken = googleUser.authentication?.idToken

  if (!idToken) {
    throw new Error('Google sign-in did not return an ID token')
  }

  // Exchange Google ID token for Trypzy JWT
  const res = await fetch(`${API_BASE}/api/mobile/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  })

  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || 'Authentication failed')
  }

  const { token, user } = await res.json()

  // Store Trypzy JWT in native secure storage
  await Preferences.set({ key: 'trypzy_token', value: token })

  // Store user data for bridge page
  await Preferences.set({ key: 'trypzy_user', value: JSON.stringify(user) })

  return { token, user }
}

/**
 * Clear all stored auth state (for logout).
 */
export async function nativeClearAuth() {
  await Preferences.remove({ key: 'trypzy_token' })
  await Preferences.remove({ key: 'trypzy_user' })
  await Preferences.remove({ key: 'pending_url' })

  try {
    const { GoogleAuth } = await import('@codetrix-studio/capacitor-google-auth')
    await GoogleAuth.signOut()
  } catch {
    // Google sign-out failure is non-critical
  }
}

/**
 * Check if native token exists.
 */
export async function hasNativeToken() {
  const { value } = await Preferences.get({ key: 'trypzy_token' })
  return !!value
}
