'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
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
  Trash2,
  Sparkles,
  Copy,
  MessageCircle,
  Share2
} from 'lucide-react'
import { toast } from 'sonner'
import { copyToClipboard, nativeShare } from '@/lib/native/share'
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
import { ConvergenceTimeline } from './ConvergenceTimeline'
import { DateRangePicker } from './DateRangePicker'

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
  onQuoteToChat?: (quote: string) => void
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
  setHasUnsavedChanges,
  onQuoteToChat
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

  // Scheduling insight state
  const [insightData, setInsightData] = useState<any>(null)
  const [generatingInsights, setGeneratingInsights] = useState(false)

  // User window quota state
  const [userWindowCount, setUserWindowCount] = useState(0)
  const [maxWindows, setMaxWindows] = useState(2)
  const [canCreateWindow, setCanCreateWindow] = useState(true)

  // Form state for adding new window
  const [showAddWindow, setShowAddWindow] = useState(false)
  const [newDateText, setNewDateText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [useTextInput, setUseTextInput] = useState(false)

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

  // Viewer participation check — disable interactions for non-travelers
  const isActiveParticipant = trip?.viewer?.isActiveParticipant !== false

  // Ref for auto-scrolling when "Add dates" opens
  const addWindowRef = useRef<HTMLDivElement>(null)

  // Confirmation dialogs
  const [showLockConfirm, setShowLockConfirm] = useState(false)
  const [pendingProposeWindowId, setPendingProposeWindowId] = useState<string | null>(null)
  const [useLeaderOverride, setUseLeaderOverride] = useState(false)

  // Custom proposal state (leader-only)
  const [showCustomProposal, setShowCustomProposal] = useState(false)
  const [customStartDate, setCustomStartDate] = useState('')
  const [customEndDate, setCustomEndDate] = useState('')

  // Concrete dates dialog (for unstructured windows)
  const [showConcreteDatesDialog, setShowConcreteDatesDialog] = useState(false)
  const [concreteDatesStart, setConcreteDatesStart] = useState('')
  const [concreteDatesEnd, setConcreteDatesEnd] = useState('')
  const [pendingUnstructuredWindow, setPendingUnstructuredWindow] = useState<DateWindow | null>(null)

  // Auto-expand "Add dates" when no windows exist and user can participate
  useEffect(() => {
    if (windows.length === 0 && isActiveParticipant && phase === 'COLLECTING') {
      setShowAddWindow(true)
    }
  }, [windows.length, isActiveParticipant, phase])

  // Auto-scroll to the add-dates area when it opens
  useEffect(() => {
    if (showAddWindow && addWindowRef.current) {
      // Small delay to let the collapsible content render
      const timer = setTimeout(() => {
        addWindowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [showAddWindow])

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

  // Mapping from trip creation duration values to scheduling overlay chip values
  const DURATION_CREATION_TO_CHIP: Record<string, string> = {
    'weekend': 'weekend',
    'extended-weekend': 'extended',
    'week': 'week',
    'week-plus': 'week_plus',
    'flexible': 'flexible',
  }

  // Auto-populate leader's duration preference from trip creation if not yet set
  useEffect(() => {
    if (!loading && isLeader && !userDurationPref && trip.duration) {
      const mapped = DURATION_CREATION_TO_CHIP[trip.duration]
      if (mapped) {
        handleSetDurationPref(mapped)
      }
    }
  }, [loading, isLeader, userDurationPref, trip.duration])

  // Fetch scheduling insights (fire-and-forget on mount)
  const fetchInsight = useCallback(async () => {
    try {
      const res = await fetch(`/api/trips/${trip.id}/scheduling/insights`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (res.ok) {
        setInsightData(await res.json())
      }
    } catch {
      // Silent fail — insights are supplementary
    }
  }, [trip.id, token])

  useEffect(() => {
    fetchInsight()
  }, [fetchInsight])

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
      toast.error('Could not save preference — please try again')
    }
  }

  // Handle generating scheduling insights (leader only)
  const handleGenerateInsights = async () => {
    try {
      setGeneratingInsights(true)
      const res = await fetch(`/api/trips/${trip.id}/scheduling/insights`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      })

      if (!res.ok) {
        const data = await res.json()
        if (data.code === 'GENERATION_LIMIT_REACHED') {
          // Update local state so button hides immediately
          setInsightData((prev: any) => ({
            ...prev,
            canRegenerate: false,
            generationCount: data.generationCount,
            maxGenerations: data.maxGenerations
          }))
          toast.error('Insight generation limit reached for this trip')
          return
        }
        throw new Error(data.error || 'Could not generate insights')
      }

      const data = await res.json()

      if (data.source === 'fallback' || !data.output) {
        toast.error('Could not generate insights — please try again later')
        return
      }

      setInsightData({
        output: data.output,
        inputHash: data.inputHash,
        currentHash: data.inputHash,
        isStale: false,
        createdAt: data.createdAt,
        isLeader: true,
        canRegenerate: data.canRegenerate,
        generationCount: data.generationCount,
        maxGenerations: data.maxGenerations
      })
      toast.success('Insights generated')
    } catch (err: any) {
      toast.error(err.message || 'Could not generate insights — please try again')
    } finally {
      setGeneratingInsights(false)
    }
  }

  // Copy follow-up question to clipboard
  const handleCopyFollowup = async (question: string) => {
    const result = await copyToClipboard(question)
    if (result === 'copied') {
      toast.success('Copied to clipboard')
    } else {
      toast.error('Could not copy')
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
      toast.error('Looks like the end date is before the start date')
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
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  // Handle calendar date range selection
  const handleCalendarSelect = useCallback(({ startDate, endDate }: { startDate: string; endDate: string }) => {
    // Use ISO format (YYYY-MM-DD) which normalizeWindow handles natively
    const text = startDate === endDate ? startDate : `${startDate} - ${endDate}`
    setNewDateText(text)
  }, [])

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
    setShowCustomProposal(false)
    setCustomStartDate('')
    setCustomEndDate('')
    setUseTextInput(false)
  }

  // Handle supporting a window
  const handleSupport = async (windowId: string) => {
    // Snapshot current state
    const prevWindows = windows
    const prevSupportedIds = userSupportedWindowIds

    // Optimistically update UI
    setUserSupportedWindowIds(prev => [...prev, windowId])
    setWindows(prev => prev.map(w =>
      w.id === windowId
        ? { ...w, supportCount: w.supportCount + 1, supporterIds: [...w.supporterIds, user.id] }
        : w
    ))

    // Close similarity nudge if supporting the similar window
    if (windowId === similarWindowId) {
      setShowSimilarNudge(false)
      setSimilarWindowId(null)
      setNewDateText('')
      setPendingWindowText('')
      setShowAddWindow(false)
    }

    // Fire API call non-blocking
    fetch(`/api/trips/${trip.id}/date-windows/${windowId}/support`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    }).then(async (response) => {
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to add support')
      }
      // Background sync
      fetchWindows()
    }).catch((err: any) => {
      // Revert to snapshot
      setWindows(prevWindows)
      setUserSupportedWindowIds(prevSupportedIds)
      toast.error(err.message || "Couldn't save — tap to retry")
    })
  }

  // Handle removing support
  const handleRemoveSupport = async (windowId: string) => {
    // Snapshot current state
    const prevWindows = windows
    const prevSupportedIds = userSupportedWindowIds

    // Optimistically update UI
    setUserSupportedWindowIds(prev => prev.filter(id => id !== windowId))
    setWindows(prev => prev.map(w =>
      w.id === windowId
        ? { ...w, supportCount: Math.max(0, w.supportCount - 1), supporterIds: w.supporterIds.filter(id => id !== user.id) }
        : w
    ))

    // Fire API call non-blocking
    fetch(`/api/trips/${trip.id}/date-windows/${windowId}/support`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    }).then(async (response) => {
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to remove support')
      }
      // Background sync
      fetchWindows()
    }).catch((err: any) => {
      // Revert to snapshot
      setWindows(prevWindows)
      setUserSupportedWindowIds(prevSupportedIds)
      toast.error(err.message || "Couldn't save — tap to retry")
    })
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

  // Handle proposing custom dates (leader only — dates not in the pool)
  const handleProposeCustomDates = async () => {
    if (!customStartDate || !customEndDate) {
      toast.error('Please enter both start and end dates')
      return
    }

    if (customStartDate > customEndDate) {
      toast.error('Looks like the end date is before the start date')
      return
    }

    // Check max 14-day duration
    const start = new Date(customStartDate + 'T12:00:00')
    const end = new Date(customEndDate + 'T12:00:00')
    const days = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
    if (days > 14) {
      toast.error('Date range cannot exceed 14 days')
      return
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
          startDate: customStartDate,
          endDate: customEndDate,
          leaderOverride: true
        })
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to propose dates')
      }

      toast.success('Dates proposed')
      setShowCustomProposal(false)
      setCustomStartDate('')
      setCustomEndDate('')
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
      toast.error('Looks like the end date is before the start date')
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
    // Snapshot current state
    const prevApprovalSummary = approvalSummary

    // Optimistically update UI
    if (approvalSummary) {
      const prevReaction = approvalSummary.userReaction
      const updated = { ...approvalSummary }

      // Decrement previous reaction count if user already reacted
      if (prevReaction === 'WORKS') updated.approvals = Math.max(0, updated.approvals - 1)
      else if (prevReaction === 'CAVEAT') updated.caveats = Math.max(0, updated.caveats - 1)
      else if (prevReaction === 'CANT') updated.cants = Math.max(0, updated.cants - 1)

      // Increment new reaction count
      if (reactionType === 'WORKS') updated.approvals += 1
      else if (reactionType === 'CAVEAT') updated.caveats += 1
      else if (reactionType === 'CANT') updated.cants += 1

      // Adjust totalReactions if this is a new reaction (no previous)
      if (!prevReaction) updated.totalReactions += 1

      updated.userReaction = reactionType
      updated.readyToLock = updated.approvals >= updated.requiredApprovals

      // Update reactions list
      const userName = user.name || user.userName || 'You'
      updated.reactions = updated.reactions.filter((r: Reaction) => r.userId !== user.id)
      updated.reactions.push({
        userId: user.id,
        userName,
        reactionType,
        createdAt: new Date().toISOString()
      })

      setApprovalSummary(updated)
    }

    const labels: Record<string, string> = {
      WORKS: 'Works for me',
      CAVEAT: 'Checking — we\'ll keep this on your radar',
      CANT: "Can't make it"
    }
    toast.success(labels[reactionType])

    // Fire API call non-blocking
    fetch(`/api/trips/${trip.id}/proposed-window/react`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ reactionType })
    }).then(async (response) => {
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to submit reaction')
      }
      // Background sync
      fetchWindows()
    }).catch((err: any) => {
      // Revert to snapshot
      setApprovalSummary(prevApprovalSummary)
      toast.error(err.message || "Couldn't save — tap to retry")
    }).finally(() => {
      setSubmitting(false)
    })
  }

  // Compute sorted windows for use in aiRecommendation (also used in render)
  const sortedWindowsMemo = useMemo(() =>
    [...windows].sort((a, b) => b.supportCount - a.supportCount),
    [windows]
  )

  // Compute AI recommendation for leader (rule-based, not LLM)
  const aiRecommendation = useMemo(() => {
    if (!isLeader || phase !== 'COLLECTING' || sortedWindowsMemo.length === 0) return null

    const totalTravelers = proposalStatus?.stats?.totalTravelers || travelers.length
    if (totalTravelers === 0) return null

    // Score each window
    const scored = sortedWindowsMemo.map(w => {
      const confirmed = w.supporterIds.length
      const missing = travelers.filter(t => !w.supporterIds.includes(t.id))
      const missingNames = missing.map(t => (t.name || 'Someone').split(' ')[0])
      const score = confirmed / totalTravelers
      return { window: w, confirmed, missing: missing.length, missingNames, score }
    })

    // Best window (sortedWindowsMemo is already sorted by supportCount desc)
    const best = scored[0]
    if (!best) return null

    // Build recommendation text
    let reason = ''
    if (best.score === 1) {
      reason = 'Works for everyone!'
    } else if (best.score >= 0.8) {
      reason = `Works for ${best.confirmed} of ${totalTravelers}. ${best.missingNames.length === 1 ? `Only ${best.missingNames[0]} hasn't confirmed.` : `${best.missingNames.join(' and ')} haven't confirmed yet.`}`
    } else if (best.score >= 0.5) {
      reason = `${best.confirmed} of ${totalTravelers} confirmed. ${best.missingNames.slice(0, 3).join(', ')}${best.missingNames.length > 3 ? ` and ${best.missingNames.length - 3} more` : ''} haven't responded.`
    } else {
      reason = `Only ${best.confirmed} of ${totalTravelers} confirmed so far. You may want to wait for more responses.`
    }

    // Check if there's a close second with the same support
    const runner = scored[1]
    let alternativeNote = ''
    if (runner && runner.score === best.score) {
      alternativeNote = `${formatWindowDisplay(runner.window)} has the same support \u2014 consider which works better for your circle.`
    }

    return { window: best.window, reason, alternativeNote, score: best.score, confirmed: best.confirmed, total: totalTravelers }
  }, [isLeader, phase, sortedWindowsMemo, travelers, proposalStatus])

  // Loading state
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-red mb-3" />
        <p className="text-sm text-gray-500">Loading scheduling...</p>
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
          {trip.lockedStartDate && trip.lockedEndDate && (
            <div className="flex flex-col items-center gap-2 mt-4">
              <button
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-green-300 text-green-700 hover:bg-green-100 text-sm font-medium transition-colors"
                onClick={() => {
                  import('@/lib/trips/generateICS').then(({ generateICS }) => {
                    const ics = generateICS(trip, null)
                    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = `${(trip.name || 'trip').replace(/[^a-zA-Z0-9 ]/g, '').trim().replace(/\s+/g, '-')}.ics`
                    document.body.appendChild(a)
                    a.click()
                    document.body.removeChild(a)
                    URL.revokeObjectURL(url)
                    toast.success('Calendar file downloaded')
                  })
                }}
              >
                <CalendarIcon className="h-4 w-4" />
                Add to calendar
              </button>
              <button
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-brand-blue/30 text-brand-blue hover:bg-brand-blue/5 text-sm font-medium transition-colors"
                onClick={async () => {
                  const dateRange = `${formatDate(trip.lockedStartDate)} – ${formatDate(trip.lockedEndDate)}`
                  const text = `We locked in dates for ${trip.name}!${trip.destinationHint ? ` ${trip.destinationHint}` : ''} — ${dateRange}`
                  const receiptUrl = `${window.location.origin}/api/trips/${trip.id}/receipt`
                  const result = await nativeShare({
                    title: `${trip.name} — Dates Locked!`,
                    text,
                    url: receiptUrl,
                  })
                  if (result === 'copied') {
                    toast.success('Link copied!')
                  }
                }}
              >
                <Share2 className="h-4 w-4" />
                Share the news
              </button>
            </div>
          )}
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

        {/* Reaction buttons - show for active participants */}
        <div className="space-y-3">
          <p className="text-sm font-medium text-center text-brand-carbon">
            {isActiveParticipant ? 'Do these dates work?' : 'Reactions from travelers'}
          </p>
          {isActiveParticipant && (
          <div className="flex gap-2 justify-center">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant={userReaction === 'WORKS' ? 'default' : 'outline'}
                    onClick={() => handleReact('WORKS')}
                    className={userReaction === 'WORKS' ? 'bg-green-600 hover:bg-green-700' : 'border-green-200 text-green-700 hover:bg-green-50'}
                  >
                    <ThumbsUp className="h-4 w-4 mr-1" />
                    Works
                  </Button>
                </TooltipTrigger>
                <TooltipContent>These dates work for me</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant={userReaction === 'CAVEAT' ? 'default' : 'outline'}
                    onClick={() => handleReact('CAVEAT')}
                    className={userReaction === 'CAVEAT' ? 'bg-amber-500 hover:bg-amber-600' : 'border-amber-200 text-amber-700 hover:bg-amber-50'}
                  >
                    <HelpCircle className="h-4 w-4 mr-1" />
                    Checking
                  </Button>
                </TooltipTrigger>
                <TooltipContent>I'm checking if this works</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant={userReaction === 'CANT' ? 'default' : 'outline'}
                    onClick={() => handleReact('CANT')}
                    className={userReaction === 'CANT' ? 'bg-brand-red hover:bg-brand-red/90' : 'border-brand-red/30 text-brand-red hover:bg-brand-red/5'}
                  >
                    <ThumbsDown className="h-4 w-4 mr-1" />
                    Can't
                  </Button>
                </TooltipTrigger>
                <TooltipContent>I can't make these dates</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          )}
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
                  <span className="flex items-center text-brand-red">
                    <ThumbsDown className="h-3 w-3 mr-1" />
                    {approvalSummary.cants}
                  </span>
                )}
              </div>
              <p className="text-xs text-center text-muted-foreground mt-1">
                {approvalSummary.totalReactions} of {approvalSummary.memberCount} have responded
                {!canLock && ` • ${approvalSummary.requiredApprovals - (approvalSummary.approvals || 0)} more needed to lock`}
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
                                'bg-brand-red/10 text-brand-red'
                              }`}
                            >
                              {r.userName.split(' ')[0]}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            {r.userName}: {r.reactionType === 'WORKS' ? 'Works for me' : r.reactionType === 'CAVEAT' ? 'Checking' : "Can't make it"}
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
              {canLock ? 'Lock these dates' : `Lock dates (${(approvalSummary?.requiredApprovals || 0) - (approvalSummary?.approvals || 0)} more approvals needed)`}
            </Button>

            {/* Secondary: Change proposal (withdraw and go back to COLLECTING) */}
            <Button
              variant="outline"
              onClick={handleWithdraw}
              className="w-full"
              disabled={submitting}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Try different dates
            </Button>
          </div>
        )}

        {/* Non-leader waiting message */}
        {!isLeader && (
          <p className="text-sm text-center text-muted-foreground pt-2 border-t">
            {canLock
              ? 'Waiting for the leader to lock dates.'
              : `The leader can lock once ${approvalSummary?.requiredApprovals || '?'} travelers approve.`
            }
          </p>
        )}

        {/* Lock confirmation dialog */}
        <AlertDialog open={showLockConfirm} onOpenChange={setShowLockConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Lock in these dates?</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2">
                  {proposedWindow && (
                    <p><strong>{formatWindowDisplay(proposedWindow)}</strong></p>
                  )}
                  {approvalSummary && (
                    <p className="text-sm">
                      {approvalSummary.approvals} of {approvalSummary.memberCount} travelers approved.
                      {!canLock && (
                        <span className="text-muted-foreground block mt-1">
                          {approvalSummary.approvals} of {approvalSummary.requiredApprovals} approvals so far.
                          You can move forward when you're ready.
                        </span>
                      )}
                    </p>
                  )}
                  <p className="text-sm text-muted-foreground">
                    These dates will be final — everyone will be notified.
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
                  className="bg-brand-red hover:bg-brand-red/90"
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
  const sortedWindows = [...windows].sort((a, b) => {
    if (b.supportCount !== a.supportCount) return b.supportCount - a.supportCount
    // Tiebreaker: earlier window wins (matches server-side proposalReady.js)
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  })
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
            {isLeader
              ? `${stats.responderCount} of ${stats.totalTravelers} travelers have weighed in`
              : stats.responderCount >= 3
                ? 'Dates are taking shape'
                : 'Share when you\'re free'}
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
                disabled={!isActiveParticipant}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                  !isActiveParticipant
                    ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                    : userDurationPref === opt.value
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
            disabled={!canCreateWindow || !isActiveParticipant}
          >
            <span className="flex items-center">
              <Plus className="h-4 w-4 mr-2" />
              {!isActiveParticipant
                ? "View only — you're not on this trip"
                : canCreateWindow
                ? `Add your dates (${remainingWindows} left)`
                : `You've added ${maxWindows} — support an existing option`
              }
            </span>
            {canCreateWindow && (showAddWindow ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />)}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-3">
          <Card ref={addWindowRef}>
            <CardContent className="pt-4 space-y-4">
              {/* Similarity nudge */}
              {showSimilarNudge && similarWindow && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-sm font-medium text-amber-800 mb-2">
                    This looks similar to a date already suggested:
                  </p>
                  <p className="text-sm text-amber-700 mb-3">
                    {formatDate(similarWindow.startDate)} – {formatDate(similarWindow.endDate)}
                    <span className="text-xs ml-1">({similarWindow.supportCount} can go)</span>
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleSupport(similarWindow.id)}
                      className="flex-1 bg-brand-blue hover:bg-brand-blue/90"
                    >
                      I can make this
                    </Button>
                    {remainingWindows > 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleAddWindow(true)}
                        disabled={submitting}
                        className="flex-1"
                      >
                        Add mine anyway
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {/* Date input — type or calendar (equal-weight tabs) */}
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

                  {!normalizationError && (
                    <>
                      <Label className="text-sm">When works for you?</Label>

                      {/* Equal-weight toggle tabs */}
                      <div className="flex rounded-lg bg-gray-100 p-0.5 mt-1.5 mb-3">
                        <button
                          type="button"
                          onClick={() => setUseTextInput(true)}
                          className={`flex-1 text-sm font-medium py-1.5 rounded-md transition-colors ${
                            useTextInput
                              ? 'bg-white text-brand-carbon shadow-sm'
                              : 'text-gray-500 hover:text-gray-700'
                          }`}
                        >
                          Type dates
                        </button>
                        <button
                          type="button"
                          onClick={() => { setUseTextInput(false); setNewDateText('') }}
                          className={`flex-1 text-sm font-medium py-1.5 rounded-md transition-colors ${
                            !useTextInput
                              ? 'bg-white text-brand-carbon shadow-sm'
                              : 'text-gray-500 hover:text-gray-700'
                          }`}
                        >
                          Pick on calendar
                        </button>
                      </div>

                      {useTextInput ? (
                        <div>
                          <Input
                            id="dateText"
                            type="text"
                            value={newDateText}
                            onChange={(e) => setNewDateText(e.target.value)}
                            placeholder="e.g., Feb 7-9, early March, last week of June"
                          />
                          <p className="text-xs text-muted-foreground mt-1.5">
                            Try: "Feb 7-9", "mid March", "last weekend of June"
                          </p>
                        </div>
                      ) : (
                        <div>
                          <DateRangePicker onSelect={handleCalendarSelect} />
                        </div>
                      )}

                      <p className="text-xs text-gray-400 mt-2">
                        You can change your dates anytime until they're locked.
                      </p>
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
          You've added {maxWindows} dates. See one that works? Tap "I can make this".
        </p>
      )}

      {/* Convergence Timeline — shows per-day availability heat strip */}
      {sortedWindows.length >= 2 && (
        <ConvergenceTimeline
          windows={sortedWindows}
          totalTravelers={stats?.totalTravelers || 0}
        />
      )}

      {/* Windows list */}
      {sortedWindows.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <CalendarIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>No dates yet. Add yours — something like "Feb 7–9" or "first week of April"</p>
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
                className={`transition-all ${isLeading ? 'border-brand-blue/50 bg-brand-blue/5' : ''}`}
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
                            Most popular
                          </Badge>
                        )}
                        {window.precision === 'approx' && (
                          <Badge variant="outline" className="text-xs">
                            Flexible
                          </Badge>
                        )}
                        {window.precision === 'unstructured' && (
                          <Badge variant="outline" className="text-xs">
                            Flexible
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1 mt-1 text-sm text-muted-foreground">
                        <Users className="h-3 w-3" />
                        <span>{window.supportCount} can make this</span>
                      </div>
                      {/* Conflict detection — show who hasn't confirmed (leader only) */}
                      {isLeader && (() => {
                        const totalCount = travelers.length
                        const confirmedCount = window.supporterIds.length
                        const unconfirmed = travelers.filter(t => !window.supporterIds.includes(t.id))
                        const unconfirmedNames = unconfirmed.map(t => (t.name || '?').split(' ')[0])
                        return totalCount > 0 && confirmedCount < totalCount && unconfirmedNames.length > 0 ? (
                          <p className="text-xs text-gray-400 mt-0.5">
                            Not yet: {unconfirmedNames.slice(0, 4).join(', ')}{unconfirmedNames.length > 4 ? ` +${unconfirmedNames.length - 4}` : ''}
                          </p>
                        ) : null
                      })()}
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Support/unsupport button */}
                      {phase === 'COLLECTING' && isActiveParticipant && (
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

                      {/* Discuss button — quote this window into chat */}
                      {onQuoteToChat && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  const label = window.precision === 'unstructured'
                                    ? window.sourceText
                                    : `${formatDate(window.startDate)} – ${formatDate(window.endDate)}`
                                  onQuoteToChat(`Re: ${label} — `)
                                }}
                                className="text-muted-foreground hover:text-brand-blue hover:bg-brand-blue/5"
                              >
                                <MessageCircle className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Discuss in chat</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
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
                                className="text-muted-foreground hover:text-brand-red hover:bg-brand-red/5"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Remove your dates</TooltipContent>
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

      {/* Leader insight (collapsed into propose section) */}
      {isLeader && !proposalStatus?.proposalReady && phase === 'COLLECTING' && windows.length > 0 && stats && (
        (() => {
          const responseRate = stats.totalTravelers > 0 ? stats.responderCount / stats.totalTravelers : 0
          const leadingWindow = proposalStatus?.leadingWindow
          const leaderCount = stats.leaderCount || 0

          if (responseRate >= 0.5) {
            return (
              <p className="text-xs text-brand-carbon/60 text-center">
                {stats.responderCount} of {stats.totalTravelers} weighed in
                {leadingWindow && leaderCount > 0
                  ? <> · <strong>{formatWindowDisplay(leadingWindow)}</strong> leads ({leaderCount})</>
                  : null
                }
              </p>
            )
          }
          return null
        })()
      )}

      {/* Scheduling Insights card (non-leader only — leader has sticky footer) */}
      {!isLeader && phase === 'COLLECTING' && windows.length > 0 && (
        (() => {
          const output = insightData?.output
          const hasInsight = output && output.summary

          // Resolve missing_people userIds to names
          const missingNames = (output?.missing_people || [])
            .map((uid: string) => {
              const t = travelers.find((tr: any) => tr.userId === uid || tr.id === uid)
              return t ? (t.name || t.userName || 'Unknown') : null
            })
            .filter(Boolean)

          return (
            <div className="space-y-2">
              {/* Generate / Update button (leader only) */}
              {isLeader && (!hasInsight || insightData?.isStale) && insightData?.canRegenerate !== false && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleGenerateInsights}
                  disabled={generatingInsights}
                  className="w-full text-brand-blue border-brand-blue/30 hover:bg-brand-blue/5"
                >
                  <Sparkles className="h-4 w-4 mr-1.5" />
                  {generatingInsights
                    ? 'Analyzing chat and windows...'
                    : hasInsight && insightData?.isStale
                      ? 'Update insights'
                      : 'Generate date insights'
                  }
                </Button>
              )}

              {/* Limit reached message (leader only, when stale but can't regenerate) */}
              {isLeader && hasInsight && insightData?.canRegenerate === false && insightData?.isStale && (
                <p className="text-xs text-muted-foreground text-center">
                  Insight generation limit reached ({insightData.generationCount}/{insightData.maxGenerations})
                </p>
              )}

              {/* Insight card (visible to all when data exists) */}
              {hasInsight && (
                <Card className="border-brand-blue/20 bg-brand-sand/30">
                  <CardContent className="py-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-brand-carbon flex items-center gap-1.5">
                        <Sparkles className="h-3.5 w-3.5 text-brand-blue" />
                        Date insights
                        {insightData?.isLeader && insightData?.generationCount > 0 && (
                          <span className="text-[10px] font-normal text-muted-foreground">
                            {insightData.generationCount}/{insightData.maxGenerations}
                          </span>
                        )}
                      </h4>
                      {insightData?.isStale && (
                        <span className="text-[10px] text-muted-foreground bg-gray-100 px-1.5 py-0.5 rounded">
                          may be outdated
                        </span>
                      )}
                    </div>

                    {/* Summary */}
                    <p className="text-sm text-brand-carbon leading-relaxed">{output.summary}</p>

                    {/* Preferences */}
                    {output.preferences?.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-brand-carbon mb-1">Preferences from the group</p>
                        <ul className="space-y-1">
                          {output.preferences.map((p: any, i: number) => (
                            <li key={i} className="text-sm text-muted-foreground flex items-start gap-1.5">
                              <span className="text-brand-blue mt-0.5 shrink-0">•</span>
                              <span>
                                {p.text}
                                {p.confidence === 'low' && (
                                  <span className="text-[10px] text-gray-400 ml-1">(low confidence)</span>
                                )}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Avoids / Conflicts */}
                    {output.avoids?.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-brand-carbon mb-1">Dates to avoid</p>
                        <ul className="space-y-1">
                          {output.avoids.map((a: any, i: number) => (
                            <li key={i} className="text-sm text-muted-foreground flex items-start gap-1.5">
                              <span className="text-brand-red mt-0.5 shrink-0">•</span>
                              <span>{a.text}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Waiting on */}
                    {missingNames.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-brand-carbon mb-1">
                          Waiting on ({missingNames.length})
                        </p>
                        <p className="text-sm text-muted-foreground">{missingNames.join(', ')}</p>
                      </div>
                    )}

                    {/* Ambiguities */}
                    {output.ambiguities?.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-brand-carbon mb-1">Unclear</p>
                        <ul className="space-y-1">
                          {output.ambiguities.map((a: any, i: number) => (
                            <li key={i} className="text-sm text-muted-foreground flex items-start gap-1.5">
                              <span className="text-gray-400 mt-0.5 shrink-0">•</span>
                              <span>{a.text}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Follow-up questions (role-aware) */}
                    {output.followups?.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-brand-carbon mb-1">
                          {isLeader ? 'Suggested questions to ask' : 'Open questions'}
                        </p>
                        <ul className="space-y-2">
                          {output.followups.map((f: any, i: number) => (
                            <li key={i} className="text-sm text-muted-foreground bg-white rounded p-2 border">
                              <div className="flex items-start justify-between gap-2">
                                <span className="italic">&ldquo;{f.question}&rdquo;</span>
                                {isLeader && (
                                  <button
                                    onClick={() => handleCopyFollowup(f.question)}
                                    className="shrink-0 text-muted-foreground hover:text-brand-blue p-1"
                                    aria-label="Copy to clipboard"
                                  >
                                    <Copy className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                              {f.reason && (
                                <p className="text-xs text-gray-400 mt-1">{f.reason}</p>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          )
        })()
      )}

      {/* Sticky propose footer — leader only */}
      {isLeader && phase === 'COLLECTING' && sortedWindows.length > 0 && (
        <div className="sticky bottom-0 -mx-4 -mb-4 bg-white border-t shadow-[0_-2px_8px_rgba(0,0,0,0.06)] px-4 py-3 space-y-2">
          {/* Condensed AI recommendation one-liner */}
          {aiRecommendation && (
            <p className="text-xs text-brand-carbon/70 text-center">
              <Sparkles className="inline h-3 w-3 text-brand-red mr-1 align-text-bottom" />
              Tripti recommends <strong>{formatWindowDisplay(aiRecommendation.window)}</strong>
              {' '}({aiRecommendation.window.supporterIds.length}/{stats?.totalTravelers || travelers.length} confirmed)
            </p>
          )}

          {/* Primary propose button */}
          {proposalStatus?.proposalReady && proposalStatus.leadingWindow ? (
            <Button
              onClick={() => handlePropose(proposalStatus.leadingWindow!.id, false)}
              disabled={submitting}
              className="w-full bg-brand-red hover:bg-brand-red/90"
            >
              {submitting ? 'Proposing...' : `Propose ${formatWindowDisplay(proposalStatus.leadingWindow)}`}
            </Button>
          ) : sortedWindows.length > 0 ? (
            <Button
              onClick={() => handlePropose(sortedWindows[0].id, true)}
              disabled={submitting}
              variant="outline"
              className="w-full border-brand-red/30 text-brand-red hover:bg-brand-red/5"
            >
              {submitting ? 'Proposing...' : `Propose ${formatWindowDisplay(sortedWindows[0])}`}
            </Button>
          ) : null}

          {/* Custom dates toggle */}
          {!showCustomProposal ? (
            <button
              onClick={() => setShowCustomProposal(true)}
              className="w-full text-center text-xs text-brand-blue hover:underline"
            >
              Propose custom dates
            </button>
          ) : (
            <div className="space-y-2 pt-2 border-t">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="custom-start" className="text-xs">Start</Label>
                  <Input
                    id="custom-start"
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    className="mt-0.5 h-8 text-sm"
                  />
                </div>
                <div>
                  <Label htmlFor="custom-end" className="text-xs">End</Label>
                  <Input
                    id="custom-end"
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    min={customStartDate || new Date().toISOString().split('T')[0]}
                    className="mt-0.5 h-8 text-sm"
                  />
                </div>
              </div>
              <Button
                onClick={handleProposeCustomDates}
                disabled={submitting || !customStartDate || !customEndDate}
                className="w-full bg-brand-blue hover:bg-brand-blue/90"
                size="sm"
              >
                {submitting ? 'Proposing...' : 'Propose these dates'}
              </Button>
            </div>
          )}
        </div>
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
