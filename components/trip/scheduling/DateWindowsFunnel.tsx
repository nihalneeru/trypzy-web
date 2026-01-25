'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Calendar as CalendarIcon,
  Plus,
  Check,
  Lock,
  Users,
  AlertCircle,
  ChevronDown,
  ChevronUp
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'

interface DateWindow {
  id: string
  tripId: string
  proposedBy: string
  startDate: string
  endDate: string
  createdAt: string
  supportCount: number
  supporterIds: string[]
  isProposed: boolean
}

interface ProposalStatus {
  proposalReady: boolean
  reason: string
  leadingWindow: DateWindow | null
  leaderCount: number
  stats: {
    totalTravelers: number
    responderCount: number
    leaderCount: number
    thresholdNeeded: number
    windowCount: number
  }
}

interface DateWindowsFunnelProps {
  trip: any
  token: string
  user: any
  travelers: any[]
  onRefresh: (updatedTrip?: any) => void
  onClose: () => void
  setHasUnsavedChanges: (has: boolean) => void
}

// Format date for display
function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    })
  } catch {
    return dateStr
  }
}

// Get user name from travelers list
function getUserName(userId: string, travelers: any[]): string {
  const traveler = travelers.find(t => t.id === userId || t.userId === userId)
  return traveler?.name || traveler?.userName || 'Someone'
}

/**
 * DateWindowsFunnel - New date-locking funnel component
 *
 * Phases: COLLECTING -> PROPOSED -> LOCKED
 * - COLLECTING: Users propose windows and support them
 * - PROPOSED: Leader has proposed a window, awaiting lock
 * - LOCKED: Dates are finalized
 */
export function DateWindowsFunnel({
  trip,
  token,
  user,
  travelers,
  onRefresh,
  onClose,
  setHasUnsavedChanges
}: DateWindowsFunnelProps) {
  // State
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [phase, setPhase] = useState<'COLLECTING' | 'PROPOSED' | 'LOCKED'>('COLLECTING')
  const [windows, setWindows] = useState<DateWindow[]>([])
  const [proposalStatus, setProposalStatus] = useState<ProposalStatus | null>(null)
  const [userSupportedWindowIds, setUserSupportedWindowIds] = useState<string[]>([])
  const [proposedWindowId, setProposedWindowId] = useState<string | null>(null)
  const [isLeader, setIsLeader] = useState(false)

  // Form state for adding new window
  const [showAddWindow, setShowAddWindow] = useState(false)
  const [newStartDate, setNewStartDate] = useState('')
  const [newEndDate, setNewEndDate] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Confirmation dialogs
  const [showProposeConfirm, setShowProposeConfirm] = useState(false)
  const [showLockConfirm, setShowLockConfirm] = useState(false)
  const [pendingProposeWindowId, setPendingProposeWindowId] = useState<string | null>(null)
  const [useLeaderOverride, setUseLeaderOverride] = useState(false)

  // Fetch windows data
  const fetchWindows = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch(`/api/trips/${trip.id}/date-windows`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to load date options')
      }

      const data = await response.json()
      setPhase(data.phase)
      setWindows(data.windows || [])
      setProposalStatus(data.proposalStatus)
      setUserSupportedWindowIds(data.userSupportedWindowIds || [])
      setProposedWindowId(data.proposedWindowId)
      setIsLeader(data.isLeader)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [trip.id, token])

  useEffect(() => {
    fetchWindows()
  }, [fetchWindows])

  // Handle adding a new window
  const handleAddWindow = async () => {
    if (!newStartDate || !newEndDate) {
      toast.error('Please select both start and end dates')
      return
    }

    if (newStartDate > newEndDate) {
      toast.error('Start date must be before end date')
      return
    }

    try {
      setSubmitting(true)
      const response = await fetch(`/api/trips/${trip.id}/date-windows`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          startDate: newStartDate,
          endDate: newEndDate
        })
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to add dates')
      }

      toast.success('Dates added')
      setNewStartDate('')
      setNewEndDate('')
      setShowAddWindow(false)
      await fetchWindows()
      onRefresh()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  // Handle supporting a window
  const handleSupport = async (windowId: string) => {
    try {
      const response = await fetch(`/api/trips/${trip.id}/date-windows/${windowId}/support`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to add support')
      }

      await fetchWindows()
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  // Handle removing support
  const handleRemoveSupport = async (windowId: string) => {
    try {
      const response = await fetch(`/api/trips/${trip.id}/date-windows/${windowId}/support`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to remove support')
      }

      await fetchWindows()
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  // Handle proposing dates (leader only)
  const handlePropose = async () => {
    if (!pendingProposeWindowId) return

    try {
      setSubmitting(true)
      const response = await fetch(`/api/trips/${trip.id}/propose-dates`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          windowId: pendingProposeWindowId,
          leaderOverride: useLeaderOverride
        })
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to propose dates')
      }

      toast.success('Dates proposed')
      setShowProposeConfirm(false)
      setPendingProposeWindowId(null)
      setUseLeaderOverride(false)
      await fetchWindows()
      onRefresh()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  // Handle withdrawing proposal (leader only)
  const handleWithdraw = async () => {
    try {
      setSubmitting(true)
      const response = await fetch(`/api/trips/${trip.id}/withdraw-proposal`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to withdraw proposal')
      }

      toast.success('Proposal withdrawn')
      await fetchWindows()
      onRefresh()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  // Handle locking dates (leader only)
  const handleLock = async () => {
    try {
      setSubmitting(true)
      const response = await fetch(`/api/trips/${trip.id}/lock-proposed`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to lock dates')
      }

      toast.success('Dates locked!')
      setShowLockConfirm(false)
      onRefresh()
      onClose()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-red" />
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="p-4 text-center">
        <AlertCircle className="h-8 w-8 text-brand-red mx-auto mb-2" />
        <p className="text-sm text-muted-foreground mb-4">{error}</p>
        <Button variant="outline" onClick={fetchWindows}>Try again</Button>
      </div>
    )
  }

  // LOCKED phase - show locked dates
  if (phase === 'LOCKED' || trip.status === 'locked') {
    return (
      <div className="space-y-4 p-4">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-100 mb-3">
            <Lock className="h-6 w-6 text-green-600" />
          </div>
          <h3 className="text-lg font-semibold text-brand-carbon">Dates Locked</h3>
          <p className="text-2xl font-bold text-brand-carbon mt-2">
            {formatDate(trip.lockedStartDate)} – {formatDate(trip.lockedEndDate)}
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            These dates are final. Time to plan the itinerary!
          </p>
        </div>
      </div>
    )
  }

  // PROPOSED phase - show proposed window with lock option
  if (phase === 'PROPOSED' && proposedWindowId) {
    const proposedWindow = windows.find(w => w.id === proposedWindowId)

    return (
      <div className="space-y-4 p-4">
        <div className="text-center mb-4">
          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
            Dates Proposed
          </Badge>
        </div>

        {proposedWindow && (
          <Card className="border-2 border-amber-300 bg-amber-50/50">
            <CardContent className="pt-4">
              <div className="text-center">
                <p className="text-xl font-bold text-brand-carbon">
                  {formatDate(proposedWindow.startDate)} – {formatDate(proposedWindow.endDate)}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {proposedWindow.supportCount} {proposedWindow.supportCount === 1 ? 'person' : 'people'} can make this
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {isLeader ? (
          <div className="space-y-3">
            <Button
              onClick={() => setShowLockConfirm(true)}
              className="w-full bg-brand-red hover:bg-brand-red/90"
              disabled={submitting}
            >
              <Lock className="h-4 w-4 mr-2" />
              Lock these dates
            </Button>
            <Button
              variant="outline"
              onClick={handleWithdraw}
              className="w-full"
              disabled={submitting}
            >
              Change proposal
            </Button>
          </div>
        ) : (
          <p className="text-sm text-center text-muted-foreground">
            Waiting for the trip leader to lock these dates.
          </p>
        )}

        {/* Lock confirmation dialog */}
        <AlertDialog open={showLockConfirm} onOpenChange={setShowLockConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Lock these dates?</AlertDialogTitle>
              <AlertDialogDescription>
                {proposedWindow && (
                  <>
                    <strong>{formatDate(proposedWindow.startDate)} – {formatDate(proposedWindow.endDate)}</strong>
                    <br /><br />
                  </>
                )}
                Once locked, the trip dates cannot be changed. Everyone can then start planning the itinerary.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleLock}
                disabled={submitting}
                className="bg-brand-red hover:bg-brand-red/90"
              >
                {submitting ? 'Locking...' : 'Lock dates'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    )
  }

  // COLLECTING phase - show windows and allow adding/supporting
  const sortedWindows = [...windows].sort((a, b) => b.supportCount - a.supportCount)
  const stats = proposalStatus?.stats

  return (
    <div className="space-y-4 p-4">
      {/* Header with progress */}
      <div className="text-center mb-2">
        <h3 className="text-lg font-semibold text-brand-carbon">When works for everyone?</h3>
        {stats && (
          <p className="text-sm text-muted-foreground">
            {stats.responderCount} of {stats.totalTravelers} travelers have responded
          </p>
        )}
      </div>

      {/* Add new window form */}
      <Collapsible open={showAddWindow} onOpenChange={setShowAddWindow}>
        <CollapsibleTrigger asChild>
          <Button variant="outline" className="w-full justify-between">
            <span className="flex items-center">
              <Plus className="h-4 w-4 mr-2" />
              Propose dates that work for you
            </span>
            {showAddWindow ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-3">
          <Card>
            <CardContent className="pt-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="startDate" className="text-sm">Start date</Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={newStartDate}
                    onChange={(e) => setNewStartDate(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="endDate" className="text-sm">End date</Label>
                  <Input
                    id="endDate"
                    type="date"
                    value={newEndDate}
                    onChange={(e) => setNewEndDate(e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>
              <Button
                onClick={handleAddWindow}
                disabled={submitting || !newStartDate || !newEndDate}
                className="w-full bg-brand-blue hover:bg-brand-blue/90"
              >
                {submitting ? 'Adding...' : 'Add these dates'}
              </Button>
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>

      {/* Windows list */}
      {sortedWindows.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <CalendarIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>No date options yet. Be the first to propose dates!</p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">Date options</p>
          {sortedWindows.map((window, index) => {
            const isSupported = userSupportedWindowIds.includes(window.id)
            const isLeading = index === 0 && window.supportCount > 0

            return (
              <Card
                key={window.id}
                className={`transition-all ${isLeading ? 'border-brand-blue/50 bg-blue-50/30' : ''}`}
              >
                <CardContent className="py-3 px-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-brand-carbon">
                          {formatDate(window.startDate)} – {formatDate(window.endDate)}
                        </span>
                        {isLeading && (
                          <Badge variant="outline" className="text-xs bg-brand-blue/10 text-brand-blue border-brand-blue/30">
                            Leading
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1 mt-1 text-sm text-muted-foreground">
                        <Users className="h-3 w-3" />
                        <span>{window.supportCount} can make this</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Support/unsupport button */}
                      {phase === 'COLLECTING' && (
                        isSupported ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleRemoveSupport(window.id)}
                            className="text-green-600 border-green-200 hover:bg-green-50"
                          >
                            <Check className="h-4 w-4 mr-1" />
                            Works for me
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleSupport(window.id)}
                          >
                            I can make this
                          </Button>
                        )
                      )}

                      {/* Propose button (leader only) */}
                      {isLeader && phase === 'COLLECTING' && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setPendingProposeWindowId(window.id)
                                  setUseLeaderOverride(!proposalStatus?.proposalReady)
                                  setShowProposeConfirm(true)
                                }}
                                className="text-brand-red hover:text-brand-red hover:bg-brand-red/10"
                              >
                                Propose
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              {proposalStatus?.proposalReady
                                ? 'Propose this as the final dates'
                                : 'Propose now (threshold not met yet)'}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Leader CTA when proposal ready */}
      {isLeader && proposalStatus?.proposalReady && proposalStatus.leadingWindow && phase === 'COLLECTING' && (
        <Card className="border-brand-red/30 bg-red-50/30">
          <CardContent className="py-4">
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-2">
                {proposalStatus.stats.leaderCount} of {proposalStatus.stats.totalTravelers} travelers can make the leading option
              </p>
              <Button
                onClick={() => {
                  setPendingProposeWindowId(proposalStatus.leadingWindow!.id)
                  setUseLeaderOverride(false)
                  setShowProposeConfirm(true)
                }}
                className="bg-brand-red hover:bg-brand-red/90"
              >
                Propose {formatDate(proposalStatus.leadingWindow.startDate)} – {formatDate(proposalStatus.leadingWindow.endDate)}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Propose confirmation dialog */}
      <AlertDialog open={showProposeConfirm} onOpenChange={setShowProposeConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {useLeaderOverride ? 'Propose dates now?' : 'Propose these dates?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                const proposingWindow = windows.find(w => w.id === pendingProposeWindowId)
                return proposingWindow ? (
                  <>
                    <strong>{formatDate(proposingWindow.startDate)} – {formatDate(proposingWindow.endDate)}</strong>
                    <br /><br />
                    {proposingWindow.supportCount} {proposingWindow.supportCount === 1 ? 'person' : 'people'} can make this.
                    <br /><br />
                  </>
                ) : null
              })()}
              {useLeaderOverride && (
                <span className="text-amber-600">
                  The usual threshold hasn't been met yet, but you can propose now if you're confident about these dates.
                </span>
              )}
              {!useLeaderOverride && (
                'Once proposed, you can still change your mind before locking.'
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handlePropose}
              disabled={submitting}
              className="bg-brand-red hover:bg-brand-red/90"
            >
              {submitting ? 'Proposing...' : 'Propose dates'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
