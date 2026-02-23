'use client'

import { useState, useEffect, useMemo } from 'react'
import { nativeShare } from '@/lib/native/share'
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
import { Users, LogOut, UserPlus, Check, X, Crown, AlertTriangle, ArrowRightLeft, Clock, XCircle, Send, Share2 } from 'lucide-react'
import { toast } from 'sonner'
import { BrandedSpinner } from '@/components/common/BrandedSpinner'
import { Skeleton } from '@/components/ui/skeleton'
import { isTripCompleted } from '@/lib/trips/isTripCompleted'

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
  const [showStandaloneTransferDialog, setShowStandaloneTransferDialog] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [canceling, setCanceling] = useState(false)
  const [transferring, setTransferring] = useState(false)
  const [acceptingTransfer, setAcceptingTransfer] = useState(false)
  const [decliningTransfer, setDecliningTransfer] = useState(false)
  const [cancelingTransfer, setCancelingTransfer] = useState(false)
  const [joinRequests, setJoinRequests] = useState<any[]>([])
  const [loadingRequests, setLoadingRequests] = useState(false)
  const [processingRequest, setProcessingRequest] = useState<string | null>(null)
  const [selectedNewLeader, setSelectedNewLeader] = useState('')
  const [validationError, setValidationError] = useState('')
  // Invitation state
  const [pendingInvitations, setPendingInvitations] = useState<any[]>([])
  const [loadingInvitations, setLoadingInvitations] = useState(false)
  const [myInvitation, setMyInvitation] = useState<any>(null)
  const [processingInvitation, setProcessingInvitation] = useState(false)
  // Join request state (for non-travelers)
  const [joinRequestStatus, setJoinRequestStatus] = useState<'none' | 'pending' | 'approved' | 'rejected'>('none')
  const [submittingJoinRequest, setSubmittingJoinRequest] = useState(false)

  const isTripLeader = trip?.viewer?.isTripLeader || false
  const completed = isTripCompleted(trip)
  const activeLabel = completed ? 'Went' : 'Going'
  const currentUserId = user?.id
  const tripLeaderUserId = trip?.createdBy

  // Check if trip is cancelled
  const isCancelled = trip?.tripStatus === 'CANCELLED' || trip?.status === 'canceled'

  // Pending leadership transfer info
  const pendingTransfer = trip?.viewer?.pendingLeadershipTransfer || trip?.pendingLeadershipTransfer || null
  const isPendingLeader = trip?.viewer?.isPendingLeader || false
  const hasPendingTransfer = !!pendingTransfer

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
      loadPendingInvitations()
    }
  }, [isTripLeader, trip?.id])

  // Load user's own invitation status (for non-leaders)
  useEffect(() => {
    if (!isTripLeader && trip?.id && token) {
      loadMyInvitation()
    }
  }, [isTripLeader, trip?.id, token])

  // Load join request status for non-travelers
  const isNonTraveler = !viewer.isActiveParticipant && !isCancelled
  useEffect(() => {
    if (!isNonTraveler || !trip?.id || !token) return
    let cancelled = false
    const fetchStatus = async () => {
      try {
        const res = await fetch(`/api/trips/${trip.id}/join-requests/me`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled && data?.status) {
          setJoinRequestStatus(data.status)
        }
      } catch {
        // Silently ignore
      }
    }
    fetchStatus()
    return () => { cancelled = true }
  }, [isNonTraveler, trip?.id, token])

  const handleAskToJoin = async () => {
    if (!trip?.id || !token) return
    setSubmittingJoinRequest(true)
    try {
      const res = await fetch(`/api/trips/${trip.id}/join-requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({})
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Couldn\'t send join request')
      }
      toast.success('Join request sent!')
      setJoinRequestStatus('pending')
      onRefresh()
    } catch (err: any) {
      toast.error(err.message || 'Couldn\'t send request — try again')
    } finally {
      setSubmittingJoinRequest(false)
    }
  }

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

  const loadPendingInvitations = async () => {
    if (!trip?.id || !token) return

    setLoadingInvitations(true)
    try {
      const response = await fetch(`/api/trips/${trip.id}/invitations`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        setPendingInvitations((data || []).filter((inv: any) => inv.status === 'pending'))
      } else {
        setPendingInvitations([])
      }
    } catch (error) {
      console.error('Failed to load invitations:', error)
      setPendingInvitations([])
    } finally {
      setLoadingInvitations(false)
    }
  }

  const loadMyInvitation = async () => {
    if (!trip?.id || !token) return

    try {
      const response = await fetch(`/api/trips/${trip.id}/invitations/me`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        if (data.status === 'pending') {
          setMyInvitation(data)
        } else {
          setMyInvitation(null)
        }
      }
    } catch (error) {
      console.error('Failed to load my invitation:', error)
    }
  }

  const handleInvitationResponse = async (invitationId: string, action: 'accept' | 'decline') => {
    if (!trip?.id || !token) return

    setProcessingInvitation(true)
    try {
      const response = await fetch(`/api/trips/${trip.id}/invitations/${invitationId}/${action}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || `Couldn't ${action} invitation`)
      }

      toast.success(action === 'accept' ? 'You joined the trip!' : 'Invitation declined')
      setMyInvitation(null)
      onRefresh()
    } catch (err: any) {
      toast.error(err.message || `Couldn't ${action} invitation — try again`)
    } finally {
      setProcessingInvitation(false)
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
        throw new Error(error.error || 'Couldn\'t process request')
      }

      // P0-3: Get updated trip for immediate UI refresh (travelers list + progress)
      const result = await response.json()

      toast.success(action === 'approve' ? 'Join request approved' : 'Join request rejected')
      onRefresh(result?.trip || undefined)
      await loadJoinRequests()
    } catch (error: any) {
      toast.error(error.message || 'Couldn\'t process request — try again')
    } finally {
      setProcessingRequest(null)
    }
  }

  const handleLeaveTrip = async () => {
    if (!trip?.id || !token) return

    setLeaving(true)
    try {
      await api(`/trips/${trip.id}/leave`, { method: 'POST' }, token)
      toast.success('You left the trip')
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
      const errorMessage = err.message || 'Couldn\'t leave trip — try again'
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
      const errorMessage = err.message || 'Couldn\'t cancel trip — try again'
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

  const handleStandaloneTransfer = async () => {
    if (!selectedNewLeader) {
      setValidationError('Please select a new leader')
      return
    }

    if (!trip?.id || !token) return

    setValidationError('')
    setTransferring(true)
    try {
      await api(`/trips/${trip.id}/transfer-leadership`, {
        method: 'POST',
        body: JSON.stringify({ newLeaderId: selectedNewLeader })
      }, token)
      toast.success('Leadership transfer request sent')
      setSelectedNewLeader('')
      setShowStandaloneTransferDialog(false)
      onRefresh()
    } catch (err: any) {
      const errorMessage = err.message || 'Couldn\'t transfer — try again'
      toast.error(errorMessage)
    } finally {
      setTransferring(false)
    }
  }

  // Invite friends via native share sheet, Web Share API, or clipboard fallback
  const handleInvite = async () => {
    const inviteCode = trip?.circle?.inviteCode || trip?.inviteCode
    if (!inviteCode) {
      toast.error('No invite code available')
      return
    }

    const shareUrl = `${window.location.origin}/join/${inviteCode}?tripId=${trip.id}&ref=${user?.id || ''}`
    const shareText = `Join "${trip.name}" on Tripti.ai to plan the trip together!`

    const result = await nativeShare({ title: 'Tripti.ai Invite', text: shareText, url: shareUrl })
    if (result === 'copied') {
      toast.success('Invite link copied!')
    } else if (result === 'failed') {
      toast.error('Could not copy — please copy manually')
    }
  }

  // Accept pending leadership transfer
  const handleAcceptTransfer = async () => {
    if (!trip?.id || !token) return

    setAcceptingTransfer(true)
    try {
      await api(`/trips/${trip.id}/transfer-leadership/accept`, {
        method: 'POST'
      }, token)
      toast.success('You are now the trip leader!')
      onRefresh()
    } catch (err: any) {
      toast.error(err.message || 'Couldn\'t accept transfer — try again')
    } finally {
      setAcceptingTransfer(false)
    }
  }

  // Decline pending leadership transfer
  const handleDeclineTransfer = async () => {
    if (!trip?.id || !token) return

    setDecliningTransfer(true)
    try {
      await api(`/trips/${trip.id}/transfer-leadership/decline`, {
        method: 'POST'
      }, token)
      toast.success('Leadership transfer declined')
      onRefresh()
    } catch (err: any) {
      toast.error(err.message || 'Couldn\'t decline transfer — try again')
    } finally {
      setDecliningTransfer(false)
    }
  }

  // Cancel pending leadership transfer (leader only)
  const handleCancelPendingTransfer = async () => {
    if (!trip?.id || !token) return

    setCancelingTransfer(true)
    try {
      await api(`/trips/${trip.id}/transfer-leadership/cancel`, {
        method: 'POST'
      }, token)
      toast.success('Leadership transfer canceled')
      onRefresh()
    } catch (err: any) {
      toast.error(err.message || 'Couldn\'t cancel transfer — try again')
    } finally {
      setCancelingTransfer(false)
    }
  }

  if (!trip?.circleId) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Users className="h-12 w-12 text-gray-400 mb-4" />
        <h3 className="text-lg font-medium text-brand-carbon mb-2">No circle found</h3>
        <p className="text-gray-500">This trip is not associated with a circle.</p>
      </div>
    )
  }

  // Find the pending recipient's name for display
  const pendingRecipientName = useMemo(() => {
    if (!pendingTransfer?.toUserId) return null
    const participant = activeParticipants.find(
      (p: any) => (p.user?.id || p.userId) === pendingTransfer.toUserId
    )
    return participant?.user?.name || 'a member'
  }, [pendingTransfer, activeParticipants])

  const canAskToJoin = isNonTraveler && joinRequestStatus !== 'pending' && joinRequestStatus !== 'approved'

  const hasFooterCTAs = !isCancelled && (
    (canLeaveLeader && hasEligibleSuccessors && !hasPendingTransfer) ||
    canLeaveNonLeader ||
    canLeaveLeader ||
    canAskToJoin ||
    (isNonTraveler && joinRequestStatus === 'pending')
  )

  return (
    <div className="flex flex-col h-full">
    {/* Scrollable content */}
    <div className="flex-1 overflow-y-auto min-h-0">
    <div className="space-y-6">
      {/* Pending Leadership Transfer Section */}
      {hasPendingTransfer && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
            Pending Leadership Transfer
          </h3>
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="py-4 px-4">
              {isPendingLeader ? (
                // Show to pending recipient
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <Clock className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-medium text-sm text-brand-carbon">
                        You've been asked to lead this trip
                      </p>
                      <p className="text-xs text-gray-600 mt-1">
                        Accept to become the trip leader, or decline to keep the current leader.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 ml-8">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleDeclineTransfer}
                      disabled={decliningTransfer || acceptingTransfer}
                      className="text-gray-600"
                    >
                      <X className="h-4 w-4 mr-1" />
                      {decliningTransfer ? 'Declining...' : 'Decline'}
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleAcceptTransfer}
                      disabled={acceptingTransfer || decliningTransfer}
                      className="bg-brand-blue hover:opacity-90"
                    >
                      <Check className="h-4 w-4 mr-1" />
                      {acceptingTransfer ? 'Accepting...' : 'Accept Leadership'}
                    </Button>
                  </div>
                </div>
              ) : isTripLeader ? (
                // Show to current leader who initiated the transfer
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <Clock className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-medium text-sm text-brand-carbon">
                        Waiting for {pendingRecipientName} to accept leadership
                      </p>
                      <p className="text-xs text-gray-600 mt-1">
                        They need to accept before the transfer is complete.
                      </p>
                    </div>
                  </div>
                  <div className="ml-8">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleCancelPendingTransfer}
                      disabled={cancelingTransfer}
                      className="text-gray-600"
                    >
                      <XCircle className="h-4 w-4 mr-1" />
                      {cancelingTransfer ? 'Canceling...' : 'Cancel Transfer'}
                    </Button>
                  </div>
                </div>
              ) : (
                // Show to other members (read-only notice)
                <div className="flex items-start gap-3">
                  <Clock className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-sm text-brand-carbon">
                      Leadership transfer pending
                    </p>
                    <p className="text-xs text-gray-600 mt-1">
                      {pendingRecipientName} has been asked to become the trip leader.
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Join Requests Section (Trip Leader only) */}
      {isTripLeader && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
            Join Requests
          </h3>
          {loadingRequests ? (
            <div className="space-y-2">
              {[1, 2].map(i => (
                <Card key={i}>
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-8 w-8 rounded-full" />
                      <div className="flex-1 space-y-1.5">
                        <Skeleton className="h-4 w-28" />
                        <Skeleton className="h-3 w-20" />
                      </div>
                      <Skeleton className="h-8 w-16 rounded-md" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
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
                          <X className="h-4 w-4 text-brand-red" />
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

      {/* Pending Invitations Section (Trip Leader only) */}
      {isTripLeader && pendingInvitations.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
            Pending Invitations ({pendingInvitations.length})
          </h3>
          <div className="space-y-2">
            {pendingInvitations.map((invitation: any) => (
              <Card key={invitation.id}>
                <CardContent className="py-3 px-4">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className={getAvatarColor(invitation.invitedUserName || 'U')}>
                        {getInitials(invitation.invitedUserName || 'U')}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{invitation.invitedUserName}</p>
                      <p className="text-xs text-gray-500">Awaiting response</p>
                    </div>
                    <Clock className="h-4 w-4 text-amber-500" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Your Invitation Section (for invited users) */}
      {!isTripLeader && myInvitation && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
            Your Invitation
          </h3>
          <Card className="border-brand-blue/30 bg-blue-50/50">
            <CardContent className="py-4 px-4">
              <div className="space-y-3">
                <p className="text-sm text-brand-carbon">
                  <strong>{myInvitation.inviterName}</strong> invited you to join this trip.
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleInvitationResponse(myInvitation.id, 'decline')}
                    disabled={processingInvitation}
                    className="flex-1"
                  >
                    <X className="h-4 w-4 mr-1" />
                    Decline
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleInvitationResponse(myInvitation.id, 'accept')}
                    disabled={processingInvitation}
                    className="flex-1 bg-brand-blue hover:opacity-90"
                  >
                    <Check className="h-4 w-4 mr-1" />
                    Accept
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Invite Friends Button */}
      {viewer.isActiveParticipant && !isCancelled && (
        <Button
          variant="outline"
          className="w-full border-dashed border-brand-blue text-brand-blue hover:bg-blue-50"
          onClick={handleInvite}
        >
          <Share2 className="h-4 w-4 mr-2" />
          Invite friends
        </Button>
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

    </div>
    {/* end space-y-6 */}
    </div>
    {/* end scrollable content */}

    {/* Fixed Footer CTAs - always visible */}
    {hasFooterCTAs && (
      <div className="shrink-0 border-t bg-white px-4 py-3 space-y-2">
        {canAskToJoin && (
          <Button
            className="w-full bg-brand-blue hover:opacity-90 text-white"
            onClick={handleAskToJoin}
            disabled={submittingJoinRequest}
          >
            <UserPlus className="h-4 w-4 mr-2" />
            {submittingJoinRequest ? 'Sending...' : 'Ask to join'}
          </Button>
        )}
        {isNonTraveler && joinRequestStatus === 'pending' && (
          <div className="flex items-center justify-center gap-2 py-1">
            <Clock className="h-4 w-4 text-amber-500" />
            <p className="text-sm text-amber-600">Join request pending</p>
          </div>
        )}
        {!isCancelled && canLeaveLeader && hasEligibleSuccessors && !hasPendingTransfer && (
          <Button
            variant="outline"
            className="w-full"
            onClick={() => setShowStandaloneTransferDialog(true)}
          >
            <ArrowRightLeft className="h-4 w-4 mr-2" />
            Transfer Leadership
          </Button>
        )}
        {canLeaveNonLeader && (
          <Button
            variant="outline"
            className="w-full text-brand-red hover:text-brand-red hover:bg-brand-red/5"
            onClick={() => setShowLeaveDialog(true)}
          >
            <LogOut className="h-4 w-4 mr-2" />
            Leave Trip
          </Button>
        )}
        {canLeaveLeader && !hasPendingTransfer && (
          <Button
            variant="outline"
            className="w-full text-brand-red hover:text-brand-red hover:bg-brand-red/5"
            onClick={() => setShowCancelDialog(true)}
          >
            <XCircle className="h-4 w-4 mr-2" />
            Cancel Trip
          </Button>
        )}
        {canLeaveLeader && hasPendingTransfer && (
          <p className="text-xs text-gray-500 text-center">
            Resolve the pending transfer before canceling.
          </p>
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
            <DialogTitle>Pass the lead before leaving</DialogTitle>
            <DialogDescription>
              Pick someone to take over before you go.
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
              <p className="text-xs text-brand-red mt-2">{validationError}</p>
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

      {/* Cancel Trip Dialog */}
      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Cancel this trip?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will cancel the trip for everyone. This action cannot be undone.
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

      {/* Standalone Transfer Leadership Dialog */}
      <Dialog open={showStandaloneTransferDialog} onOpenChange={setShowStandaloneTransferDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transfer Leadership</DialogTitle>
            <DialogDescription>
              Request to transfer trip leadership to another active traveler. They'll need to accept before becoming the new leader. You will remain as a traveler on the trip.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="standalone-new-leader">Select new leader</Label>
            <Select
              value={selectedNewLeader}
              onValueChange={(value) => {
                setSelectedNewLeader(value)
                setValidationError('')
              }}
            >
              <SelectTrigger id="standalone-new-leader" className="mt-2">
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
              <p className="text-xs text-brand-red mt-2">{validationError}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowStandaloneTransferDialog(false)
                setSelectedNewLeader('')
                setValidationError('')
              }}
              disabled={transferring}
            >
              Cancel
            </Button>
            <Button
              onClick={handleStandaloneTransfer}
              disabled={!selectedNewLeader || transferring}
            >
              {transferring ? 'Sending...' : 'Send Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
