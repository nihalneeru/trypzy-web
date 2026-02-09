'use client'

import { useState, useEffect } from 'react'
import { GlobalNotifications } from '@/components/dashboard/GlobalNotifications'
import { CircleSection } from '@/components/dashboard/CircleSection'
import { CreateCircleDialog } from '@/components/dashboard/CreateCircleDialog'
import { JoinCircleDialog } from '@/components/dashboard/JoinCircleDialog'
import { CircleOnboardingInterstitial } from '@/components/dashboard/CircleOnboardingInterstitial'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Plus, Users, UserPlus, Calendar } from 'lucide-react'
import { TripFirstFlow } from '@/components/dashboard/TripFirstFlow'
import { BrandedSpinner } from '@/components/common/BrandedSpinner'
import { DashboardSkeleton } from '@/components/dashboard/DashboardSkeleton'
import { AppHeader } from '@/components/common/AppHeader'
import { useRouter, usePathname } from 'next/navigation'
import { toast } from 'sonner'
import { useSession } from 'next-auth/react'

// API Helper
const api = async (endpoint, options = {}, token = null) => {
  const headers = {
    'Content-Type': 'application/json',
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const response = await fetch(`/api${endpoint}`, {
    ...options,
    headers: { ...headers, ...options.headers }
  })

  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.error || 'Something went wrong')
  }

  return data
}

// Dashboard Page
// NOTE: /dashboard is the canonical post-login landing page.
// All authenticated users should land here after login.
export default function DashboardPage() {
  const isTripFirst = process.env.NEXT_PUBLIC_TRIP_FIRST_ONBOARDING === 'true'
  const router = useRouter()
  const pathname = usePathname()
  const { data: session, status } = useSession()
  const [dashboardData, setDashboardData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [token, setToken] = useState(null)
  const [user, setUser] = useState(null)

  // Dialog states
  const [showCreateCircle, setShowCreateCircle] = useState(false)
  const [showJoinCircle, setShowJoinCircle] = useState(false)
  const [showTripFirst, setShowTripFirst] = useState(false)
  const [newCircle, setNewCircle] = useState(null) // For onboarding interstitial

  // Dev-only navigation tracing
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('[NAV] dashboard page mounted', { pathname, hasToken: !!token, hasUser: !!user })
    }
  }, [pathname, token, user])

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        // Check for OAuth callback tokens in URL params first
        if (typeof window !== 'undefined') {
          const urlParams = new URLSearchParams(window.location.search)
          const oauthToken = urlParams.get('token')
          const oauthUser = urlParams.get('user')

          if (oauthToken && oauthUser) {
            // Store OAuth tokens in localStorage
            localStorage.setItem('trypzy_token', oauthToken)
            localStorage.setItem('trypzy_user', oauthUser)
            // Clean up URL
            window.history.replaceState({}, '', '/dashboard')
          }
        }

        let tokenValue = localStorage.getItem('trypzy_token')
        let userValue = localStorage.getItem('trypzy_user')

        // If no local token but valid session exists (e.g. from direct Google redirect), sync it
        if (!tokenValue && status === 'authenticated' && session?.accessToken) {
          // Check for auth errors
          if (session.error) {
            toast.error(session.error)
            router.replace('/')
            return
          }

          tokenValue = session.accessToken
          localStorage.setItem('trypzy_token', tokenValue)

          // Construct user object from session if needed
          if (!userValue && session.user) {
            const userData = {
              id: session.user.id,
              email: session.user.email,
              name: session.user.name
            }
            userValue = JSON.stringify(userData)
            localStorage.setItem('trypzy_user', userValue)
          }

          // Clear auth mode cookie after successful sync
          document.cookie = 'trypzy_auth_mode=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT'
        }

        if (!tokenValue) {
          // Only redirect if truly no token and session is determined (not loading)
          if (status !== 'loading') {
            // Auth gate: redirect to login if not authenticated
            router.replace('/')
          }
          return
        }

        setToken(tokenValue)
        if (userValue) {
          setUser(JSON.parse(userValue))
        }

        const data = await api('/dashboard', { method: 'GET' }, tokenValue)
        setDashboardData(data)
      } catch (err) {
        console.error('Dashboard error:', err)
        // If unauthorized, redirect to login with clean URL (before setError to avoid flash)
        if (err.message?.includes('Unauthorized')) {
          localStorage.removeItem('trypzy_token')
          localStorage.removeItem('trypzy_user')
          router.replace('/')
          return
        }
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    // Only run loadDashboard when session status is settled (or we have local tokens)
    if (status !== 'loading' || localStorage.getItem('trypzy_token')) {
      loadDashboard()
    }
  }, [router, session, status])

  const reloadDashboard = async () => {
    try {
      const tokenValue = localStorage.getItem('trypzy_token')
      if (!tokenValue) return

      const data = await api('/dashboard', { method: 'GET' }, tokenValue)
      setDashboardData(data)
    } catch (err) {
      console.error('Dashboard reload error:', err)
    }
  }

  const handleCreateCircleSuccess = (circleData) => {
    // Show onboarding interstitial instead of immediately reloading
    setNewCircle(circleData)
    reloadDashboard()
  }

  const handleOnboardingSkip = () => {
    setNewCircle(null)
    // Optionally navigate to circle page if needed
    // For now, user stays on dashboard
  }

  const handleJoinCircleSuccess = () => {
    reloadDashboard()
  }

  if (loading) {
    return <DashboardSkeleton />
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card>
          <CardContent className="py-8 px-6">
            <p className="text-red-600">Error loading dashboard: {error}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!dashboardData) {
    return null
  }

  return (
    <div className="min-h-screen bg-gray-50" data-testid="dashboard-page">
      <AppHeader userName={user?.name} activePage="circles" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">Dashboard</h1>

        {/* Global Notifications */}
        <GlobalNotifications notifications={dashboardData.globalNotifications || []} />

        {/* Your Circles / Trips Heading */}
        {dashboardData.circles && dashboardData.circles.length > 0 && (
          <div className="flex items-center justify-between mb-6 mt-2 flex-wrap gap-3">
            <div>
              <h2 className="text-2xl font-semibold text-gray-900">
                {isTripFirst && dashboardData.circles.length === 1 ? 'Your Trips' : 'Your Circles'}
              </h2>
              {isTripFirst && dashboardData.circles.length === 1 && (
                <p className="text-xs text-gray-500 mt-0.5">
                  Circle:{' '}
                  <a href={`/circles/${dashboardData.circles[0].id}`} className="hover:underline text-brand-blue">
                    {dashboardData.circles[0].name}
                  </a>
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowJoinCircle(true)}
              >
                <UserPlus className="h-4 w-4 mr-2" />
                Join Circle
              </Button>
              <Button
                size="sm"
                onClick={() => setShowCreateCircle(true)}
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Circle
              </Button>
            </div>
          </div>
        )}

        {/* Circle Sections */}
        {dashboardData.circles && dashboardData.circles.length === 0 ? (
          isTripFirst ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h2 className="text-lg font-medium text-gray-900 mb-2">Plan your first trip</h2>
                <p className="text-gray-500 mb-2 max-w-md mx-auto">
                  You've got something in mind — let's get it started.
                </p>
                <p className="text-xs text-gray-500 mb-6 max-w-md mx-auto">
                  Your travelers will be saved as a group for future trips.
                </p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
                  <div className="text-center">
                    <Button onClick={() => setShowTripFirst(true)}>
                      <Calendar className="h-4 w-4 mr-2" />
                      Plan a trip
                    </Button>
                  </div>
                  <span className="text-gray-300 hidden sm:inline">or</span>
                  <div className="text-center">
                    <Button variant="outline" onClick={() => setShowJoinCircle(true)}>
                      <UserPlus className="h-4 w-4 mr-2" />
                      Join a friend's trip
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h2 className="text-lg font-medium text-gray-900 mb-2">No circles yet</h2>
                <p className="text-gray-500 mb-6 max-w-md mx-auto">
                  Circles are your travel groups — friends, family, or any crew you plan trips with.
                  Everyone in a circle can propose and join trips together.
                </p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
                  <div className="text-center">
                    <Button onClick={() => setShowCreateCircle(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Create circle
                    </Button>
                    <p className="text-xs text-gray-400 mt-1">Start a new group</p>
                  </div>
                  <span className="text-gray-300 hidden sm:inline">or</span>
                  <div className="text-center">
                    <Button variant="outline" onClick={() => setShowJoinCircle(true)}>
                      <UserPlus className="h-4 w-4 mr-2" />
                      Join circle
                    </Button>
                    <p className="text-xs text-gray-400 mt-1">Got an invite code?</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        ) : (
          dashboardData.circles.map((circle) => (
            <CircleSection
              key={circle.id}
              circle={circle}
              token={token}
              currentUserId={user?.id}
              onTripCreated={reloadDashboard}
            />
          ))
        )}
      </div>

      {/* Dialogs */}
      {token && (
        <>
          <CreateCircleDialog
            open={showCreateCircle}
            onOpenChange={setShowCreateCircle}
            onSuccess={handleCreateCircleSuccess}
            token={token}
          />
          <JoinCircleDialog
            open={showJoinCircle}
            onOpenChange={setShowJoinCircle}
            onSuccess={handleJoinCircleSuccess}
            token={token}
          />
          <CircleOnboardingInterstitial
            open={!!newCircle}
            onOpenChange={(open) => {
              if (!open) setNewCircle(null)
            }}
            circle={newCircle}
            token={token}
            onSkip={handleOnboardingSkip}
          />
          {isTripFirst && (
            <TripFirstFlow
              open={showTripFirst}
              onOpenChange={setShowTripFirst}
              token={token}
              onSuccess={() => reloadDashboard()}
            />
          )}
        </>
      )}
    </div>
  )
}
