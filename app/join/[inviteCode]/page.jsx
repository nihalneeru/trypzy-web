'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Users, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { BrandedSpinner } from '@/components/common/BrandedSpinner'

export default function JoinCirclePage({ params }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { data: session, status } = useSession()
  const [circleInfo, setCircleInfo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [joining, setJoining] = useState(false)
  const [token, setToken] = useState(null)
  const [invitePreview, setInvitePreview] = useState(null)

  // Normalize invite code
  const inviteCode = params.inviteCode?.trim().toUpperCase()

  // Trip-context params (from invite link shared within a trip)
  const tripId = searchParams.get('tripId')
  const ref = searchParams.get('ref')

  // Load token from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedToken = localStorage.getItem('tripti_token')
      if (storedToken) {
        setToken(storedToken)
      }
    }
  }, [])

  // Fetch invite preview (no auth needed) for personalized landing
  useEffect(() => {
    async function fetchPreview() {
      try {
        const previewParams = new URLSearchParams({ code: inviteCode })
        if (tripId) previewParams.set('tripId', tripId)
        if (ref) previewParams.set('ref', ref)
        const res = await fetch(`/api/invite-preview?${previewParams}`)
        const data = await res.json()
        if (data.valid) {
          setInvitePreview(data)
        }
      } catch (e) {
        // Silent fail — falls back to generic UI
      }
    }
    fetchPreview()
  }, [inviteCode, tripId, ref])

  // Check if we're returning from auth and should auto-join
  // Uses both cookie (original mechanism) and localStorage (more reliable across OAuth redirects)
  function shouldAutoJoin() {
    // Check pendingCircleInvite cookie
    const cookies = document.cookie.split(';').map(c => c.trim())
    const pendingCookie = cookies.find(c => c.startsWith('pendingCircleInvite='))
    if (pendingCookie) {
      const cookieCode = pendingCookie.split('=')[1]?.trim().toUpperCase()
      document.cookie = 'pendingCircleInvite=; path=/; max-age=0'
      if (cookieCode === inviteCode) return true
    }
    // Check localStorage returnTo (set by handleAuthRedirect, survives OAuth)
    const pendingReturnTo = localStorage.getItem('tripti_pending_return_to')
    if (pendingReturnTo && pendingReturnTo.includes(`/join/${inviteCode}`)) {
      localStorage.removeItem('tripti_pending_return_to')
      return true
    }
    return false
  }

  // Auto-join when returning from auth (cookie or localStorage signal)
  // Wait for session.accessToken to be available — useSession resolves it
  // before the token-loading effect can populate the `token` state variable
  useEffect(() => {
    if (status === 'authenticated' && session?.accessToken && shouldAutoJoin()) {
      handleJoin()
    }
  }, [status, session?.accessToken, inviteCode])

  // Fetch circle info when logged in
  useEffect(() => {
    async function fetchCircleInfo() {
      if (status === 'loading') return

      if (status === 'unauthenticated') {
        setLoading(false)
        return
      }

      // Wait for an auth token to be available
      const authToken = session?.accessToken || token || localStorage.getItem('tripti_token')
      if (!authToken) return

      try {
        const res = await fetch(`/api/circles/validate-invite?code=${encodeURIComponent(inviteCode)}`, {
          headers: {
            'Authorization': `Bearer ${authToken}`
          }
        })
        const data = await res.json()

        // If already a member, redirect to trip (if context) or circle
        if (data.valid && data.alreadyMember && data.circleId) {
          toast.info("You're already in this circle")
          router.push(tripId ? `/trips/${tripId}` : `/circles/${data.circleId}`)
          return
        }

        setCircleInfo(data)
      } catch (error) {
        console.error('Failed to validate invite:', error)
        setCircleInfo({ valid: false, error: 'Unable to validate invite' })
      } finally {
        setLoading(false)
      }
    }

    fetchCircleInfo()
  }, [status, inviteCode, router, token])

  // Handle auth redirect (sets cookie on user intent)
  function handleAuthRedirect(path) {
    const secure = window.location.protocol === 'https:' ? '; Secure' : ''
    document.cookie = `pendingCircleInvite=${inviteCode}; path=/; max-age=3600; SameSite=Lax${secure}`
    // Build returnTo with full query params so trip context survives auth round-trip
    const returnToParams = new URLSearchParams()
    if (tripId) returnToParams.set('tripId', tripId)
    if (ref) returnToParams.set('ref', ref)
    const qs = returnToParams.toString()
    const returnTo = `/join/${inviteCode}${qs ? '?' + qs : ''}`
    // Store in localStorage (survives OAuth round-trip more reliably than sessionStorage)
    localStorage.setItem('tripti_pending_return_to', returnTo)
    router.push(`/${path}?returnTo=${encodeURIComponent(returnTo)}`)
  }

  // Handle join (for logged-in users)
  async function handleJoin() {
    if (joining) return
    setJoining(true)

    // Prefer session.accessToken (always available when status=authenticated),
    // fall back to state/localStorage for manual join clicks
    const authToken = session?.accessToken || token || localStorage.getItem('tripti_token')

    try {
      const res = await fetch('/api/circles/join', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          inviteCode,
          ...(tripId ? { tripId } : {}),
          ...(ref ? { invitedBy: ref } : {})
        })
      })

      const data = await res.json()

      if (res.ok && data.circleId) {
        // Clear cookie on success (if it exists)
        document.cookie = 'pendingCircleInvite=; path=/; max-age=0'

        // Determine redirect: trip page (if trip context) or circle page
        const redirectTripId = data.tripId || tripId
        const destination = redirectTripId ? `/trips/${redirectTripId}` : `/circles/${data.circleId}`

        if (data.alreadyMember) {
          toast.info("You're already in this circle")
        } else {
          toast.success('Joined circle!')
        }
        router.push(destination)
      } else {
        toast.error(data.error || 'Could not join circle — please try again')
        setJoining(false)
      }
    } catch (error) {
      console.error('Join error:', error)
      toast.error('Could not join circle — please try again')
      setJoining(false)
    }
  }

  // Loading state (wait for session status and token if authenticated)
  if (loading || status === 'loading' || (status === 'authenticated' && !token)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-sand/30">
        <div className="text-center">
          <BrandedSpinner size="lg" className="mx-auto mb-4" />
          <p className="text-brand-carbon/60">Loading invite...</p>
        </div>
      </div>
    )
  }

  // Logged out state - personalized magic landing (or generic fallback)
  if (status === 'unauthenticated') {
    const preview = invitePreview
    const hasTrip = preview?.trip?.name
    const headline = preview?.inviterName
      ? hasTrip
        ? `${preview.inviterName} invited you to ${preview.trip.name}`
        : `${preview.inviterName} invited you to join ${preview.circleName}`
      : hasTrip
        ? `You're invited to ${preview?.trip?.name}`
        : `You're invited to join a circle on TRIPTI.ai`

    return (
      <div className="min-h-screen flex items-center justify-center bg-white p-4">
        <div className="w-full max-w-md text-center">
          {/* Tripti branding */}
          <div className="mb-8">
            <img
              src="/brand/tripti-logo.svg"
              alt="Tripti.ai"
              className="h-7 w-auto mx-auto mb-6"
            />
          </div>

          <div className="h-16 w-16 rounded-full bg-brand-sand flex items-center justify-center mx-auto mb-6">
            <Users className="h-8 w-8 text-brand-blue" />
          </div>

          <h1 className="text-2xl font-bold text-brand-carbon mb-2">
            {headline}
          </h1>

          {hasTrip && preview.trip.destinationHint && (
            <p className="text-base text-brand-red font-medium mb-1">
              {preview.trip.destinationHint}
            </p>
          )}

          <p className="text-brand-carbon/60 text-sm mb-8">
            {preview?.memberCount
              ? `${preview.memberCount} ${preview.memberCount === 1 ? 'person' : 'people'} already planning`
              : 'Share availability, pick dates, and coordinate together'}
          </p>

          <div className="space-y-3">
            <Button
              onClick={() => handleAuthRedirect('signup')}
              className="w-full bg-brand-red hover:bg-brand-red/90 text-white"
            >
              Sign up to join
            </Button>
            <Button
              onClick={() => handleAuthRedirect('login')}
              variant="outline"
              className="w-full"
            >
              I already have an account
            </Button>
          </div>

          <p className="text-xs text-brand-carbon/40 mt-6">
            Plan trips with your circle — without the group chat chaos.
          </p>
        </div>
      </div>
    )
  }

  // Invalid code state
  if (circleInfo && !circleInfo.valid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-sand/30 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-8 pb-8 text-center">
            <div className="h-16 w-16 rounded-full bg-brand-red/10 flex items-center justify-center mx-auto mb-6">
              <AlertTriangle className="h-8 w-8 text-brand-red" />
            </div>
            <h1 className="text-2xl font-bold text-brand-carbon mb-2">
              This invite link isn't valid
            </h1>
            <p className="text-brand-carbon/70 mb-2">
              {circleInfo.error || 'It may have expired or already been used.'}
            </p>
            <p className="text-brand-carbon/50 mb-8 text-sm">
              Ask your friend to resend the link.
            </p>
            <Button
              onClick={() => router.push('/dashboard')}
              variant="outline"
            >
              Go to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Valid code, logged in - show circle info
  if (circleInfo?.valid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-sand/30 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-8 pb-8 text-center">
            <div className="h-16 w-16 rounded-full bg-brand-sand flex items-center justify-center mx-auto mb-6">
              <Users className="h-8 w-8 text-brand-blue" />
            </div>
            <p className="text-sm text-brand-carbon/60 mb-1">You're invited to join</p>
            <h1 className="text-2xl font-bold text-brand-carbon mb-2">
              {circleInfo.circleName}
            </h1>
            <p className="text-brand-carbon/70 mb-8">
              {circleInfo.memberCount} member{circleInfo.memberCount !== 1 ? 's' : ''}
            </p>
            <Button
              onClick={handleJoin}
              disabled={joining}
              className="w-full"
            >
              {joining ? 'Joining...' : 'Join Circle'}
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Fallback loading
  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-sand/30">
      <BrandedSpinner size="lg" />
    </div>
  )
}
