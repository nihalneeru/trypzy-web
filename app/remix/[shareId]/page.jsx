'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { BrandedSpinner } from '@/components/common/BrandedSpinner'
import { toast } from 'sonner'

export default function RemixPage({ params }) {
  const { shareId } = params
  const router = useRouter()
  const { data: session, status } = useSession()
  const [error, setError] = useState(null)

  useEffect(() => {
    if (status === 'loading') return

    if (status === 'unauthenticated') {
      // Store returnTo so login/signup redirects back here after auth
      localStorage.setItem('tripti_pending_return_to', `/remix/${shareId}`)
      router.push(`/signup?returnTo=${encodeURIComponent(`/remix/${shareId}`)}&remix=${shareId}`)
      return
    }

    // Authenticated — remix the trip
    async function doRemix() {
      const token = session?.accessToken || localStorage.getItem('tripti_token')
      try {
        const res = await fetch('/api/trips/remix', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ shareId }),
        })

        const data = await res.json()

        if (!res.ok) {
          setError(data.error || 'Could not remix this trip')
          return
        }

        toast.success('Trip remixed! Invite your circle to get started.')
        router.push(data.tripUrl)
      } catch (err) {
        setError('Something went wrong. Please try again.')
      }
    }

    doRemix()
  }, [status, session, shareId, router])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white p-4">
        <div className="text-center max-w-md">
          <p className="text-brand-carbon font-semibold text-lg mb-2">Couldn&apos;t remix this trip</p>
          <p className="text-brand-carbon/60 text-sm mb-6">{error}</p>
          <button
            onClick={() => router.push('/')}
            className="text-brand-blue hover:underline text-sm"
          >
            Go to Tripti.ai
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="text-center">
        <BrandedSpinner size="lg" className="mx-auto mb-4" />
        <p className="text-brand-carbon/60 text-sm">Setting up your trip...</p>
      </div>
    </div>
  )
}
