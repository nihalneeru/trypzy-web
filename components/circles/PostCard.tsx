'use client'

import { useState } from 'react'
import {
  MapPin, Globe, Sun, Sunset, Moon, Clock,
  ChevronUp, ChevronDown, ListTodo, Edit, Trash2, Flag, Eye, UserPlus
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter
} from '@/components/ui/dialog'
import { toast } from 'sonner'

function formatRelativeTime(dateStr: string) {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (mins <= 1) return 'Just now'
  if (mins < 60) return `${mins} min ago`
  if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

interface ItineraryDay {
  dayNumber: number
  items: Array<{ timeBlock: string; title: string }>
  hasMore?: boolean
  totalItems?: number
}

interface Post {
  id: string
  mediaUrls?: string[]
  caption?: string
  destinationText?: string
  discoverable?: boolean
  createdAt: string
  isAuthor?: boolean
  author?: { id?: string; name: string }
  authorName?: string
  trip?: { id?: string; name: string }
  tripName?: string
  itinerarySnapshot?: {
    tripLength: number
    style: string
    days?: ItineraryDay[]
  }
}

interface PostCardProps {
  post: Post
  onDelete?: (postId: string) => void
  onEdit?: (post: Post) => void
  showCircle?: boolean
  isDiscoverView?: boolean
  onViewItinerary?: (post: Post) => void
  onProposeTrip?: (post: Post) => void
  token?: string
}

export function PostCard({
  post, onDelete, onEdit, showCircle = false,
  isDiscoverView = false, onViewItinerary, onProposeTrip, token
}: PostCardProps) {
  const [showReportDialog, setShowReportDialog] = useState(false)
  const [reportReason, setReportReason] = useState('')
  const [reporting, setReporting] = useState(false)
  const [itineraryExpanded, setItineraryExpanded] = useState(false)

  const handleReport = async () => {
    if (!reportReason.trim()) return
    setReporting(true)
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ postId: post.id, reason: reportReason }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to submit report')
      }
      toast.success('Report submitted. Thank you.')
      setShowReportDialog(false)
      setReportReason('')
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setReporting(false)
    }
  }

  const getTimeBlockIcon = (timeBlock: string) => {
    switch (timeBlock) {
      case 'morning': return <Sun className="h-3 w-3 text-yellow-500" />
      case 'afternoon': return <Sunset className="h-3 w-3 text-orange-500" />
      case 'evening': return <Moon className="h-3 w-3 text-brand-carbon/60" />
      default: return <Clock className="h-3 w-3 text-brand-carbon/40" />
    }
  }

  const authorName = post.author?.name || post.authorName || 'Anonymous'
  const tripName = post.trip?.name || post.tripName

  return (
    <Card className="overflow-hidden">
      {/* Image Grid */}
      {post.mediaUrls && post.mediaUrls.length > 0 && (
        <div className={`grid gap-1 ${
          post.mediaUrls.length === 1 ? 'grid-cols-1' :
          post.mediaUrls.length === 2 ? 'grid-cols-2' :
          post.mediaUrls.length === 3 ? 'grid-cols-3' :
          post.mediaUrls.length === 4 ? 'grid-cols-2' :
          'grid-cols-3'
        }`}>
          {post.mediaUrls.slice(0, 5).map((url, idx) => (
            <div
              key={idx}
              className={`aspect-square bg-brand-sand/50 overflow-hidden ${
                post.mediaUrls!.length === 3 && idx === 0 ? 'col-span-2 row-span-2' : ''
              }`}
            >
              <img
                src={url}
                alt={`Memory ${idx + 1}`}
                className="w-full h-full object-cover hover:scale-105 transition-transform"
              />
            </div>
          ))}
        </div>
      )}

      <CardContent className="p-4">
        {/* Author & Date */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-brand-sand/50 flex items-center justify-center">
              <span className="text-brand-carbon text-sm font-medium">
                {authorName.charAt(0).toUpperCase()}
              </span>
            </div>
            <div>
              <p className="font-medium text-sm truncate">{authorName}</p>
              <p className="text-xs text-brand-carbon/60">{formatRelativeTime(post.createdAt)}</p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {post.discoverable && !isDiscoverView && (
              <Badge variant="secondary" className="text-xs">
                <Globe className="h-3 w-3 mr-1" />
                Discoverable
              </Badge>
            )}
            {tripName && (
              <Badge variant="outline" className="text-xs">
                <MapPin className="h-3 w-3 mr-1" />
                {tripName}
              </Badge>
            )}
          </div>
        </div>

        {/* Destination */}
        {post.destinationText && (
          <p className="text-sm text-brand-carbon/60 mb-2 flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            {post.destinationText}
          </p>
        )}

        {/* Caption */}
        {post.caption && (
          <p className="text-brand-carbon/80 text-sm">{post.caption}</p>
        )}

        {/* Itinerary Snapshot */}
        {post.itinerarySnapshot && (
          <div className="mt-4 pt-4 border-t border-brand-sand/50">
            <button
              onClick={() => setItineraryExpanded(!itineraryExpanded)}
              className="w-full flex items-center justify-between text-left"
            >
              <div className="flex items-center gap-2">
                <ListTodo className="h-4 w-4 text-brand-carbon/60" />
                <span className="font-medium text-sm text-brand-carbon">Itinerary Snapshot</span>
                <Badge variant="secondary" className="text-xs">
                  {post.itinerarySnapshot.tripLength} days &bull; {post.itinerarySnapshot.style}
                </Badge>
              </div>
              {itineraryExpanded
                ? <ChevronUp className="h-4 w-4 text-brand-carbon/40" />
                : <ChevronDown className="h-4 w-4 text-brand-carbon/40" />
              }
            </button>

            {itineraryExpanded && (
              <div className="mt-3 space-y-3">
                <p className="text-xs text-brand-carbon/60 italic">
                  This itinerary worked for them. Your group can change it.
                </p>
                <div className="space-y-2">
                  {post.itinerarySnapshot.days?.map((day) => (
                    <div key={day.dayNumber} className="bg-brand-sand/30 rounded-lg p-3">
                      <p className="font-medium text-xs text-brand-carbon/80 mb-2">Day {day.dayNumber}</p>
                      <div className="space-y-1">
                        {day.items.map((item, idx) => (
                          <div key={idx} className="flex items-center gap-2 text-xs text-brand-carbon/70">
                            {getTimeBlockIcon(item.timeBlock)}
                            <span className="truncate">{item.title}</span>
                          </div>
                        ))}
                        {day.hasMore && (
                          <p className="text-xs text-brand-carbon/40 pl-5">
                            +{(day.totalItems || 0) - day.items.length} more activities
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {isDiscoverView && (
                  <div className="flex gap-2 pt-2">
                    {onViewItinerary && (
                      <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => onViewItinerary(post)}>
                        <Eye className="h-3 w-3 mr-1" />
                        View full itinerary
                      </Button>
                    )}
                    {onProposeTrip && (
                      <Button size="sm" className="flex-1 text-xs" onClick={() => onProposeTrip(post)}>
                        <UserPlus className="h-3 w-3 mr-1" />
                        Propose to circle
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t">
          {isDiscoverView ? (
            <>
              {post.isAuthor ? (
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => onEdit?.(post)}>
                    <Edit className="h-4 w-4 mr-1" />
                    Edit
                  </Button>
                  <Button variant="ghost" size="sm" className="text-brand-red hover:text-brand-red/80" onClick={() => onDelete?.(post.id)}>
                    <Trash2 className="h-4 w-4 mr-1" />
                    Delete
                  </Button>
                </div>
              ) : (
                <Button variant="ghost" size="sm" onClick={() => setShowReportDialog(true)}>
                  <Flag className="h-4 w-4 mr-1" />
                  Report
                </Button>
              )}
            </>
          ) : post.isAuthor ? (
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => onEdit?.(post)}>
                <Edit className="h-4 w-4 mr-1" />
                Edit
              </Button>
              <Button variant="ghost" size="sm" className="text-brand-red hover:text-brand-red/80" onClick={() => onDelete?.(post.id)}>
                <Trash2 className="h-4 w-4 mr-1" />
                Delete
              </Button>
            </div>
          ) : (
            <div />
          )}
        </div>
      </CardContent>

      {/* Report Dialog */}
      <Dialog open={showReportDialog} onOpenChange={setShowReportDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Report Post</DialogTitle>
            <DialogDescription>Let us know why you&apos;re reporting this post</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Textarea
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              placeholder="What's wrong with this post?"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReportDialog(false)}>Cancel</Button>
            <Button onClick={handleReport} disabled={reporting || !reportReason.trim()}>
              {reporting ? 'Submitting...' : 'Submit Report'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
