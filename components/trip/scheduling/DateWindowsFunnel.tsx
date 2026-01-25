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
  ChevronUp,
  ArrowLeft,
  Edit
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
  sourceText?: string
  normalizedStart?: string
  normalizedEnd?: string
  precision?: 'exact' | 'approx'
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

/**
 * DateWindowsFunnel - New date-locking funnel component
 *
 * Phases: COLLECTING -> PROPOSED -> LOCKED
 * - COLLECTING: Users propose windows and support them (with caps and overlap detection)
 * - PROPOSED: Leader has proposed a window, awaiting lock (with backtrack options)
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

  // User window quota state
  const [userWindowCount, setUserWindowCount] = useState(0)
  const [maxWindows, setMaxWindows] = useState(2)
  const [canCreateWindow, setCanCreateWindow] = useState(true)

  // Form state for adding new window
  const [showAddWindow, setShowAddWindow] = useState(false)
  const [newDateText, setNewDateText] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Similarity nudge state
  const [similarWindowId, setSimilarWindowId] = useState<string | null>(null)
  const [similarScore, setSimilarScore] = useState<number | null>(null)
  const [showSimilarNudge, setShowSimilarNudge] = useState(false)
  const [pendingWindowText, setPendingWindowText] = useState('')

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
      setUserWindowCount(data.userWindowCount ?? 0)
      setMaxWindows(data.maxWindows ?? 2)
      setCanCreateWindow(data.canCreateWindow ?? true)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [trip.id, token])

  useEffect(() => {
    fetchWindows()
  }, [fetchWindows])

  // Handle adding a new window with free-form text
  const handleAddWindow = async (acknowledgeOverlap = false) => {
    const textToSubmit = acknowledgeOverlap ? pendingWindowText : newDateText

    if (!textToSubmit.trim()) {
      toast.error('Please enter a date range')
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
          text: textToSubmit,
          acknowledgeOverlap
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to add dates')
      }

      // Check if API is asking for overlap acknowledgement (window not yet created)
      if (data.requiresAcknowledgement && data.similarWindowId) {
        setSimilarWindowId(data.similarWindowId)
        setSimilarScore(data.similarScore)
        setPendingWindowText(textToSubmit)
        setShowSimilarNudge(true)
        return
      }

      toast.success('Dates added')
      setNewDateText('')
      setPendingWindowText('')
      setShowAddWindow(false)
      setShowSimilarNudge(false)
      setSimilarWindowId(null)
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

      // Close similarity nudge if supporting the similar window
      if (windowId === similarWindowId) {
        setShowSimilarNudge(false)
        setSimilarWindowId(null)
        setNewDateText('')
        setPendingWindowText('')
        setShowAddWindow(false)
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

  // PROPOSED phase - show proposed window with ALL leader backtrack options
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
            {/* Primary: Lock dates */}
            <Button
              onClick={() => setShowLockConfirm(true)}
              className="w-full bg-brand-red hover:bg-brand-red/90"
              disabled={submitting}
            >
              <Lock className="h-4 w-4 mr-2" />
              Lock these dates
            </Button>

            {/* Secondary: Change proposal (select different window) */}
            <Button
              variant="outline"
              onClick={handleWithdraw}
              className="w-full"
              disabled={submitting}
            >
              <Edit className="h-4 w-4 mr-2" />
              Change proposal
            </Button>

            {/* Tertiary: Withdraw proposal (back to COLLECTING) */}
            <Button
              variant="ghost"
              onClick={handleWithdraw}
              className="w-full text-muted-foreground"
              disabled={submitting}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Withdraw and go back
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
  const remainingWindows = maxWindows - userWindowCount
  const similarWindow = similarWindowId ? windows.find(w => w.id === similarWindowId) : null

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
          <Button
            variant="outline"
            className="w-full justify-between"
            disabled={!canCreateWindow}
          >
            <span className="flex items-center">
              <Plus className="h-4 w-4 mr-2" />
              {canCreateWindow
                ? `Suggest dates (${remainingWindows} left)`
                : `Limit reached (${maxWindows}/${maxWindows})`
              }
            </span>
            {canCreateWindow && (showAddWindow ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />)}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-3">
          <Card>
            <CardContent className="pt-4 space-y-4">
              {/* Similarity nudge */}
              {showSimilarNudge && similarWindow && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-sm font-medium text-amber-800 mb-2">
                    This looks similar to an existing option:
                  </p>
                  <p className="text-sm text-amber-700 mb-3">
                    {formatDate(similarWindow.startDate)} – {formatDate(similarWindow.endDate)}
                    <span className="text-xs ml-1">({similarWindow.supportCount} supporters)</span>
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleSupport(similarWindow.id)}
                      className="flex-1 bg-brand-blue hover:bg-brand-blue/90"
                    >
                      Support existing
                    </Button>
                    {remainingWindows > 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleAddWindow(true)}
                        disabled={submitting}
                        className="flex-1"
                      >
                        Create anyway
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {/* Free-form text input */}
              {!showSimilarNudge && (
                <>
                  <div>
                    <Label htmlFor="dateText" className="text-sm">When could you do this trip?</Label>
                    <Input
                      id="dateText"
                      type="text"
                      value={newDateText}
                      onChange={(e) => setNewDateText(e.target.value)}
                      placeholder="e.g., Feb 7-9, early March, first weekend of April"
                      className="mt-1"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Examples: "Feb 7-9", "mid March", "late April"
                    </p>
                  </div>
                  <Button
                    onClick={() => handleAddWindow(false)}
                    disabled={submitting || !newDateText.trim()}
                    className="w-full bg-brand-blue hover:bg-brand-blue/90"
                  >
                    {submitting ? 'Adding...' : 'Add these dates'}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>

      {/* At cap message */}
      {!canCreateWindow && (
        <p className="text-sm text-center text-muted-foreground">
          You've suggested {maxWindows} dates. Support an existing option below.
        </p>
      )}

      {/* Windows list */}
      {sortedWindows.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <CalendarIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>No date options yet. Be the first to suggest dates!</p>
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
                        {window.precision === 'approx' && (
                          <Badge variant="outline" className="text-xs">
                            ~approx
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
