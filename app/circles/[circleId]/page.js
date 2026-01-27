'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { TripCard } from '@/components/dashboard/TripCard'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Plus, Users, MapPin, Camera, MessageCircle } from 'lucide-react'
import { BrandedSpinner } from '@/components/common/BrandedSpinner'
import { AppHeader } from '@/components/common/AppHeader'
import { CircleHeader } from '@/components/circles/CircleHeader'
import { MembersTab } from '@/components/circles/MembersTab'
import { CircleUpdatesTab } from '@/components/circles/CircleUpdatesTab'
import { PostCard } from '@/components/circles/PostCard'
import { CreatePostDialog } from '@/components/circles/CreatePostDialog'
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

  // Trips tab: create trip dialog
  const [showCreateTrip, setShowCreateTrip] = useState(false)

  // Memories tab state
  const [posts, setPosts] = useState([])
  const [loadingPosts, setLoadingPosts] = useState(false)
  const [showCreatePost, setShowCreatePost] = useState(false)

  // Auth check
  useEffect(() => {
    const storedToken = typeof window !== 'undefined' ? localStorage.getItem('trypzy_token') : null
    const storedUser = typeof window !== 'undefined' ? localStorage.getItem('trypzy_user') : null

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
        localStorage.removeItem('trypzy_token')
        localStorage.removeItem('trypzy_user')
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
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <BrandedSpinner size="lg" className="mx-auto mb-4" />
          <p className="text-brand-carbon/60">Loading circle...</p>
        </div>
      </div>
    )
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
          <TabsList className="mb-6">
            <TabsTrigger value="updates">
              <MessageCircle className="h-4 w-4 mr-2" />
              Circle Updates
            </TabsTrigger>
            <TabsTrigger value="members">
              <Users className="h-4 w-4 mr-2" />
              Members
            </TabsTrigger>
            <TabsTrigger value="trips">
              <MapPin className="h-4 w-4 mr-2" />
              Trips
            </TabsTrigger>
            <TabsTrigger value="memories">
              <Camera className="h-4 w-4 mr-2" />
              Memories
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
                  <MapPin className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No trips yet</h3>
                  <p className="text-gray-500 mb-4">Create a trip to start planning with your circle</p>
                  <Button onClick={() => setShowCreateTrip(true)}>
                    <Plus className="h-4 w-4 mr-1" />
                    Create Trip
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
                  <Camera className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No memories yet</h3>
                  <p className="text-gray-500 mb-4">Share photos and moments from your trips</p>
                  <Button onClick={() => setShowCreatePost(true)}>
                    <Camera className="h-4 w-4 mr-1" />
                    Share your first memory
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
                  />
                ))}
              </div>
            )}

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
