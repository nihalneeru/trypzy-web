'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Users, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { BrandedSpinner } from '@/components/common/BrandedSpinner'

export default function JoinCirclePage({ params }) {
  const router = useRouter()
  const { data: session, status } = useSession()
  const [circleInfo, setCircleInfo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [joining, setJoining] = useState(false)
  const [token, setToken] = useState(null)

  // Normalize invite code
  const inviteCode = params.inviteCode?.trim().toUpperCase()

  // Load token from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedToken = localStorage.getItem('trypzy_token')
      if (storedToken) {
        setToken(storedToken)
      }
    }
  }, [])

  // Check for return-from-auth (cookie exists)
  useEffect(() => {
    if (status === 'authenticated') {
      const cookies = document.cookie.split(';').map(c => c.trim())
      const pendingCookie = cookies.find(c => c.startsWith('pendingCircleInvite='))
      if (pendingCookie) {
        const cookieCode = pendingCookie.split('=')[1]?.trim().toUpperCase()
        // Clear cookie immediately
        document.cookie = 'pendingCircleInvite=; path=/; max-age=0'
        // If cookie matches current code, auto-trigger join
        if (cookieCode === inviteCode) {
          handleJoin()
        }
      }
    }
  }, [status, inviteCode])

  // Fetch circle info when logged in
  useEffect(() => {
    async function fetchCircleInfo() {
      if (status === 'loading') return

      if (status === 'unauthenticated') {
        setLoading(false)
        return
      }

      // Wait for token to be loaded
      if (!token) return

      try {
        const res = await fetch(`/api/circles/validate-invite?code=${encodeURIComponent(inviteCode)}`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        })
        const data = await res.json()

        // If already a member, redirect to circle
        if (data.valid && data.alreadyMember && data.circleId) {
          toast.info("You're already in this circle")
          router.push(`/circles/${data.circleId}`)
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
    router.push(`/${path}?returnTo=/join/${inviteCode}`)
  }

  // Handle join (for logged-in users)
  async function handleJoin() {
    if (joining) return
    setJoining(true)

    // Get token (might not be in state yet if called from auto-join)
    const authToken = token || localStorage.getItem('trypzy_token')

    try {
      const res = await fetch('/api/circles/join', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ inviteCode })
      })

      const data = await res.json()

      if (res.ok && data.circleId) {
        // Clear cookie on success (if it exists)
        document.cookie = 'pendingCircleInvite=; path=/; max-age=0'

        if (data.alreadyMember) {
          toast.info("You're already in this circle")
        } else {
          toast.success('Joined circle!')
        }
        router.push(`/circles/${data.circleId}`)
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
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <BrandedSpinner size="lg" className="mx-auto mb-4" />
          <p className="text-gray-500">Loading invite...</p>
        </div>
      </div>
    )
  }

  // Logged out state - generic message (no validity leak)
  if (status === 'unauthenticated') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-8 pb-8 text-center">
            <div className="h-16 w-16 rounded-full bg-brand-sand flex items-center justify-center mx-auto mb-6">
              <Users className="h-8 w-8 text-brand-blue" />
            </div>
            <h1 className="text-2xl font-bold text-brand-carbon mb-2">
              You're invited to a Trypzy circle
            </h1>
            <p className="text-gray-600 mb-8">
              Sign in to view and join this circle
            </p>
            <div className="space-y-3">
              <Button
                onClick={() => handleAuthRedirect('login')}
                className="w-full"
              >
                Sign in to join
              </Button>
              <Button
                onClick={() => handleAuthRedirect('signup')}
                variant="outline"
                className="w-full"
              >
                Create an account
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Invalid code state
  if (circleInfo && !circleInfo.valid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-8 pb-8 text-center">
            <div className="h-16 w-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-6">
              <AlertTriangle className="h-8 w-8 text-brand-red" />
            </div>
            <h1 className="text-2xl font-bold text-brand-carbon mb-2">
              Invalid Invite
            </h1>
            <p className="text-gray-600 mb-8">
              {circleInfo.error || 'This invite link is invalid or expired'}
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
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-8 pb-8 text-center">
            <div className="h-16 w-16 rounded-full bg-brand-sand flex items-center justify-center mx-auto mb-6">
              <Users className="h-8 w-8 text-brand-blue" />
            </div>
            <p className="text-sm text-gray-500 mb-1">You're invited to join</p>
            <h1 className="text-2xl font-bold text-brand-carbon mb-2">
              {circleInfo.circleName}
            </h1>
            <p className="text-gray-600 mb-8">
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
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <BrandedSpinner size="lg" />
    </div>
  )
}
