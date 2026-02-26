'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { TriptiLogo } from '@/components/brand/TriptiLogo'
import { BrandedSpinner } from '@/components/common/BrandedSpinner'

/**
 * Access Capacitor Preferences plugin via the global bridge.
 * Returns null if not in Capacitor environment.
 */
function getPreferences() {
  return window?.Capacitor?.Plugins?.Preferences ?? null
}

function isCapacitorNative() {
  return !!(
    typeof window !== 'undefined' &&
    window.Capacitor?.isNativePlatform?.()
  )
}

/**
 * Native bridge page — syncs Capacitor Preferences → localStorage.
 *
 * On load:
 *   1. If Capacitor: read token + user from Preferences
 *   2. Copy to localStorage (where all API calls read from)
 *   3. Check for pending deep link URL
 *   4. Redirect to pending URL or /dashboard
 *
 * If not Capacitor or no token found: redirect to /native-login
 */
export default function NativeBridgePage() {
  const router = useRouter()
  const [status, setStatus] = useState('Syncing your session...')

  useEffect(() => {
    async function bridge() {
      try {
        if (!isCapacitorNative()) {
          // On web, check localStorage directly
          const existingToken = localStorage.getItem('tripti_token')
          if (existingToken) {
            router.replace('/dashboard')
          } else {
            router.replace('/login')
          }
          return
        }

        const Preferences = getPreferences()
        if (!Preferences) {
          router.replace('/native-login')
          return
        }

        // Read token from native storage
        const { value: token } = await Preferences.get({
          key: 'tripti_token',
        })
        const { value: userJson } = await Preferences.get({
          key: 'tripti_user',
        })

        if (!token) {
          router.replace('/native-login')
          return
        }

        // Copy to localStorage (where API calls read Authorization header from)
        localStorage.setItem('tripti_token', token)
        if (userJson) {
          localStorage.setItem('tripti_user', userJson)
        }

        setStatus('Redirecting...')

        // Check for pending deep link
        const { value: pendingUrl } = await Preferences.get({
          key: 'pending_url',
        })

        // Request push permission + register token (fire-and-forget)
        try {
          const PushNotifications = window?.Capacitor?.Plugins?.PushNotifications
          if (PushNotifications) {
            // Listen for registration errors before calling register()
            PushNotifications.addListener('registrationError', (err) => {
              console.error('[push] Registration failed:', JSON.stringify(err))
            })
            const perm = await PushNotifications.requestPermissions()
            if (perm.receive === 'granted') {
              await PushNotifications.register()
              PushNotifications.addListener('registration', async (pushToken) => {
                const pushPlatform = window.Capacitor?.getPlatform?.() === 'android' ? 'android' : 'ios'
                console.log('[push] Token registered:', pushPlatform, pushToken.value?.slice(0, 12) + '...')
                fetch('/api/push/register', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                  body: JSON.stringify({ token: pushToken.value, platform: pushPlatform })
                }).catch((err) => console.error('[push] Server register failed:', err.message))
                // Save token for logout unregister
                try { localStorage.setItem('tripti_push_token', pushToken.value) } catch {}
              })
            } else {
              console.log('[push] Permission denied:', perm.receive)
            }
          } else {
            console.log('[push] PushNotifications plugin not available')
          }
        } catch (err) {
          console.error('[push] Setup error:', err.message)
        }

        if (pendingUrl && typeof pendingUrl === 'string' && pendingUrl.startsWith('/')) {
          await Preferences.remove({ key: 'pending_url' })
          router.replace(pendingUrl)
        } else {
          router.replace('/dashboard')
        }
      } catch (err) {
        router.replace('/native-login')
      }
    }

    bridge()
  }, [router])

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <div className="text-center">
        <TriptiLogo variant="full" className="h-10 w-auto mx-auto mb-4" />
        <BrandedSpinner size="lg" className="mx-auto mb-3" />
        <p className="text-sm text-brand-carbon/60">{status}</p>
      </div>
    </div>
  )
}
