'use client'

import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Users, LogOut, UserPlus, Check, X, Crown, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { BrandedSpinner } from '@/app/HomeClient'

interface TravelersOverlayProps {
  trip: any
  token: string
  user: any
  onRefresh: (updatedTrip?: any) => void
  onClose: () => void
  setHasUnsavedChanges: (has: boolean) => void
  onMemberClick?: (memberId: string) => void
}

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

// Get initials from name
function getInitials(name: string) {
  return name
    .split(' ')
    .map(part => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

// Generate a consistent color based on name
function getAvatarColor(name: string) {
  const colors = [
    'bg-red-100 text-red-700',
    'bg-blue-100 text-blue-700',
    'bg-green-100 text-green-700',
    'bg-yellow-100 text-yellow-700',
    'bg-purple-100 text-purple-700',
    'bg-pink-100 text-pink-700',
    'bg-indigo-100 text-indigo-700',
    'bg-orange-100 text-orange-700',
  ]
  const index = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length
  return colors[index]
}

export function TravelersOverlay({
  trip,
  token,
  user,
  onRefresh,
  onClose,
  setHasUnsavedChanges,
  onMemberClick
}: TravelersOverlayProps) {
  const [showLeaveDialog, setShowLeaveDialog] = useState(false)
  const [showTransferDialog, setShowTransferDialog] = useState(false)
  const [showCancelDialog, setShowCancelDialog] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [canceling, setCanceling] = useState(false)
  const [joinRequests, setJoinRequests] = useState<any[]>([])
  const [loadingRequests, setLoadingRequests] = useState(false)
  const [processingRequest, setProcessingRequest] = useState<string | null>(null)
  const [selectedNewLeader, setSelectedNewLeader] = useState('')
  const [validationError, setValidationError] = useState('')

  const isTripLeader = trip?.viewer?.isTripLeader || false
  const completed = isTripCompleted(trip)
  const activeLabel = completed ? 'Went' : 'Going'
  const currentUserId = user?.id
  const tripLeaderUserId = trip?.createdBy

  // Get participants with status from trip data
  const participantsWithStatus = trip?.participantsWithStatus || []

  // Separate active and past participants
  const activeParticipants = useMemo(() =>
    participantsWithStatus.filter((p: any) => {
      const status = p.status || 'active'
      return status === 'active'
    }),
    [participantsWithStatus]
  )

  const pastParticipants = useMemo(() =>
    participantsWithStatus.filter((p: any) => {
      const status = p.status || 'active'
      return status !== 'active'
    }),
    [participantsWithStatus]
  )

  // Use viewer info from trip data to determine if user can leave
  const viewer = trip?.viewer || {}
  const canLeaveNonLeader = viewer.isActiveParticipant && !viewer.isTripLeader
  const canLeaveLeader = viewer.isActiveParticipant && viewer.isTripLeader

  // Build eligible users for leadership transfer (active participants, excluding current user)
  const eligibleUsers = useMemo(() =>
    activeParticipants
      .filter((p: any) => {
        const userId = p.user?.id || p.userId
        return userId !== currentUserId && (p.status || 'active') === 'active'
      })
      .map((p: any) => ({
        userId: p.user?.id || p.userId,
        displayName: p.user?.name || 'Unknown'
      })),
    [activeParticipants, currentUserId]
  )

  const hasEligibleSuccessors = eligibleUsers.length > 0

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
      onRefresh()
      await loadJoinRequests()
    } catch (error: any) {
      toast.error(error.message || 'Failed to process request')
    } finally {
      setProcessingRequest(null)
    }
  }

  const handleLeaveTrip = async () => {
    if (!trip?.id || !token) return

    setLeaving(true)
    try {
      await api(`/trips/${trip.id}/leave`, { method: 'POST' }, token)
      toast.success('You have left the trip')
      setShowLeaveDialog(false)
      onRefresh()
      onClose()
    } catch (err: any) {
      toast.error(err.message || 'Failed to leave trip')
    } finally {
      setLeaving(false)
    }
  }

  const handleTransferAndLeave = async () => {
    if (!selectedNewLeader) {
      setValidationError('Please select a new leader to continue')
      return
    }

    if (!trip?.id || !token) return

    setValidationError('')
    setLeaving(true)
    try {
      await api(`/trips/${trip.id}/leave`, {
        method: 'POST',
        body: JSON.stringify({ transferToUserId: selectedNewLeader })
      }, token)
      toast.success('Leadership transferred and left trip')
      setSelectedNewLeader('')
      setShowTransferDialog(false)
      onRefresh()
      onClose()
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to leave trip'
      toast.error(errorMessage)
    } finally {
      setLeaving(false)
    }
  }

  const handleCancelTrip = async () => {
    if (!trip?.id || !token) return

    setCanceling(true)
    try {
      await api(`/trips/${trip.id}/cancel`, {
        method: 'POST'
      }, token)
      toast.success('Trip canceled')
      setShowCancelDialog(false)
      onRefresh()
      onClose()
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to cancel trip'
      toast.error(errorMessage)
    } finally {
      setCanceling(false)
    }
  }

  const handleLeaderLeaveClick = () => {
    if (hasEligibleSuccessors) {
      setShowTransferDialog(true)
    } else {
      setShowCancelDialog(true)
    }
  }

  if (!trip?.circleId) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Users className="h-12 w-12 text-gray-400 mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">No circle found</h3>
        <p className="text-gray-500">This trip is not associated with a circle.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Join Requests Section (Trip Leader only) */}
      {isTripLeader && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
            Join Requests
          </h3>
          {loadingRequests ? (
            <Card>
              <CardContent className="py-6 text-center">
                <BrandedSpinner size="sm" className="mx-auto mb-2" />
                <p className="text-sm text-gray-500">Loading requests...</p>
              </CardContent>
            </Card>
          ) : joinRequests.length === 0 ? (
            <Card>
              <CardContent className="py-6 text-center">
                <UserPlus className="h-6 w-6 text-gray-400 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No pending requests</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {joinRequests.map((request: any) => (
                <Card key={request.id}>
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className={getAvatarColor(request.requesterName || 'U')}>
                            {getInitials(request.requesterName || 'U')}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{request.requesterName}</p>
                          {request.message && (
                            <p className="text-xs text-gray-600 truncate">{request.message}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0"
                          onClick={() => handleRequestAction(request.id, 'reject')}
                          disabled={processingRequest === request.id}
                        >
                          <X className="h-4 w-4 text-red-500" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0"
                          onClick={() => handleRequestAction(request.id, 'approve')}
                          disabled={processingRequest === request.id}
                        >
                          <Check className="h-4 w-4 text-green-500" />
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

      {/* Active Travelers */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
            {activeLabel} ({activeParticipants.length})
          </h3>
        </div>

        {activeParticipants.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-center">
              <Users className="h-8 w-8 text-gray-400 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No one {completed ? 'went' : 'going'}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {activeParticipants.map((participant: any) => {
              const participantUser = participant.user || { id: participant.userId, name: 'Unknown' }
              const isLeader = tripLeaderUserId && participantUser.id === tripLeaderUserId
              const isCurrentUser = participantUser.id === currentUserId

              return (
                <Card key={participant.userId || participantUser.id} className="overflow-hidden">
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center justify-between">
                      <button
                        className="flex items-center gap-3 hover:opacity-80 transition-opacity text-left"
                        onClick={() => onMemberClick?.(participantUser.id)}
                      >
                        <Avatar className="h-10 w-10">
                          {participantUser.image ? (
                            <AvatarImage src={participantUser.image} alt={participantUser.name} />
                          ) : null}
                          <AvatarFallback className={getAvatarColor(participantUser.name || 'U')}>
                            {getInitials(participantUser.name || 'U')}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm text-brand-blue hover:underline">{participantUser.name}</p>
                            {isCurrentUser && (
                              <span className="text-xs text-gray-500">(you)</span>
                            )}
                          </div>
                        </div>
                      </button>
                      <div className="flex items-center gap-2">
                        {isLeader && (
                          <Badge variant="secondary" className="gap-1">
                            <Crown className="h-3 w-3" />
                            Leader
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {/* Past Travelers */}
      {pastParticipants.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
            Left Trip ({pastParticipants.length})
          </h3>
          <div className="space-y-2">
            {pastParticipants.map((participant: any) => {
              const participantUser = participant.user || { id: participant.userId, name: 'Unknown' }
              const status = participant.status || 'left'
              const statusLabel = status === 'left' ? 'Left' : 'Removed'

              return (
                <Card key={participantUser.id} className="opacity-60">
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10">
                          <AvatarFallback className={getAvatarColor(participantUser.name || 'U')}>
                            {getInitials(participantUser.name || 'U')}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium text-sm">{participantUser.name}</p>
                          <p className="text-xs text-gray-500">{statusLabel}</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      )}

      {/* Leave Trip Section */}
      {(canLeaveNonLeader || canLeaveLeader) && (
        <div className="pt-4 border-t border-gray-200">
          {canLeaveNonLeader && (
            <Button
              variant="outline"
              className="w-full text-red-600 hover:text-red-700 hover:bg-red-50"
              onClick={() => setShowLeaveDialog(true)}
            >
              <LogOut className="h-4 w-4 mr-2" />
              Leave Trip
            </Button>
          )}
          {canLeaveLeader && (
            <Button
              variant="outline"
              className="w-full text-red-600 hover:text-red-700 hover:bg-red-50"
              onClick={handleLeaderLeaveClick}
            >
              <LogOut className="h-4 w-4 mr-2" />
              {hasEligibleSuccessors ? 'Leave Trip' : 'Cancel Trip'}
            </Button>
          )}
        </div>
      )}

      {/* Leave Trip Dialog (for non-leaders) */}
      <AlertDialog open={showLeaveDialog} onOpenChange={setShowLeaveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave this trip?</AlertDialogTitle>
            <AlertDialogDescription>
              You'll still be in the circle, but you won't be counted for scheduling or planning. You can ask the Trip Leader to add you back.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={leaving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleLeaveTrip}
              disabled={leaving}
              className="bg-brand-red hover:opacity-90"
            >
              {leaving ? 'Leaving...' : 'Leave trip'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Transfer Leadership Dialog (for trip leaders with eligible successors) */}
      <Dialog open={showTransferDialog} onOpenChange={setShowTransferDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transfer leadership to leave</DialogTitle>
            <DialogDescription>
              You must transfer leadership to another active member before leaving this trip.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="new-leader">Select new leader</Label>
            <Select
              value={selectedNewLeader}
              onValueChange={(value) => {
                setSelectedNewLeader(value)
                setValidationError('')
              }}
            >
              <SelectTrigger id="new-leader" className="mt-2">
                <SelectValue placeholder="Choose a member..." />
              </SelectTrigger>
              <SelectContent>
                {eligibleUsers.map((eligibleUser) => (
                  <SelectItem key={eligibleUser.userId} value={eligibleUser.userId}>
                    {eligibleUser.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {validationError && (
              <p className="text-xs text-red-500 mt-2">{validationError}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowTransferDialog(false)
                setSelectedNewLeader('')
                setValidationError('')
              }}
              disabled={leaving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleTransferAndLeave}
              disabled={!selectedNewLeader || leaving}
            >
              {leaving ? 'Leaving...' : 'Transfer & Leave'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Trip Dialog (for trip leaders without eligible successors) */}
      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              You're the last traveler
            </AlertDialogTitle>
            <AlertDialogDescription>
              Since there's no one to transfer leadership to, canceling will end the trip for everyone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={canceling}>Keep trip</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancelTrip}
              disabled={canceling}
              className="bg-brand-red hover:opacity-90"
            >
              {canceling ? 'Canceling...' : 'Cancel trip'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
