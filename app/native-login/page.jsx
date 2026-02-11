'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { TrypzyLogo } from '@/components/brand/TrypzyLogo'
import { BrandedSpinner } from '@/components/common/BrandedSpinner'

/**
 * Helpers to access Capacitor plugins via the global bridge.
 *
 * In hosted WebView mode, Capacitor injects its runtime into window.Capacitor.
 * Plugins are registered on window.Capacitor.Plugins. We access them at runtime
 * to avoid bundling native-only packages into the Next.js build.
 */
function getCapacitorPlugin(name) {
  return window?.Capacitor?.Plugins?.[name] ?? null
}

function isCapacitorNative() {
  return !!(
    typeof window !== 'undefined' &&
    window.Capacitor?.isNativePlatform?.()
  )
}

function isIOS() {
  return window?.Capacitor?.getPlatform?.() === 'ios'
}

/**
 * Native login page — shown inside the Capacitor WebView.
 *
 * If running in Capacitor: triggers native Google Sign-In via the
 * Capacitor bridge, then navigates to /native-bridge on success.
 *
 * If running in a regular browser: redirects to /login.
 */
export default function NativeLoginPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(null) // null | 'google' | 'apple'
  const [error, setError] = useState(null)
  const [isNative, setIsNative] = useState(null) // null = checking
  const [showApple, setShowApple] = useState(false)

  useEffect(() => {
    const native = isCapacitorNative()
    setIsNative(native)

    if (native) {
      setShowApple(isIOS())
    } else {
      // If not in Capacitor, redirect to web login
      router.replace('/login')
    }
  }, [router])

  const handleGoogleSignIn = async () => {
    setLoading('google')
    setError(null)

    try {
      const GoogleAuth = getCapacitorPlugin('GoogleAuth')
      const Preferences = getCapacitorPlugin('Preferences')

      if (!GoogleAuth || !Preferences) {
        throw new Error('Native plugins not available')
      }

      // Initialize GoogleAuth with config (required for iOS to set iosClientId)
      await GoogleAuth.initialize()

      // Show native Google Sign-In dialog
      const googleUser = await GoogleAuth.signIn()
      const idToken = googleUser.authentication?.idToken

      if (!idToken) {
        throw new Error('Google sign-in did not return an ID token')
      }

      // Exchange Google ID token for Trypzy JWT
      const res = await fetch('/api/mobile/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Authentication failed')
      }

      const { token, user } = await res.json()

      // Store in Capacitor Preferences (native secure storage)
      await Preferences.set({ key: 'trypzy_token', value: token })
      await Preferences.set({
        key: 'trypzy_user',
        value: JSON.stringify(user),
      })

      // Navigate to bridge page which syncs to localStorage
      router.replace('/native-bridge')
    } catch (err) {
      setError(err.message || 'Sign-in failed. Please try again.')
      setLoading(null)
    }
  }

  const handleAppleSignIn = async () => {
    setLoading('apple')
    setError(null)

    try {
      const SignInWithApple = getCapacitorPlugin('SignInWithApple')
      const Preferences = getCapacitorPlugin('Preferences')

      if (!SignInWithApple || !Preferences) {
        throw new Error('Native plugins not available')
      }

      // Show native Apple Sign-In sheet — request email + name scopes
      // so the identity token JWT includes the email claim for account linking
      const result = await SignInWithApple.authorize({
        scopes: 'email name',
      })
      const identityToken = result?.response?.identityToken

      if (!identityToken) {
        throw new Error('Apple sign-in did not return an identity token')
      }

      // Build fullName from response (only available on first sign-in)
      const fullName =
        result.response?.givenName || result.response?.familyName
          ? {
              givenName: result.response.givenName || '',
              familyName: result.response.familyName || '',
            }
          : undefined

      // Exchange Apple identity token for Trypzy JWT
      const res = await fetch('/api/mobile/auth/apple', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identityToken, fullName }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Authentication failed')
      }

      const { token, user } = await res.json()

      // Store in Capacitor Preferences (native secure storage)
      await Preferences.set({ key: 'trypzy_token', value: token })
      await Preferences.set({
        key: 'trypzy_user',
        value: JSON.stringify(user),
      })

      // Navigate to bridge page which syncs to localStorage
      router.replace('/native-bridge')
    } catch (err) {
      // User cancel shows as "The operation couldn't be completed" — suppress it
      if (err?.message?.includes('1001') || err?.code === '1001') {
        setLoading(null)
        return
      }
      setError(err.message || 'Sign-in failed. Please try again.')
      setLoading(null)
    }
  }

  // Still checking environment
  if (isNative === null) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
        <div className="text-center">
          <TrypzyLogo variant="full" className="h-10 w-auto mx-auto mb-4" />
          <BrandedSpinner size="lg" className="mx-auto" />
        </div>
      </div>
    )
  }

  // Not native — will redirect (show spinner briefly)
  if (!isNative) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
        <BrandedSpinner size="lg" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <div className="w-full max-w-sm text-center">
        <div className="mb-8">
          <TrypzyLogo variant="full" className="h-10 w-auto mx-auto mb-3" />
          <p className="text-[#6B7280]">Trips made easy</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-brand-red/10 border border-brand-red/20 rounded-lg">
            <p className="text-sm text-brand-red">{error}</p>
          </div>
        )}

        <Button
          className="w-full h-12 text-base"
          onClick={handleGoogleSignIn}
          disabled={!!loading}
        >
          {loading === 'google' ? (
            <div className="flex items-center gap-2">
              <BrandedSpinner size="sm" />
              <span>Signing in...</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="currentColor"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="currentColor"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="currentColor"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              <span>Continue with Google</span>
            </div>
          )}
        </Button>

        {showApple && (
          <button
            className="w-full h-12 text-base mt-3 rounded-lg bg-brand-carbon text-white font-medium flex items-center justify-center gap-2 disabled:opacity-50"
            onClick={handleAppleSignIn}
            disabled={!!loading}
          >
            {loading === 'apple' ? (
              <>
                <BrandedSpinner size="sm" />
                <span>Signing in...</span>
              </>
            ) : (
              <>
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
                </svg>
                <span>Continue with Apple</span>
              </>
            )}
          </button>
        )}

        <p className="text-xs text-[#6B7280] mt-6">
          By continuing, you agree to Trypzy&apos;s terms of service.
        </p>
      </div>
    </div>
  )
}
