'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Users, LogOut, ExternalLink, UserPlus, Check, X } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'

// API Helper
const api = async (endpoint: string, options: any = {}, token: string | null = null) => {
  const headers: any = {
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

// Helper to check if trip is completed
function isTripCompleted(trip: any) {
  if (!trip) return false
  if (trip.status === 'completed') return true
  
  const today = new Date().toISOString().split('T')[0]
  const endDate = trip.lockedEndDate || trip.endDate
  return endDate && endDate < today
}

export function TravelersTab({
  trip,
  token,
  user,
  onRefresh
}: any) {
  const [showLeaveDialog, setShowLeaveDialog] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [joinRequests, setJoinRequests] = useState<any[]>([])
  const [loadingRequests, setLoadingRequests] = useState(false)
  const [processingRequest, setProcessingRequest] = useState<string | null>(null)
  
  const isTripLeader = trip?.viewer?.isTripLeader || false
  const completed = isTripCompleted(trip)
  const activeLabel = completed ? 'Went' : 'Going'
  const inactiveLabel = completed ? "Didn't go" : 'Not Going'
  
  useEffect(() => {
    if (isTripLeader && trip?.id) {
      loadJoinRequests()
    }
  }, [isTripLeader, trip?.id])
  
  const loadJoinRequests = async () => {
    if (!trip?.id || !token) return
    
    setLoadingRequests(true)
    try {
      const response = await fetch(`/api/trips/${trip.id}/join-requests`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        setJoinRequests(data || [])
      } else {
        // Not trip leader or error
        setJoinRequests([])
      }
    } catch (error) {
      console.error('Failed to load join requests:', error)
      setJoinRequests([])
    } finally {
      setLoadingRequests(false)
    }
  }
  
  const handleRequestAction = async (requestId: string, action: 'approve' | 'reject') => {
    if (!trip?.id || !token) return
    
    setProcessingRequest(requestId)
    try {
      const response = await fetch(`/api/trips/${trip.id}/join-requests/${requestId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ action })
      })
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to process request')
      }
      
      toast.success(action === 'approve' ? 'Join request approved' : 'Join request rejected')
      
      // Refresh trip data to update active travelers
      if (onRefresh) {
        onRefresh()
      }
      
      // Reload join requests
      await loadJoinRequests()
    } catch (error: any) {
      toast.error(error.message || 'Failed to process request')
    } finally {
      setProcessingRequest(null)
    }
  }

  if (!trip?.circleId) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No circle found for this trip</h3>
          <p className="text-gray-500">This trip is not associated with a circle.</p>
        </CardContent>
      </Card>
    )
  }

  // Get participants with status from trip data
  const participantsWithStatus = trip?.participantsWithStatus || []
  
  // Separate active and past participants
  const activeParticipants = participantsWithStatus.filter((p: any) => {
    const status = p.status || 'active'
    return status === 'active'
  })
  
  const pastParticipants = participantsWithStatus.filter((p: any) => {
    const status = p.status || 'active'
    return status !== 'active'
  })

  // Get trip leader user ID
  const tripLeaderUserId = trip?.createdBy
  const currentUserId = user?.id
  
  // Use viewer info from trip data to determine if user can leave
  const viewer = trip?.viewer || {}
  const canLeave = viewer.isActiveParticipant && !viewer.isTripLeader
  
  // Get current user's participant status for display
  const currentUserParticipant = participantsWithStatus.find((p: any) => p.userId === currentUserId)
  const currentUserStatus = currentUserParticipant ? (currentUserParticipant.status || 'active') : (viewer.participantStatus || 'active')

  const handleLeaveTrip = async () => {
    if (!trip?.id || !token) return
    
    setLeaving(true)
    try {
      await api(`/trips/${trip.id}/leave`, { method: 'POST' }, token)
      toast.success('You have left the trip')
      setShowLeaveDialog(false)
      // Refresh trip data
      if (onRefresh) {
        onRefresh()
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to leave trip')
    } finally {
      setLeaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Join Requests Section (Trip Leader only) */}
      {isTripLeader && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Join Requests</h2>
          </div>
          {loadingRequests ? (
            <Card>
              <CardContent className="py-8 text-center">
                <BrandedSpinner size="md" className="mx-auto mb-2" />
                <p className="text-sm text-gray-500">Loading requests...</p>
              </CardContent>
            </Card>
          ) : joinRequests.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <UserPlus className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No pending requests</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {joinRequests.map((request: any) => (
                <Card key={request.id}>
                  <CardContent className="py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <p className="font-medium">{request.requesterName}</p>
                        {request.message && (
                          <p className="text-sm text-gray-600 mt-1">{request.message}</p>
                        )}
                        <p className="text-xs text-gray-500 mt-1">
                          {new Date(request.createdAt).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit'
                          })}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleRequestAction(request.id, 'reject')}
                          disabled={processingRequest === request.id}
                        >
                          <X className="h-3 w-3 mr-1" />
                          Reject
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleRequestAction(request.id, 'approve')}
                          disabled={processingRequest === request.id}
                        >
                          <Check className="h-3 w-3 mr-1" />
                          Approve
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
      
      {/* Leave Trip Dialog */}
      <Dialog open={showLeaveDialog} onOpenChange={setShowLeaveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Leave this trip?</DialogTitle>
            <DialogDescription>
              You'll still be in the circle, but you won't be counted for scheduling or planning. You can ask the Trip Leader to add you back.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLeaveDialog(false)} disabled={leaving}>
              Cancel
            </Button>
            <Button onClick={handleLeaveTrip} disabled={leaving}>
              {leaving ? 'Leaving...' : 'Leave trip'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Active Travelers */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold">{activeLabel} ({activeParticipants.length})</h2>
          {canLeave && (
            <Button variant="outline" size="sm" onClick={() => setShowLeaveDialog(true)}>
              <LogOut className="h-4 w-4 mr-2" />
              Leave trip
            </Button>
          )}
        </div>
        {activeParticipants.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">No one {completed ? 'went' : 'going'}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {activeParticipants.map((participant: any) => {
              const participantUser = participant.user || { id: participant.userId, name: 'Unknown' }
              const isTripLeader = tripLeaderUserId && participantUser.id === tripLeaderUserId
              const isCurrentUser = participantUser.id === currentUserId
              const hasLeft = viewer.participantStatus === 'left' && isCurrentUser
              
              // Build returnTo URL from current location
              const currentUrl = typeof window !== 'undefined' 
                ? window.location.pathname + window.location.search
                : '/dashboard'
              const returnTo = encodeURIComponent(currentUrl)
              const profileUrl = `/members/${participantUser.id}?returnTo=${returnTo}`
              
              return (
                <Link key={participant.userId || participantUser.id} href={profileUrl}>
                  <Card className="cursor-pointer hover:shadow-md transition-shadow">
                    <CardContent className="py-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center">
                            <span className="text-gray-600 font-medium">
                              {participantUser.name?.charAt(0).toUpperCase() || '?'}
                            </span>
                          </div>
                          <div>
                            <p className="font-medium">{participantUser.name}</p>
                            {hasLeft && (
                              <p className="text-sm text-gray-500 italic">You left this trip</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500 flex items-center gap-1">
                            View profile
                            <ExternalLink className="h-3 w-3" />
                          </span>
                          {isTripLeader && (
                            <Badge>Trip Leader</Badge>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              )
            })}
          </div>
        )}
      </div>

      {/* Past Travelers (Collapsed by default) */}
      {pastParticipants.length > 0 && (
        <div>
          <details className="group">
            <summary className="cursor-pointer text-lg font-semibold mb-4 list-none">
              <div className="flex items-center justify-between">
                <span>{inactiveLabel} ({pastParticipants.length})</span>
                <span className="text-sm text-gray-500 group-open:hidden">Click to expand</span>
              </div>
            </summary>
            <div className="space-y-2 mt-4">
              {pastParticipants.map((participant: any) => {
                const participantUser = participant.user || { id: participant.userId, name: 'Unknown' }
                const status = participant.status || 'left'
                const statusLabel = status === 'left' ? 'Left' : 'Removed'
                
                // Build returnTo URL from current location
                const currentUrl = typeof window !== 'undefined' 
                  ? window.location.pathname + window.location.search
                  : '/dashboard'
                const returnTo = encodeURIComponent(currentUrl)
                const profileUrl = `/members/${participantUser.id}?returnTo=${returnTo}`
                
                return (
                  <Link key={participantUser.id} href={profileUrl}>
                    <Card className="opacity-60 cursor-pointer hover:shadow-md transition-shadow">
                      <CardContent className="py-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center">
                              <span className="text-gray-600 font-medium">
                                {participantUser.name?.charAt(0).toUpperCase() || '?'}
                              </span>
                            </div>
                            <div>
                              <p className="font-medium">{participantUser.name}</p>
                              <p className="text-sm text-gray-500">{statusLabel}</p>
                            </div>
                          </div>
                          <span className="text-xs text-gray-500 flex items-center gap-1">
                            View profile
                            <ExternalLink className="h-3 w-3" />
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                )
              })}
            </div>
          </details>
        </div>
      )}
    </div>
  )
}
