'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * PushHandler — invisible component mounted at app root.
 *
 * Listens for Capacitor push notification taps and navigates
 * to the correct trip + overlay using client-side routing.
 *
 * Replaces the old listener in native-bridge/page.jsx which
 * unmounted after navigation and used window.location.href.
 */
export function PushHandler() {
  const router = useRouter()

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!window.Capacitor?.isNativePlatform?.()) return

    const PushNotifications = window.Capacitor?.Plugins?.PushNotifications
    if (!PushNotifications) return

    // Listen for notification taps
    const listenerPromise = PushNotifications.addListener(
      'pushNotificationActionPerformed',
      (notification) => {
        const data = notification?.notification?.data || {}
        const { tripId, overlay } = data

        if (tripId) {
          const url = overlay
            ? `/trips/${tripId}?overlay=${overlay}`
            : `/trips/${tripId}`
          router.push(url)
        }
      }
    )

    return () => {
      listenerPromise?.then?.(l => l?.remove?.())
    }
  }, [router])

  return null
}
