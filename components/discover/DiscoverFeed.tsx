'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Sparkles, Globe, Search, Plus, Users, Compass, UserPlus
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { BrandedSpinner } from '@/components/common/BrandedSpinner'
import { PostCard } from '@/components/circles/PostCard'
import { ShareToDiscoverDialog } from '@/components/discover/ShareToDiscoverDialog'
import { ViewItineraryDialog } from '@/components/discover/ViewItineraryDialog'
import { ProposeToCircleDialog } from '@/components/discover/ProposeToCircleDialog'
import { EditPostDialog } from '@/components/discover/EditPostDialog'
import { tripHref } from '@/lib/navigation/routes'
import { toast } from 'sonner'

interface Circle {
  id: string
  name: string
}

interface Post {
  id: string
  caption?: string
  mediaUrls?: string[]
  destinationText?: string
  createdAt: string
  authorName?: string
  userId?: string
  isAuthor?: boolean
  tripName?: string
  tripId?: string
  hasItinerary?: boolean
  itinerarySnapshot?: any
  [key: string]: any
}

interface DiscoverFeedProps {
  token: string
  circles: Circle[]
}

export function DiscoverFeed({ token, circles }: DiscoverFeedProps) {
  const router = useRouter()

  // Feed state
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [total, setTotal] = useState(0)
  const [scope, setScope] = useState('global')
  const [viewCircleId, setViewCircleId] = useState('')

  // Dialog state
  const [showShareModal, setShowShareModal] = useState(false)
  const [selectedPost, setSelectedPost] = useState<Post | null>(null)
  const [showProposeModal, setShowProposeModal] = useState(false)
  const [proposingPost, setProposingPost] = useState<Post | null>(null)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingPost, setEditingPost] = useState<Post | null>(null)

  const loadPosts = useCallback(async (
    pageNum = 1,
    searchQuery = search,
    currentScope = scope,
    circleId = viewCircleId
  ) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: pageNum.toString(),
        scope: currentScope,
      })
      if (searchQuery) params.append('search', searchQuery)
      if (currentScope === 'circle' && circleId) {
        params.append('circleId', circleId)
      }

      const res = await fetch(`/api/discover/posts?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to load posts')
      }

      const data = await res.json()

      if (pageNum === 1) {
        setPosts(data.posts)
      } else {
        setPosts(prev => [...prev, ...data.posts])
      }
      setHasMore(data.pagination.hasMore)
      setTotal(data.pagination.total)
      setPage(pageNum)
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setLoading(false)
    }
  }, [token, search, scope, viewCircleId])

  // Load when scope or circle changes
  useEffect(() => {
    if (scope === 'circle' && !viewCircleId) {
      setPosts([])
      setTotal(0)
      setHasMore(false)
      setLoading(false)
      return
    }
    loadPosts(1, search, scope, viewCircleId)
  }, [scope, viewCircleId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Initial load
  useEffect(() => {
    if (scope !== 'circle' || viewCircleId) {
      loadPosts(1)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setSearch(searchInput)
    loadPosts(1, searchInput, scope, viewCircleId)
  }

  const loadMore = () => {
    loadPosts(page + 1, search, scope, viewCircleId)
  }

  const handleViewItinerary = (post: Post) => {
    setSelectedPost(post)
  }

  const handleDeletePost = async (postId: string) => {
    if (!confirm('Are you sure you want to delete this post?')) return

    try {
      const res = await fetch(`/api/posts/${postId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to delete post')
      }

      toast.success('Post deleted')
      loadPosts(1, search, scope, viewCircleId)
    } catch (error: any) {
      toast.error(error.message)
    }
  }

  const handleEditPost = (post: Post) => {
    setEditingPost(post)
    setShowEditModal(true)
  }

  const handleProposeTrip = (post: Post) => {
    setProposingPost(post)
    setShowProposeModal(true)
  }

  const handleProposed = (tripId: string) => {
    router.push(tripHref(tripId))
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-brand-carbon flex items-center gap-2">
            <Sparkles className="h-8 w-8 text-brand-red" />
            Discover
          </h1>
          <p className="text-gray-600 mt-1">Travel stories and inspiration from fellow explorers</p>
        </div>
        <Button onClick={() => setShowShareModal(true)} className="flex-shrink-0">
          <Plus className="h-4 w-4 mr-2" />
          Share to Discover
        </Button>
      </div>

      {/* Scope Toggle */}
      <div className="mb-6 flex items-center gap-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setScope('global')
              setViewCircleId('')
            }}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              scope === 'global'
                ? 'bg-brand-red text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Global
          </button>
          <button
            onClick={() => setScope('circle')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              scope === 'circle'
                ? 'bg-brand-red text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            My Circles
          </button>
        </div>

        {/* Circle selector */}
        {scope === 'circle' && (
          <>
            {circles && circles.length > 0 ? (
              <Select value={viewCircleId || undefined} onValueChange={(value) => setViewCircleId(value || '')}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Select a circle..." />
                </SelectTrigger>
                <SelectContent>
                  {circles.map((circle) => (
                    <SelectItem key={circle.id} value={circle.id}>
                      {circle.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-sm text-gray-500">No circles available. Join a circle to see circle-scoped posts.</p>
            )}
          </>
        )}
      </div>

      {/* Search */}
      <div className="mb-6">
        <form onSubmit={handleSearch}>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search destinations, stories..."
                className="pl-10"
              />
            </div>
            <Button type="submit">Search</Button>
          </div>
        </form>
      </div>

      {/* Results count */}
      {search && (
        <p className="text-sm text-gray-500 mb-4">
          Found {total} {total === 1 ? 'story' : 'stories'} for &ldquo;{search}&rdquo;
        </p>
      )}

      {/* Feed */}
      {loading && posts.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <BrandedSpinner size="lg" />
        </div>
      ) : scope === 'circle' && !viewCircleId && circles && circles.length > 0 ? (
        <Card className="text-center py-12">
          <CardContent>
            <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Select a Circle
            </h3>
            <p className="text-gray-500 mb-4 max-w-sm mx-auto">
              Choose a circle from the dropdown above to see travel stories from your friends,
              or browse all public stories.
            </p>
          </CardContent>
        </Card>
      ) : posts.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent>
            <Globe className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {search ? 'No stories found' : 'No stories yet'}
            </h3>
            <p className="text-gray-500 mb-4 max-w-sm mx-auto">
              {search
                ? 'Try a different search term or browse all stories.'
                : 'Discover is where travel stories from your circles appear. Share your adventures or start planning a trip!'}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              {!search && (
                <Button onClick={() => setShowShareModal(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Share Your Story
                </Button>
              )}
              <Button variant="outline" asChild>
                <Link href="/dashboard">
                  Go to Dashboard
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid md:grid-cols-2 gap-6">
            {posts.map((post) => (
              <div key={post.id}>
                <PostCard
                  post={post}
                  isDiscoverView
                  token={token}
                  onViewItinerary={post.hasItinerary ? handleViewItinerary : undefined}
                  onProposeTrip={post.hasItinerary ? handleProposeTrip : undefined}
                  onDelete={post.isAuthor ? handleDeletePost : undefined}
                  onEdit={post.isAuthor ? handleEditPost : undefined}
                />
                {/* CTA for posts without itinerary */}
                {!post.hasItinerary && (
                  <Button
                    variant="outline"
                    className="w-full mt-2"
                    onClick={() => router.push('/dashboard')}
                  >
                    <Compass className="h-4 w-4 mr-2" />
                    Create a similar trip
                  </Button>
                )}
                {/* CTA for posts with itinerary */}
                {post.hasItinerary && (
                  <Button
                    className="w-full mt-2"
                    onClick={() => handleProposeTrip(post)}
                  >
                    <UserPlus className="h-4 w-4 mr-2" />
                    Propose this trip to a circle
                  </Button>
                )}
              </div>
            ))}
          </div>

          {hasMore && (
            <div className="text-center mt-8">
              <Button variant="outline" onClick={loadMore} disabled={loading}>
                {loading ? 'Loading...' : 'Load More Stories'}
              </Button>
            </div>
          )}
        </>
      )}

      {/* Dialogs */}
      <ShareToDiscoverDialog
        open={showShareModal}
        onOpenChange={setShowShareModal}
        circles={circles}
        token={token}
        onCreated={() => loadPosts(1, search, scope, viewCircleId)}
      />

      <ViewItineraryDialog
        post={selectedPost}
        onClose={() => setSelectedPost(null)}
        onProposeTrip={handleProposeTrip}
      />

      <ProposeToCircleDialog
        open={showProposeModal}
        onOpenChange={setShowProposeModal}
        post={proposingPost}
        circles={circles}
        token={token}
        onProposed={handleProposed}
      />

      <EditPostDialog
        open={showEditModal}
        onOpenChange={setShowEditModal}
        post={editingPost}
        token={token}
        onSaved={() => {
          setShowEditModal(false)
          setEditingPost(null)
          loadPosts(1, search, scope, viewCircleId)
        }}
      />
    </div>
  )
}
