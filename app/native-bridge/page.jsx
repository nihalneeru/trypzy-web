'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { TrypzyLogo } from '@/components/brand/TrypzyLogo'
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
          const existingToken = localStorage.getItem('trypzy_token')
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
          key: 'trypzy_token',
        })
        const { value: userJson } = await Preferences.get({
          key: 'trypzy_user',
        })

        if (!token) {
          router.replace('/native-login')
          return
        }

        // Copy to localStorage (where API calls read Authorization header from)
        localStorage.setItem('trypzy_token', token)
        if (userJson) {
          localStorage.setItem('trypzy_user', userJson)
        }

        setStatus('Redirecting...')

        // Check for pending deep link
        const { value: pendingUrl } = await Preferences.get({
          key: 'pending_url',
        })

        if (pendingUrl) {
          await Preferences.remove({ key: 'pending_url' })
          router.replace(pendingUrl)
        } else {
          router.replace('/dashboard')
        }
      } catch {
        router.replace('/native-login')
      }
    }

    bridge()
  }, [router])

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4">
      <div className="text-center">
        <TrypzyLogo variant="full" className="h-10 w-auto mx-auto mb-4" />
        <BrandedSpinner size="lg" className="mx-auto mb-3" />
        <p className="text-sm text-[#6B7280]">{status}</p>
      </div>
    </div>
  )
}
