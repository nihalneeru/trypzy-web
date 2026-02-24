'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { TripCard } from '@/components/dashboard/TripCard'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Plus, Users, MapPin, Camera, MessageCircle, ChevronLeft } from 'lucide-react'
import { BrandedSpinner } from '@/components/common/BrandedSpinner'
import { CircleDetailSkeleton } from '@/components/circles/CircleDetailSkeleton'
import { AppHeader } from '@/components/common/AppHeader'
import { CircleHeader } from '@/components/circles/CircleHeader'
import { MembersTab } from '@/components/circles/MembersTab'
import { CircleUpdatesTab } from '@/components/circles/CircleUpdatesTab'
import { PostCard } from '@/components/circles/PostCard'
import { CreatePostDialog } from '@/components/circles/CreatePostDialog'
import { EditPostDialog } from '@/components/discover/EditPostDialog'
import { CreateTripDialog } from '@/components/dashboard/CreateTripDialog'
import { toast } from 'sonner'

/**
 * Circle Detail Page — Full-featured with tabs:
 * Circle Updates (default), Members, Trips, Memories
 */
export default function CircleDetailPage() {
  const params = useParams()
  const router = useRouter()
  const circleId = params?.circleId

  const [circle, setCircle] = useState(null)
  const [token, setToken] = useState(null)
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Tab state — default to Circle Updates (matching old behavior)
  const [activeTab, setActiveTab] = useState('updates')

  // Smart default: switch to 'trips' tab if updates are empty but trips exist
  useEffect(() => {
    if (circle && activeTab === 'updates') {
      const hasTrips = Array.isArray(circle.trips) && circle.trips.length > 0
      // Only auto-switch if user hasn't manually changed tabs
      // We check if circle just loaded (loading just turned false)
      if (hasTrips && (!circle.updates || circle.updates.length === 0)) {
        setActiveTab('trips')
      }
    }
  }, [circle]) // eslint-disable-line react-hooks/exhaustive-deps

  // Trips tab: create trip dialog
  const [showCreateTrip, setShowCreateTrip] = useState(false)

  // Memories tab state
  const [posts, setPosts] = useState([])
  const [loadingPosts, setLoadingPosts] = useState(false)
  const [showCreatePost, setShowCreatePost] = useState(false)
  const [editingPost, setEditingPost] = useState(null)

  // Auth check
  useEffect(() => {
    const storedToken = typeof window !== 'undefined' ? localStorage.getItem('tripti_token') : null
    const storedUser = typeof window !== 'undefined' ? localStorage.getItem('tripti_user') : null

    if (!storedToken || !storedUser) {
      router.replace('/')
      return
    }

    let parsed
    try {
      parsed = JSON.parse(storedUser)
    } catch {
      router.replace('/')
      return
    }

    setToken(storedToken)
    setUser(parsed)
  }, [router])

  // Fetch circle data
  const loadCircle = useCallback(async () => {
    if (!token || !circleId) return

    try {
      const res = await fetch(`/api/circles/${circleId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (res.status === 401) {
        localStorage.removeItem('tripti_token')
        localStorage.removeItem('tripti_user')
        router.replace('/')
        return
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        if (data.error?.includes('Unauthorized') || data.error?.includes('not a member')) {
          router.replace('/dashboard')
          return
        }
        setError(data.error || 'Failed to load circle')
        setLoading(false)
        return
      }

      const data = await res.json()
      setCircle(data)
      setLoading(false)
    } catch {
      setError('Network error. Please check your connection.')
      setLoading(false)
    }
  }, [token, circleId, router])

  useEffect(() => {
    if (token && circleId) {
      loadCircle()
    }
  }, [token, circleId, loadCircle])

  // Fetch posts when memories tab is active
  const loadPosts = useCallback(async () => {
    if (!token || !circleId) return
    setLoadingPosts(true)
    try {
      const res = await fetch(`/api/circles/${circleId}/posts`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setPosts(data)
      }
    } catch {
      // Silently fail
    } finally {
      setLoadingPosts(false)
    }
  }, [token, circleId])

  useEffect(() => {
    if (activeTab === 'memories' && token && circleId) {
      loadPosts()
    }
  }, [activeTab, token, circleId, loadPosts])

  const handleDeletePost = async (postId) => {
    try {
      const res = await fetch(`/api/posts/${postId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to delete post')
      }
      toast.success('Memory deleted')
      loadPosts()
    } catch (err) {
      toast.error(err.message)
    }
  }

  // Loading state
  if (loading) {
    return <CircleDetailSkeleton />
  }

  // Error state
  if (error || !circle) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-sm px-4">
          <p className="text-brand-carbon text-lg font-medium mb-2">
            {error || 'Circle not found'}
          </p>
          <Button onClick={() => router.push('/dashboard')} className="mt-4">
            Back to Dashboard
          </Button>
        </div>
      </div>
    )
  }

  const sortedTrips = Array.isArray(circle.trips) ? circle.trips : []

  return (
    <div className="min-h-screen bg-gray-50" data-testid="circle-page">
      <AppHeader userName={user?.name} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back navigation */}
        <button
          onClick={() => router.push('/dashboard')}
          className="flex items-center gap-1 text-sm text-brand-blue hover:underline mb-4"
        >
          <ChevronLeft className="h-4 w-4" />
          Dashboard
        </button>

        {/* Circle Header (name, description, invite code, leave) */}
        <CircleHeader
          circle={circle}
          token={token}
          onLeft={() => {
            toast.success('You left the circle')
            router.push('/dashboard')
          }}
        />

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6 w-full sm:w-auto h-auto sm:h-9">
            <TabsTrigger value="updates" className="flex-1 sm:flex-none flex-col sm:flex-row gap-0.5 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-1">
              <MessageCircle className="h-4 w-4 shrink-0" />
              <span className="text-[11px] sm:text-sm leading-tight">Updates</span>
            </TabsTrigger>
            <TabsTrigger value="members" className="flex-1 sm:flex-none flex-col sm:flex-row gap-0.5 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-1">
              <Users className="h-4 w-4 shrink-0" />
              <span className="text-[11px] sm:text-sm leading-tight">
                Members{circle?.members?.length ? ` (${circle.members.length})` : ''}
              </span>
            </TabsTrigger>
            <TabsTrigger value="trips" className="flex-1 sm:flex-none flex-col sm:flex-row gap-0.5 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-1">
              <MapPin className="h-4 w-4 shrink-0" />
              <span className="text-[11px] sm:text-sm leading-tight">
                Trips{sortedTrips.length ? ` (${sortedTrips.length})` : ''}
              </span>
            </TabsTrigger>
            <TabsTrigger value="memories" className="flex-1 sm:flex-none flex-col sm:flex-row gap-0.5 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-1">
              <Camera className="h-4 w-4 shrink-0" />
              <span className="text-[11px] sm:text-sm leading-tight">
                Memories{posts.length ? ` (${posts.length})` : ''}
              </span>
            </TabsTrigger>
          </TabsList>

          {/* Circle Updates Tab */}
          <TabsContent value="updates">
            <CircleUpdatesTab circleId={circleId} token={token} />
          </TabsContent>

          {/* Members Tab */}
          <TabsContent value="members">
            <MembersTab members={circle.members || []} />
          </TabsContent>

          {/* Trips Tab */}
          <TabsContent value="trips">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-brand-carbon">
                Circle Trips ({sortedTrips.length})
              </h2>
              <Button onClick={() => setShowCreateTrip(true)}>
                <Plus className="h-4 w-4 mr-1" />
                Create Trip
              </Button>
            </div>

            {sortedTrips.length === 0 ? (
              <Card className="text-center py-12">
                <CardContent>
                  <div className="flex justify-center gap-3 mb-4" aria-hidden="true">
                    {[0, 0.6, 1.2].map((delay, i) => (
                      <div
                        key={i}
                        className="w-8 h-8 rounded-full bg-brand-sand animate-breathing-pulse"
                        style={{ animationDelay: `${delay}s` }}
                      />
                    ))}
                  </div>
                  <h3 className="text-lg font-medium text-brand-carbon mb-2">No trips yet</h3>
                  <p className="text-gray-500 mb-4">Start one — your crew is ready.</p>
                  <Button onClick={() => setShowCreateTrip(true)} className="bg-brand-red hover:bg-brand-red/90 text-white">
                    <Plus className="h-4 w-4 mr-1" />
                    Plan a trip
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 items-stretch">
                {sortedTrips.map((trip) => (
                  <TripCard key={trip.id} trip={trip} circleId={circle.id} />
                ))}
              </div>
            )}

            <CreateTripDialog
              open={showCreateTrip}
              onOpenChange={setShowCreateTrip}
              onSuccess={() => {
                setShowCreateTrip(false)
                loadCircle()
              }}
              circleId={circle.id}
              token={token}
              currentUserId={user?.id}
            />
          </TabsContent>

          {/* Memories Tab */}
          <TabsContent value="memories">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-brand-carbon">
                Memories ({posts.length})
              </h2>
              <Button onClick={() => setShowCreatePost(true)}>
                <Camera className="h-4 w-4 mr-1" />
                Share Memory
              </Button>
            </div>

            {loadingPosts ? (
              <div className="flex items-center justify-center py-12">
                <BrandedSpinner size="lg" />
              </div>
            ) : posts.length === 0 ? (
              <Card className="text-center py-12">
                <CardContent>
                  <Camera className="h-10 w-10 text-brand-sand mx-auto mb-4" aria-hidden="true" />
                  <h3 className="text-lg font-medium text-brand-carbon mb-2">No memories yet</h3>
                  <p className="text-gray-500 mb-4">Photos and moments from your trips will show up here.</p>
                  <Button onClick={() => setShowCreatePost(true)} variant="outline" className="border-brand-blue text-brand-blue">
                    <Camera className="h-4 w-4 mr-1" />
                    Share a memory
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid md:grid-cols-2 gap-6">
                {posts.map((post) => (
                  <PostCard
                    key={post.id}
                    post={post}
                    token={token}
                    onDelete={handleDeletePost}
                    onEdit={setEditingPost}
                  />
                ))}
              </div>
            )}

            <EditPostDialog
              open={!!editingPost}
              onOpenChange={(open) => { if (!open) setEditingPost(null) }}
              post={editingPost}
              token={token}
              onSaved={() => { setEditingPost(null); loadPosts() }}
            />

            <CreatePostDialog
              open={showCreatePost}
              onOpenChange={setShowCreatePost}
              circleId={circle.id}
              trips={sortedTrips}
              token={token}
              onCreated={loadPosts}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
