'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { 
  MapPin, Sun, Sunset, Moon, Clock, Globe, ListTodo, 
  ChevronUp, ChevronDown, Edit, Trash2, Flag, Eye, UserPlus
} from 'lucide-react'
import { formatDate } from '@/lib/client/formatDate'
import { api } from '@/lib/client/api'

// Post Card Component
export function PostCard({ post, onDelete, onEdit, showCircle = false, isDiscoverView = false, onViewItinerary, onProposeTrip }) {
  const [showReportDialog, setShowReportDialog] = useState(false)
  const [reportReason, setReportReason] = useState('')
  const [reporting, setReporting] = useState(false)
  const [itineraryExpanded, setItineraryExpanded] = useState(false)
  
  const handleReport = async () => {
    if (!reportReason.trim()) return
    setReporting(true)
    try {
      await api('/reports', {
        method: 'POST',
        body: JSON.stringify({ postId: post.id, reason: reportReason })
      })
      toast.success('Report submitted. Thank you.')
      setShowReportDialog(false)
      setReportReason('')
    } catch (error) {
      toast.error(error.message)
    } finally {
      setReporting(false)
    }
  }

  const getTimeBlockIcon = (timeBlock) => {
    switch (timeBlock) {
      case 'morning': return <Sun className="h-3 w-3 text-yellow-500" />
      case 'afternoon': return <Sunset className="h-3 w-3 text-orange-500" />
      case 'evening': return <Moon className="h-3 w-3 text-[#6B7280]" />
      default: return <Clock className="h-3 w-3 text-gray-400" />
    }
  }

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
              className={`aspect-square bg-gray-100 overflow-hidden ${
                post.mediaUrls.length === 3 && idx === 0 ? 'col-span-2 row-span-2' : ''
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
            <div className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center">
              <span className="text-[#111111] text-sm font-medium">
                {(post.author?.name || post.authorName || 'A').charAt(0).toUpperCase()}
              </span>
            </div>
            <div>
              <p className="font-medium text-sm">{post.author?.name || post.authorName || 'Anonymous'}</p>
              <p className="text-xs text-gray-500">{formatDate(post.createdAt)}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-1">
            {post.discoverable && !isDiscoverView && (
              <Badge variant="secondary" className="text-xs">
                <Globe className="h-3 w-3 mr-1" />
                Discoverable
              </Badge>
            )}
            {post.trip && (
              <Badge variant="outline" className="text-xs">
                <MapPin className="h-3 w-3 mr-1" />
                {post.trip.name || post.tripName}
              </Badge>
            )}
            {post.tripName && !post.trip && (
              <Badge variant="outline" className="text-xs">
                <MapPin className="h-3 w-3 mr-1" />
                {post.tripName}
              </Badge>
            )}
          </div>
        </div>
        
        {/* Destination */}
        {post.destinationText && (
          <p className="text-sm text-[#6B7280] mb-2 flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            {post.destinationText}
          </p>
        )}
        
        {/* Caption */}
        {post.caption && (
          <p className="text-gray-700 text-sm">{post.caption}</p>
        )}
        
        {/* Itinerary Snapshot - Only show if post has attached itinerary */}
        {post.itinerarySnapshot && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <button
              onClick={() => setItineraryExpanded(!itineraryExpanded)}
              className="w-full flex items-center justify-between text-left"
            >
              <div className="flex items-center gap-2">
                <ListTodo className="h-4 w-4 text-[#6B7280]" />
                <span className="font-medium text-sm text-gray-900">Itinerary Snapshot</span>
                <Badge variant="secondary" className="text-xs">
                  {post.itinerarySnapshot.tripLength} days • {post.itinerarySnapshot.style}
                </Badge>
              </div>
              {itineraryExpanded ? (
                <ChevronUp className="h-4 w-4 text-gray-400" />
              ) : (
                <ChevronDown className="h-4 w-4 text-gray-400" />
              )}
            </button>
            
            {itineraryExpanded && (
              <div className="mt-3 space-y-3">
                <p className="text-xs text-gray-500 italic">
                  This itinerary worked for them. Your group can change it.
                </p>
                
                {/* Day-by-day summary */}
                <div className="space-y-2">
                  {post.itinerarySnapshot.days?.map((day) => (
                    <div key={day.dayNumber} className="bg-gray-50 rounded-lg p-3">
                      <p className="font-medium text-xs text-gray-700 mb-2">Day {day.dayNumber}</p>
                      <div className="space-y-1">
                        {day.items.map((item, idx) => (
                          <div key={idx} className="flex items-center gap-2 text-xs text-gray-600">
                            {getTimeBlockIcon(item.timeBlock)}
                            <span className="truncate">{item.title}</span>
                          </div>
                        ))}
                        {day.hasMore && (
                          <p className="text-xs text-gray-400 pl-5">
                            +{day.totalItems - day.items.length} more activities
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                
                {/* Itinerary Actions - Only in discover view */}
                {isDiscoverView && (
                  <div className="flex gap-2 pt-2">
                    {onViewItinerary && (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="flex-1 text-xs"
                        onClick={() => onViewItinerary(post)}
                      >
                        <Eye className="h-3 w-3 mr-1" />
                        View full itinerary
                      </Button>
                    )}
                    {onProposeTrip && (
                      <Button 
                        size="sm" 
                        className="flex-1 text-xs"
                        onClick={() => onProposeTrip(post)}
                      >
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
                  <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700" onClick={() => onDelete?.(post.id)}>
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
              {/* CTA for discover - will be handled by parent */}
            </>
          ) : post.isAuthor ? (
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => onEdit?.(post)}>
                <Edit className="h-4 w-4 mr-1" />
                Edit
              </Button>
              <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700" onClick={() => onDelete?.(post.id)}>
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
            <DialogDescription>Let us know why you're reporting this post</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Textarea
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              placeholder="Describe the issue..."
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
