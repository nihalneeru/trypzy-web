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
  ThumbsUp,
  ThumbsDown,
  HelpCircle,
  Trash2
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
  precision?: 'exact' | 'approx' | 'unstructured'
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

interface Reaction {
  userId: string
  userName: string
  reactionType: 'WORKS' | 'CAVEAT' | 'CANT'
  note?: string
  createdAt: string
}

interface ApprovalSummary {
  approvals: number
  caveats: number
  cants: number
  totalReactions: number
  requiredApprovals: number
  memberCount: number
  readyToLock: boolean
  userReaction: 'WORKS' | 'CAVEAT' | 'CANT' | null
  reactions: Reaction[]
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
    if (!dateStr) return 'Invalid Date'
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    })
  } catch {
    return dateStr
  }
}

// Format window for display (handles unstructured windows)
function formatWindowDisplay(window: { startDate?: string; endDate?: string; sourceText?: string; precision?: string }): string {
  if (window.precision === 'unstructured' && window.sourceText) {
    return `"${window.sourceText}"`
  }
  return `${formatDate(window.startDate || '')} – ${formatDate(window.endDate || '')}`
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
  const [approvalSummary, setApprovalSummary] = useState<ApprovalSummary | null>(null)

  // Duration preference state
  const [userDurationPref, setUserDurationPref] = useState<string | null>(null)
  const [durationAggregate, setDurationAggregate] = useState<Record<string, Array<{ userId: string; userName: string }>>>({})
  const [durationTotalResponses, setDurationTotalResponses] = useState(0)

  // User window quota state
  const [userWindowCount, setUserWindowCount] = useState(0)
  const [maxWindows, setMaxWindows] = useState(2)
  const [canCreateWindow, setCanCreateWindow] = useState(true)

  // Form state for adding new window
  const [showAddWindow, setShowAddWindow] = useState(false)
  const [newDateText, setNewDateText] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Manual date entry fallback (when normalization fails)
  const [showManualEntry, setShowManualEntry] = useState(false)
  const [manualStartDate, setManualStartDate] = useState('')
  const [manualEndDate, setManualEndDate] = useState('')
  const [normalizationError, setNormalizationError] = useState<string | null>(null)

  // Similarity nudge state
  const [similarWindowId, setSimilarWindowId] = useState<string | null>(null)
  const [similarScore, setSimilarScore] = useState<number | null>(null)
  const [showSimilarNudge, setShowSimilarNudge] = useState(false)
  const [pendingWindowText, setPendingWindowText] = useState('')

  // Confirmation dialogs
  const [showLockConfirm, setShowLockConfirm] = useState(false)
  const [pendingProposeWindowId, setPendingProposeWindowId] = useState<string | null>(null)
  const [useLeaderOverride, setUseLeaderOverride] = useState(false)

  // Concrete dates dialog (for unstructured windows)
  const [showConcreteDatesDialog, setShowConcreteDatesDialog] = useState(false)
  const [concreteDatesStart, setConcreteDatesStart] = useState('')
  const [concreteDatesEnd, setConcreteDatesEnd] = useState('')
  const [pendingUnstructuredWindow, setPendingUnstructuredWindow] = useState<DateWindow | null>(null)

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
      setApprovalSummary(data.approvalSummary || null)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [trip.id, token])

  useEffect(() => {
    fetchWindows()
  }, [fetchWindows])

  // Fetch duration preferences
  const fetchDurationPreferences = useCallback(async () => {
    try {
      const response = await fetch(`/api/trips/${trip.id}/duration-preferences`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (response.ok) {
        const data = await response.json()
        setUserDurationPref(data.userPreference)
        setDurationAggregate(data.aggregate || {})
        setDurationTotalResponses(data.totalResponses || 0)
      }
    } catch {
      // Silent fail - preferences are optional
    }
  }, [trip.id, token])

  useEffect(() => {
    fetchDurationPreferences()
  }, [fetchDurationPreferences])

  // Handle setting duration preference
  const handleSetDurationPref = async (pref: string | null) => {
    try {
      const response = await fetch(`/api/trips/${trip.id}/duration-preference`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ preference: pref })
      })
      if (response.ok) {
        setUserDurationPref(pref)
        await fetchDurationPreferences()
        toast.success('Preference saved')
      }
    } catch {
      toast.error('Failed to save preference')
    }
  }

  // Handle adding a new window with free-form text
  const handleAddWindow = async (acknowledgeOverlap = false) => {
    const textToSubmit = acknowledgeOverlap ? pendingWindowText : newDateText

    if (!textToSubmit.trim()) {
      toast.error('Please enter a date range')
      return
    }

    try {
      setSubmitting(true)
      setNormalizationError(null)
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
        // Check if this is a normalization error - offer to accept anyway
        if (data.error && (data.error.includes('Could not understand') || data.error.includes('one date range at a time'))) {
          setNormalizationError(data.error)
          return
        }
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
      resetFormState()
      await fetchWindows()
      onRefresh()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  // Handle manual date entry (fallback when normalization fails)
  const handleManualSubmit = async (acknowledgeOverlap = false) => {
    if (!manualStartDate || !manualEndDate) {
      toast.error('Please enter both start and end dates')
      return
    }

    if (manualStartDate > manualEndDate) {
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
          startDate: manualStartDate,
          endDate: manualEndDate,
          acknowledgeOverlap
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to add dates')
      }

      // Check if API is asking for overlap acknowledgement
      if (data.requiresAcknowledgement && data.similarWindowId) {
        setSimilarWindowId(data.similarWindowId)
        setSimilarScore(data.similarScore)
        setShowSimilarNudge(true)
        return
      }

      toast.success('Dates added')
      resetFormState()
      await fetchWindows()
      onRefresh()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  // Handle force accept (when normalization fails but user wants to proceed)
  const handleForceAccept = async () => {
    if (!newDateText.trim()) {
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
          text: newDateText,
          forceAccept: true
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to add dates')
      }

      toast.success('Dates added')
      resetFormState()
      await fetchWindows()
      onRefresh()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  // Reset all form state
  const resetFormState = () => {
    setNewDateText('')
    setPendingWindowText('')
    setShowAddWindow(false)
    setShowSimilarNudge(false)
    setSimilarWindowId(null)
    setShowManualEntry(false)
    setManualStartDate('')
    setManualEndDate('')
    setNormalizationError(null)
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

  // Handle deleting own window
  const handleDeleteWindow = async (windowId: string) => {
    try {
      const response = await fetch(`/api/trips/${trip.id}/date-windows/${windowId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to delete suggestion')
      }

      toast.success('Date suggestion removed')
      await fetchWindows()
      onRefresh()
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  // Handle proposing dates (leader only)
  const handlePropose = async (
    windowId?: string,
    overrideFlag?: boolean,
    concreteDatesOverride?: { startDate: string; endDate: string }
  ) => {
    const targetWindowId = windowId || pendingProposeWindowId
    const shouldOverride = overrideFlag ?? useLeaderOverride

    if (!targetWindowId) return

    // Set state for potential concrete dates dialog
    if (windowId) {
      setPendingProposeWindowId(windowId)
      setUseLeaderOverride(shouldOverride)
    }

    try {
      setSubmitting(true)
      const response = await fetch(`/api/trips/${trip.id}/propose-dates`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          windowId: targetWindowId,
          leaderOverride: shouldOverride,
          ...(concreteDatesOverride && { concreteDates: concreteDatesOverride })
        })
      })

      const data = await response.json()

      if (!response.ok) {
        // Check if this is an unstructured window needing concrete dates
        if (data.code === 'REQUIRES_CONCRETE_DATES') {
          // Find the window to show in dialog
          const unstructuredWindow = windows.find(w => w.id === pendingProposeWindowId)
          setPendingUnstructuredWindow(unstructuredWindow || null)
          setShowConcreteDatesDialog(true)
          return
        }
        throw new Error(data.error || 'Failed to propose dates')
      }

      toast.success('Dates proposed')
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

  // Handle submitting concrete dates for unstructured window
  const handleConcreteDatesSubmit = async () => {
    if (!concreteDatesStart || !concreteDatesEnd) {
      toast.error('Please enter both start and end dates')
      return
    }

    if (concreteDatesStart > concreteDatesEnd) {
      toast.error('Start date must be before end date')
      return
    }

    await handlePropose(undefined, undefined, { startDate: concreteDatesStart, endDate: concreteDatesEnd })

    // Reset concrete dates state on success
    setShowConcreteDatesDialog(false)
    setConcreteDatesStart('')
    setConcreteDatesEnd('')
    setPendingUnstructuredWindow(null)
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
  const handleLock = async (override = false) => {
    try {
      setSubmitting(true)
      const response = await fetch(`/api/trips/${trip.id}/lock-proposed`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ leaderOverride: override })
      })

      const data = await response.json()

      if (!response.ok) {
        // Check if it's an approval threshold error
        if (data.code === 'INSUFFICIENT_APPROVALS') {
          throw new Error(`Need ${data.approvalSummary?.requiredApprovals} approvals to lock. Currently have ${data.approvalSummary?.approvals}.`)
        }
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

  // Handle reacting to proposed dates
  const handleReact = async (reactionType: 'WORKS' | 'CAVEAT' | 'CANT') => {
    try {
      setSubmitting(true)
      const response = await fetch(`/api/trips/${trip.id}/proposed-window/react`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ reactionType })
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to submit reaction')
      }

      const data = await response.json()
      setApprovalSummary(data.approvalSummary)

      const labels: Record<string, string> = {
        WORKS: 'Works for me',
        CAVEAT: 'Maybe with conditions',
        CANT: "Can't make it"
      }
      toast.success(labels[reactionType])
      await fetchWindows()
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

  // PROPOSED phase - show proposed window with reactions and leader actions
  if (phase === 'PROPOSED' && proposedWindowId) {
    const proposedWindow = windows.find(w => w.id === proposedWindowId)
    const canLock = approvalSummary?.readyToLock ?? false
    const userReaction = approvalSummary?.userReaction

    return (
      <div className="space-y-4 p-4">
        <div className="text-center mb-4">
          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
            Leader's Pick — Share Your Thoughts
          </Badge>
        </div>

        {proposedWindow && (
          <Card className="border-2 border-amber-300 bg-amber-50/50">
            <CardContent className="pt-4">
              <div className="text-center">
                <p className="text-xl font-bold text-brand-carbon">
                  {formatWindowDisplay(proposedWindow)}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {proposedWindow.supportCount} {proposedWindow.supportCount === 1 ? 'person' : 'people'} can make this
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Reaction buttons - show for everyone */}
        <div className="space-y-3">
          <p className="text-sm font-medium text-center text-brand-carbon">
            Do these dates work?
          </p>
          <div className="flex gap-2 justify-center">
            <Button
              size="sm"
              variant={userReaction === 'WORKS' ? 'default' : 'outline'}
              onClick={() => handleReact('WORKS')}
              disabled={submitting}
              className={userReaction === 'WORKS' ? 'bg-green-600 hover:bg-green-700' : 'border-green-200 text-green-700 hover:bg-green-50'}
            >
              <ThumbsUp className="h-4 w-4 mr-1" />
              Works
            </Button>
            <Button
              size="sm"
              variant={userReaction === 'CAVEAT' ? 'default' : 'outline'}
              onClick={() => handleReact('CAVEAT')}
              disabled={submitting}
              className={userReaction === 'CAVEAT' ? 'bg-amber-500 hover:bg-amber-600' : 'border-amber-200 text-amber-700 hover:bg-amber-50'}
            >
              <HelpCircle className="h-4 w-4 mr-1" />
              Maybe
            </Button>
            <Button
              size="sm"
              variant={userReaction === 'CANT' ? 'default' : 'outline'}
              onClick={() => handleReact('CANT')}
              disabled={submitting}
              className={userReaction === 'CANT' ? 'bg-red-600 hover:bg-red-700' : 'border-red-200 text-red-700 hover:bg-red-50'}
            >
              <ThumbsDown className="h-4 w-4 mr-1" />
              Can't
            </Button>
          </div>
        </div>

        {/* Reaction summary */}
        {approvalSummary && approvalSummary.totalReactions > 0 && (
          <Card className="bg-gray-50">
            <CardContent className="py-3">
              <div className="flex justify-center gap-4 text-sm">
                {approvalSummary.approvals > 0 && (
                  <span className="flex items-center text-green-600">
                    <ThumbsUp className="h-3 w-3 mr-1" />
                    {approvalSummary.approvals}
                  </span>
                )}
                {approvalSummary.caveats > 0 && (
                  <span className="flex items-center text-amber-600">
                    <HelpCircle className="h-3 w-3 mr-1" />
                    {approvalSummary.caveats}
                  </span>
                )}
                {approvalSummary.cants > 0 && (
                  <span className="flex items-center text-red-600">
                    <ThumbsDown className="h-3 w-3 mr-1" />
                    {approvalSummary.cants}
                  </span>
                )}
              </div>
              <p className="text-xs text-center text-muted-foreground mt-1">
                {approvalSummary.totalReactions} of {approvalSummary.memberCount} responded
                {!canLock && ` • Need ${approvalSummary.requiredApprovals} approvals to lock`}
              </p>
              {/* Show who reacted */}
              {approvalSummary.reactions.length > 0 && (
                <div className="mt-2 pt-2 border-t">
                  <div className="flex flex-wrap justify-center gap-1">
                    {approvalSummary.reactions.map((r) => (
                      <TooltipProvider key={r.userId}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span
                              className={`text-xs px-2 py-0.5 rounded-full ${
                                r.reactionType === 'WORKS' ? 'bg-green-100 text-green-700' :
                                r.reactionType === 'CAVEAT' ? 'bg-amber-100 text-amber-700' :
                                'bg-red-100 text-red-700'
                              }`}
                            >
                              {r.userName.split(' ')[0]}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            {r.userName}: {r.reactionType === 'WORKS' ? 'Works for me' : r.reactionType === 'CAVEAT' ? 'Maybe' : "Can't make it"}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Leader actions */}
        {isLeader && (
          <div className="space-y-3 pt-2 border-t">
            {/* Primary: Lock dates */}
            <Button
              onClick={() => setShowLockConfirm(true)}
              className={`w-full ${canLock ? 'bg-brand-red hover:bg-brand-red/90' : 'bg-gray-400 hover:bg-gray-500'}`}
              disabled={submitting}
            >
              <Lock className="h-4 w-4 mr-2" />
              {canLock ? 'Lock these dates' : `Lock dates (${approvalSummary?.approvals || 0}/${approvalSummary?.requiredApprovals || '?'} approvals)`}
            </Button>

            {/* Secondary: Change proposal (withdraw and go back to COLLECTING) */}
            <Button
              variant="outline"
              onClick={handleWithdraw}
              className="w-full"
              disabled={submitting}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Change proposal
            </Button>
          </div>
        )}

        {/* Non-leader waiting message */}
        {!isLeader && (
          <p className="text-sm text-center text-muted-foreground pt-2 border-t">
            {canLock
              ? 'Waiting for the trip leader to lock dates.'
              : `Need ${approvalSummary?.requiredApprovals || '?'} approvals before dates can be locked.`
            }
          </p>
        )}

        {/* Lock confirmation dialog */}
        <AlertDialog open={showLockConfirm} onOpenChange={setShowLockConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Lock these dates?</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2">
                  {proposedWindow && (
                    <p><strong>{formatWindowDisplay(proposedWindow)}</strong></p>
                  )}
                  {approvalSummary && (
                    <p className="text-sm">
                      {approvalSummary.approvals} of {approvalSummary.memberCount} travelers approved.
                      {!canLock && (
                        <span className="text-amber-600 block mt-1">
                          ⚠️ Approval threshold not met ({approvalSummary.approvals}/{approvalSummary.requiredApprovals}).
                          You can still lock if you're confident.
                        </span>
                      )}
                    </p>
                  )}
                  <p className="text-sm text-muted-foreground">
                    Once locked, the trip dates cannot be changed. Everyone can then start planning the itinerary.
                  </p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
              {!canLock && (
                <AlertDialogAction
                  onClick={() => handleLock(true)}
                  disabled={submitting}
                  className="bg-amber-500 hover:bg-amber-600"
                >
                  {submitting ? 'Locking...' : 'Lock anyway'}
                </AlertDialogAction>
              )}
              {canLock && (
                <AlertDialogAction
                  onClick={() => handleLock(false)}
                  disabled={submitting}
                  className="bg-brand-red hover:bg-brand-red/90"
                >
                  {submitting ? 'Locking...' : 'Lock dates'}
                </AlertDialogAction>
              )}
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

      {/* Duration preference selector */}
      <Card className="bg-gray-50/50">
        <CardContent className="py-3">
          {/* Show creator's initial duration hint if set */}
          {trip.duration && (
            <p className="text-xs text-muted-foreground mb-2">
              Trip creator suggested: <span className="font-medium">
                {trip.duration === 'weekend' ? 'Weekend (2-3 days)' :
                 trip.duration === 'extended-weekend' ? 'Extended weekend (3-4 days)' :
                 trip.duration === 'few-days' ? 'A few days (4-5 days)' :
                 trip.duration === 'week' ? 'A week' :
                 trip.duration === 'week-plus' ? 'Week+ (8+ days)' :
                 trip.duration === 'flexible' ? 'Flexible' : trip.duration}
              </span>
            </p>
          )}
          <p className="text-sm font-medium text-brand-carbon mb-2">How long would you like this trip to be?</p>
          <div className="flex flex-wrap gap-2">
            {[
              { value: 'weekend', label: 'Weekend', desc: '2-3 days' },
              { value: 'extended', label: 'Extended', desc: '3-4 days' },
              { value: 'week', label: 'A week', desc: '5-7 days' },
              { value: 'week_plus', label: 'Week+', desc: '8+ days' },
              { value: 'flexible', label: 'Flexible', desc: 'Any length' },
            ].map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleSetDurationPref(userDurationPref === opt.value ? null : opt.value)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                  userDurationPref === opt.value
                    ? 'bg-brand-blue text-white border-brand-blue'
                    : 'bg-white text-gray-700 border-gray-200 hover:border-brand-blue/50'
                }`}
              >
                {opt.label}
                <span className="text-[10px] opacity-70 ml-1">({opt.desc})</span>
              </button>
            ))}
          </div>
          {isLeader && durationTotalResponses > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-200">
              <p className="text-xs text-muted-foreground mb-1">Group preferences ({durationTotalResponses} responded):</p>
              <div className="flex flex-wrap gap-1">
                {Object.entries(durationAggregate).map(([pref, users]) =>
                  users.length > 0 && (
                    <span key={pref} className="text-xs bg-white px-2 py-0.5 rounded border">
                      {pref === 'weekend' ? 'Weekend' :
                       pref === 'extended' ? 'Extended' :
                       pref === 'week' ? 'A week' :
                       pref === 'week_plus' ? 'Week+' : 'Flexible'}: {users.length}
                    </span>
                  )
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

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
                ? `Add your dates (${remainingWindows} left)`
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
                  {/* Show normalization error with accept anyway option */}
                  {normalizationError && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg mb-3">
                      <p className="text-sm text-amber-800 mb-2">
                        {normalizationError}
                      </p>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setNormalizationError(null)
                            setNewDateText('')
                          }}
                          className="flex-1"
                        >
                          Try again
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleForceAccept()}
                          disabled={submitting}
                          className="flex-1 bg-brand-blue hover:bg-brand-blue/90"
                        >
                          {submitting ? 'Adding...' : 'Accept anyway'}
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Free-form text input (hidden when showing error) */}
                  {!normalizationError && (
                    <>
                      <div>
                        <Label htmlFor="dateText" className="text-sm">When works for you?</Label>
                        <Input
                          id="dateText"
                          type="text"
                          value={newDateText}
                          onChange={(e) => setNewDateText(e.target.value)}
                          placeholder="e.g., Feb 7-9, early March, last week of June"
                          className="mt-1"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Examples: "Feb 7-9", "mid March", "last weekend of June", "April"
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          You can change your dates anytime until they're locked.
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
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-brand-carbon">
                          {window.precision === 'unstructured'
                            ? `"${window.sourceText}"`
                            : `${formatDate(window.startDate)} – ${formatDate(window.endDate)}`
                          }
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
                        {window.precision === 'unstructured' && (
                          <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                            flexible
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

                      {/* Delete button (own windows only, collecting phase) */}
                      {phase === 'COLLECTING' && window.proposedBy === user.id && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleDeleteWindow(window.id)}
                                className="text-muted-foreground hover:text-red-600 hover:bg-red-50"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Remove your suggestion</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}

                      {/* Propose button (leader only) */}
                      {isLeader && phase === 'COLLECTING' && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handlePropose(window.id, !proposalStatus?.proposalReady)}
                                disabled={submitting}
                                className="text-brand-red hover:text-brand-red hover:bg-brand-red/10"
                              >
                                {submitting ? 'Proposing...' : 'Propose'}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              {proposalStatus?.proposalReady
                                ? 'Put this to the group for feedback'
                                : 'Put to group (not everyone has responded yet)'}
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

      {/* Leader insight when threshold not yet met */}
      {isLeader && !proposalStatus?.proposalReady && phase === 'COLLECTING' && windows.length > 0 && stats && (
        (() => {
          const responseRate = stats.totalTravelers > 0 ? stats.responderCount / stats.totalTravelers : 0
          const leadingWindow = proposalStatus?.leadingWindow
          const leaderCount = stats.leaderCount || 0

          if (responseRate >= 0.8) {
            return (
              <Card className="border-brand-blue/30 bg-blue-50/30">
                <CardContent className="py-4">
                  <p className="text-sm text-brand-carbon text-center">
                    {stats.responderCount} of {stats.totalTravelers} travelers have weighed in.
                    {leadingWindow && leaderCount > 0
                      ? <> <strong>{formatWindowDisplay(leadingWindow)}</strong> leads with {leaderCount}.</>
                      : null
                    }
                    {' '}You can propose any option when ready.
                  </p>
                </CardContent>
              </Card>
            )
          }

          if (responseRate >= 0.5) {
            return (
              <Card className="border-brand-blue/20 bg-blue-50/20">
                <CardContent className="py-4">
                  <p className="text-sm text-muted-foreground text-center">
                    Over half the group has responded ({stats.responderCount} of {stats.totalTravelers}).
                    {leadingWindow && leaderCount > 0
                      ? <> <strong>{formatWindowDisplay(leadingWindow)}</strong> leads with {leaderCount} supporter{leaderCount !== 1 ? 's' : ''}.</>
                      : null
                    }
                  </p>
                </CardContent>
              </Card>
            )
          }

          return null
        })()
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
                onClick={() => handlePropose(proposalStatus.leadingWindow!.id, false)}
                disabled={submitting}
                className="bg-brand-red hover:bg-brand-red/90"
              >
                {submitting ? 'Proposing...' : `Propose ${formatWindowDisplay(proposalStatus.leadingWindow)}`}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Concrete dates dialog (for unstructured windows) */}
      <AlertDialog open={showConcreteDatesDialog} onOpenChange={(open) => {
        setShowConcreteDatesDialog(open)
        if (!open) {
          setConcreteDatesStart('')
          setConcreteDatesEnd('')
          setPendingUnstructuredWindow(null)
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Specify exact dates</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4">
                <p>
                  The suggestion <strong>"{pendingUnstructuredWindow?.sourceText}"</strong> needs specific dates before it can be proposed.
                </p>
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="concrete-start" className="text-sm font-medium">Start date</Label>
                    <Input
                      id="concrete-start"
                      type="date"
                      value={concreteDatesStart}
                      onChange={(e) => setConcreteDatesStart(e.target.value)}
                      min={new Date().toISOString().split('T')[0]}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="concrete-end" className="text-sm font-medium">End date</Label>
                    <Input
                      id="concrete-end"
                      type="date"
                      value={concreteDatesEnd}
                      onChange={(e) => setConcreteDatesEnd(e.target.value)}
                      min={concreteDatesStart || new Date().toISOString().split('T')[0]}
                      className="mt-1"
                    />
                  </div>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConcreteDatesSubmit}
              disabled={submitting || !concreteDatesStart || !concreteDatesEnd}
              className="bg-brand-red hover:bg-brand-red/90"
            >
              {submitting ? 'Proposing...' : 'Propose with these dates'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
