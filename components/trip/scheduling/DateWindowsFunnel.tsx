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
  Share2,
  ChevronRight
} from 'lucide-react'
import { toast } from 'sonner'
import { copyToClipboard, nativeShare } from '@/lib/native/share'
import { datesProposed, datesLocked } from '@/lib/analytics/track'
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
import { ConfidenceMeter } from './ConfidenceMeter'
import { normalizeWindow } from '@/lib/trips/normalizeWindow'

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
  windowType?: 'available' | 'blocker'
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
  prefillStart?: string
  prefillEnd?: string
}

// Generate smart date chips based on current date context
function generateSmartChips(): { label: string; action: 'dates' | 'flexible' }[] {
  const now = new Date()
  const currentMonth = now.getMonth()
  const currentYear = now.getFullYear()
  const chips: { label: string; action: 'dates' | 'flexible' }[] = []

  // Next 2 months: "Weekend in {month}", "Late {month}", "Early {month+1}"
  const month1 = currentMonth + 1
  const month2 = currentMonth + 2
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December']

  const m1Name = monthNames[month1 % 12]
  const m2Name = monthNames[month2 % 12]

  chips.push({ label: `Weekend in ${m1Name}`, action: 'dates' })
  chips.push({ label: `Late ${m1Name}`, action: 'dates' })
  chips.push({ label: `Early ${m2Name}`, action: 'dates' })

  // Seasonal chips based on current month (non-overlapping)
  if (currentMonth >= 1 && currentMonth <= 2) {
    // Feb-Mar: spring break planning
    chips.push({ label: 'Spring break', action: 'dates' })
  } else if (currentMonth >= 3 && currentMonth <= 4) {
    // Apr-May: Memorial Day is late May
    chips.push({ label: 'Memorial Day weekend', action: 'dates' })
  } else if (currentMonth >= 5 && currentMonth <= 6) {
    // Jun-Jul: 4th of July
    chips.push({ label: '4th of July weekend', action: 'dates' })
  } else if (currentMonth >= 7 && currentMonth <= 8) {
    // Aug-Sep: Labor Day + fall planning
    chips.push({ label: 'Labor Day weekend', action: 'dates' })
  } else if (currentMonth >= 9 && currentMonth <= 10) {
    // Oct-Nov: Thanksgiving is late Nov
    chips.push({ label: 'Thanksgiving week', action: 'dates' })
  } else if (currentMonth === 11 || currentMonth === 0) {
    // Dec-Jan: holiday/New Year planning
    chips.push({ label: "New Year's weekend", action: 'dates' })
  }

  // "I'm flexible" = any dates work for me (submitted as free-text window)
  chips.push({ label: "I'm flexible", action: 'dates' })

  // Max 5 chips
  return chips.slice(0, 5)
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

// Phase indicator for the scheduling funnel
const PHASE_STEPS = [
  { key: 'COLLECTING', label: 'Suggest dates' },
  { key: 'PROPOSED', label: 'React to proposal' },
  { key: 'LOCKED', label: 'Confirm dates' },
] as const

const PHASE_SUBTITLES: Record<string, string> = {
  COLLECTING: 'Suggest dates that work for you',
  PROPOSED: 'The group is reviewing proposed dates — share your reaction',
  LOCKED: 'Dates confirmed!',
}

function PhaseIndicator({ phase }: { phase: 'COLLECTING' | 'PROPOSED' | 'LOCKED' }) {
  const phaseIndex = PHASE_STEPS.findIndex(s => s.key === phase)

  return (
    <div className="mb-4">
      <div className="flex items-center justify-center gap-1">
        {PHASE_STEPS.map((step, i) => {
          const isCompleted = i < phaseIndex
          const isActive = i === phaseIndex
          const isFuture = i > phaseIndex

          return (
            <div key={step.key} className="flex items-center">
              <div className="flex items-center gap-1.5">
                {isCompleted && (
                  <Check className="h-3.5 w-3.5 text-brand-carbon/40" />
                )}
                {isActive && (
                  <span className="inline-block h-2 w-2 rounded-full bg-brand-red" />
                )}
                <span
                  className={`text-xs ${
                    isCompleted
                      ? 'text-brand-carbon/40'
                      : isActive
                        ? 'font-semibold text-brand-carbon'
                        : 'text-brand-carbon/40'
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {i < PHASE_STEPS.length - 1 && (
                <ChevronRight className={`h-3 w-3 mx-1 ${isFuture ? 'text-brand-carbon/20' : 'text-brand-carbon/40'}`} />
              )}
            </div>
          )
        })}
      </div>
      <p className="text-center text-xs text-brand-carbon/50 mt-1.5">
        {PHASE_SUBTITLES[phase]}
      </p>
    </div>
  )
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
  onQuoteToChat,
  prefillStart,
  prefillEnd
}: DateWindowsFunnelProps) {
  // State
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [phase, setPhase] = useState<'COLLECTING' | 'PROPOSED' | 'LOCKED'>('COLLECTING')
  const [windows, setWindows] = useState<DateWindow[]>([])
  const [proposalStatus, setProposalStatus] = useState<ProposalStatus | null>(null)
  const [userSupportedWindowIds, setUserSupportedWindowIds] = useState<string[]>([])
  const [proposedWindowId, setProposedWindowId] = useState<string | null>(null)
  const [proposedWindowIds, setProposedWindowIds] = useState<string[]>([])
  const [isLeader, setIsLeader] = useState(false)
  const [approvalSummary, setApprovalSummary] = useState<ApprovalSummary | null>(null)
  const [approvalSummaries, setApprovalSummaries] = useState<Record<string, ApprovalSummary>>({})

  // Shortlist mode state (leader CONVERGE UX)
  const [shortlistMode, setShortlistMode] = useState(false)
  const [selectedShortlistIds, setSelectedShortlistIds] = useState<string[]>([])

  // Lock target for multi-window lock dialog
  const [lockTargetId, setLockTargetId] = useState<string | null>(null)

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
  const [inputMode, setInputMode] = useState<'free' | 'busy'>('free')

  // Manual date entry fallback (when normalization fails)
  const [showManualEntry, setShowManualEntry] = useState(false)
  const [manualStartDate, setManualStartDate] = useState('')
  const [manualEndDate, setManualEndDate] = useState('')
  const [normalizationError, setNormalizationError] = useState<string | null>(null)

  // Progressive disclosure state
  const [showInsightDetails, setShowInsightDetails] = useState(false)
  const [showLeaderFooter, setShowLeaderFooter] = useState(false)

  // Smart chip calendar pre-selection
  const [chipPreStart, setChipPreStart] = useState<string | null>(null)
  const [chipPreEnd, setChipPreEnd] = useState<string | null>(null)
  const [selectedChipLabel, setSelectedChipLabel] = useState<string | null>(null)

  // Chat-to-scheduling bridge: prefill calendar from chat date detection
  useEffect(() => {
    if (prefillStart && prefillEnd) {
      setChipPreStart(prefillStart)
      setChipPreEnd(prefillEnd)
      setShowAddWindow(true)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
        throw new Error(data.error || "Couldn't load date options — try again")
      }

      const data = await response.json()
      setPhase(data.phase)
      setWindows(data.windows || [])
      setProposalStatus(data.proposalStatus)
      setUserSupportedWindowIds(data.userSupportedWindowIds || [])
      setProposedWindowId(data.proposedWindowId)
      setProposedWindowIds(data.proposedWindowIds || (data.proposedWindowId ? [data.proposedWindowId] : []))
      setIsLeader(data.isLeader)
      setUserWindowCount(data.userWindowCount ?? 0)
      setMaxWindows(data.maxWindows ?? 2)
      setCanCreateWindow(data.canCreateWindow ?? true)
      setApprovalSummary(data.approvalSummary || null)
      setApprovalSummaries(data.approvalSummaries || {})
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [trip.id, trip.status, token])

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
          acknowledgeOverlap,
        })
      })

      const data = await response.json()

      if (!response.ok) {
        // Check if this is a normalization error - offer to accept anyway
        if (data.error && (data.error.includes('Could not understand') || data.error.includes('one date range at a time'))) {
          setNormalizationError(data.error)
          return
        }
        throw new Error(data.error || "Couldn't add dates — try again")
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
      datesProposed(trip.id, isLeader ? 'leader' : 'traveler')
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
          acknowledgeOverlap,
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Couldn't add dates — try again")
      }

      // Check if API is asking for overlap acknowledgement
      if (data.requiresAcknowledgement && data.similarWindowId) {
        setSimilarWindowId(data.similarWindowId)
        setSimilarScore(data.similarScore)
        setShowSimilarNudge(true)
        return
      }

      toast.success('Dates added')
      datesProposed(trip.id, isLeader ? 'leader' : 'traveler')
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
          forceAccept: true,
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Couldn't add dates — try again")
      }

      toast.success('Dates added')
      datesProposed(trip.id, isLeader ? 'leader' : 'traveler')
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
    // Clear chip selection — user picked dates manually on the calendar
    setSelectedChipLabel(null)
    setChipPreStart(null)
    setChipPreEnd(null)
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
    setInputMode('free')
    setChipPreStart(null)
    setChipPreEnd(null)
  }

  // Smart date chips
  const smartChips = useMemo(() => generateSmartChips(), [])

  // Compute heat map data from available windows for calendar overlay
  // Counts unique travelers per day across all windows
  const heatData = useMemo(() => {
    const availableWindows = windows.filter(w =>
      (w.windowType || 'available') !== 'blocker' &&
      w.startDate && w.endDate
    )
    if (availableWindows.length === 0) return null

    const DAY_MS = 86400000
    const dayUsers: Record<string, Set<string>> = {}

    for (const w of availableWindows) {
      const start = new Date(w.startDate + 'T12:00:00').getTime()
      const end = new Date(w.endDate + 'T12:00:00').getTime()
      const supporters: string[] = []
      if (w.supporterIds) supporters.push(...w.supporterIds)
      if (w.proposedBy && !supporters.includes(w.proposedBy)) supporters.push(w.proposedBy)

      for (let t = start; t <= end; t += DAY_MS) {
        const d = new Date(t)
        const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
        if (!dayUsers[key]) dayUsers[key] = new Set()
        supporters.forEach(uid => dayUsers[key].add(uid))
      }
    }

    const heat: Record<string, number> = {}
    for (const [key, users] of Object.entries(dayUsers)) {
      heat[key] = users.size
    }
    return heat
  }, [windows])

  // Handle chip tap — parse text, pre-fill calendar
  const handleChipTap = useCallback((chip: { label: string; action: 'dates' | 'flexible' }) => {
    // Toggle off: if already selected, deselect and clear everything
    if (selectedChipLabel === chip.label) {
      setSelectedChipLabel(null)
      setChipPreStart(null)
      setChipPreEnd(null)
      setNewDateText('')
      setUseTextInput(false)
      return
    }

    const result = normalizeWindow(chip.label)
    if ('error' in result) {
      // Unparseable chip (e.g. "Weekend in March", "Spring break")
      // Switch to text input and pre-populate with the chip label
      setUseTextInput(true)
      setNewDateText(chip.label)
      setChipPreStart(null)
      setChipPreEnd(null)
      setSelectedChipLabel(chip.label)
      return
    }
    // Parseable chip — switch to calendar mode with pre-selection
    setUseTextInput(false)
    setChipPreStart(result.startISO)
    setChipPreEnd(result.endISO)
    // Also set the text so the "Add these dates" button works
    setNewDateText(`${result.startISO} - ${result.endISO}`)
    setSelectedChipLabel(chip.label)
  }, [selectedChipLabel])

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
        throw new Error(data.error || "Couldn't add support — try again")
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
        throw new Error(data.error || "Couldn't remove support — try again")
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
        throw new Error(data.error || "Couldn't delete suggestion — try again")
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
        throw new Error(data.error || "Couldn't propose dates — try again")
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

  // Handle multi-window propose (leader shortlist)
  const handleProposeMulti = async (windowIdsToPropose: string[]) => {
    if (windowIdsToPropose.length === 0) return
    try {
      setSubmitting(true)
      const response = await fetch(`/api/trips/${trip.id}/propose-dates`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          windowIds: windowIdsToPropose,
          leaderOverride: true
        })
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Couldn't propose dates — try again")
      }

      toast.success(windowIdsToPropose.length === 1 ? 'Dates proposed' : `${windowIdsToPropose.length} options proposed`)
      setShortlistMode(false)
      setSelectedShortlistIds([])
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
        throw new Error(data.error || "Couldn't propose dates — try again")
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
        throw new Error(data.error || "Couldn't withdraw proposal — try again")
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
  const handleLock = async (override = false, lockWindowId?: string) => {
    try {
      setSubmitting(true)
      const response = await fetch(`/api/trips/${trip.id}/lock-proposed`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          leaderOverride: override,
          ...(lockWindowId && { windowId: lockWindowId })
        })
      })

      const data = await response.json()

      if (!response.ok) {
        // Check if it's an approval threshold error
        if (data.code === 'INSUFFICIENT_APPROVALS') {
          throw new Error(`Need ${data.approvalSummary?.requiredApprovals} approvals to lock. Currently have ${data.approvalSummary?.approvals}.`)
        }
        throw new Error(data.error || "Couldn't confirm dates — try again")
      }

      toast.success('Dates locked!')
      datesLocked(trip.id, travelers?.length || 0)
      setShowLockConfirm(false)
      onRefresh()
      onClose()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  // Handle reacting to proposed dates (supports per-window reactions)
  const handleReact = async (reactionType: 'WORKS' | 'CAVEAT' | 'CANT', windowId?: string) => {
    const targetWindowId = windowId || proposedWindowIds[0] || proposedWindowId
    // Snapshot current state
    const prevApprovalSummaries = { ...approvalSummaries }
    const prevApprovalSummary = approvalSummary

    // Optimistically update UI for the target window
    const targetSummary = targetWindowId ? approvalSummaries[targetWindowId] : approvalSummary
    if (targetSummary && targetWindowId) {
      const prevReaction = targetSummary.userReaction
      const updated = { ...targetSummary }

      if (prevReaction === 'WORKS') updated.approvals = Math.max(0, updated.approvals - 1)
      else if (prevReaction === 'CAVEAT') updated.caveats = Math.max(0, updated.caveats - 1)
      else if (prevReaction === 'CANT') updated.cants = Math.max(0, updated.cants - 1)

      if (reactionType === 'WORKS') updated.approvals += 1
      else if (reactionType === 'CAVEAT') updated.caveats += 1
      else if (reactionType === 'CANT') updated.cants += 1

      if (!prevReaction) updated.totalReactions += 1
      updated.userReaction = reactionType
      updated.readyToLock = updated.approvals >= updated.requiredApprovals

      const userName = user.name || user.userName || 'You'
      updated.reactions = updated.reactions.filter((r: Reaction) => r.userId !== user.id)
      updated.reactions.push({ userId: user.id, userName, reactionType, createdAt: new Date().toISOString() })

      setApprovalSummaries(prev => ({ ...prev, [targetWindowId]: updated }))

      // Also update legacy approvalSummary if this is the primary window
      if (targetWindowId === (proposedWindowIds[0] || proposedWindowId)) {
        setApprovalSummary(updated)
      }
    } else if (approvalSummary) {
      // Legacy single-window path
      const prevReaction = approvalSummary.userReaction
      const updated = { ...approvalSummary }

      if (prevReaction === 'WORKS') updated.approvals = Math.max(0, updated.approvals - 1)
      else if (prevReaction === 'CAVEAT') updated.caveats = Math.max(0, updated.caveats - 1)
      else if (prevReaction === 'CANT') updated.cants = Math.max(0, updated.cants - 1)

      if (reactionType === 'WORKS') updated.approvals += 1
      else if (reactionType === 'CAVEAT') updated.caveats += 1
      else if (reactionType === 'CANT') updated.cants += 1

      if (!prevReaction) updated.totalReactions += 1
      updated.userReaction = reactionType
      updated.readyToLock = updated.approvals >= updated.requiredApprovals

      const userName = user.name || user.userName || 'You'
      updated.reactions = updated.reactions.filter((r: Reaction) => r.userId !== user.id)
      updated.reactions.push({ userId: user.id, userName, reactionType, createdAt: new Date().toISOString() })

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
      body: JSON.stringify({ reactionType, windowId: targetWindowId })
    }).then(async (response) => {
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Couldn't submit reaction — try again")
      }
      // Background sync
      fetchWindows()
    }).catch((err: any) => {
      // Revert to snapshot
      setApprovalSummaries(prevApprovalSummaries)
      setApprovalSummary(prevApprovalSummary)
      toast.error(err.message || "Couldn't save — tap to retry")
    }).finally(() => {
      setSubmitting(false)
    })
  }

  // Compute sorted available windows for use in aiRecommendation (excludes blockers)
  const sortedWindowsMemo = useMemo(() =>
    [...windows]
      .filter(w => (w.windowType || 'available') !== 'blocker')
      .sort((a, b) => b.supportCount - a.supportCount),
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
        <p className="text-sm text-brand-carbon/60">Loading scheduling...</p>
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
        <PhaseIndicator phase="LOCKED" />
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

  // PROPOSED phase - show proposed window(s) with reactions and leader actions
  if (phase === 'PROPOSED' && proposedWindowIds.length > 0) {
    const proposedWindows = proposedWindowIds
      .map(id => windows.find(w => w.id === id))
      .filter(Boolean) as DateWindow[]

    // Determine the leading window (most WORKS reactions)
    const leadingId = proposedWindows.reduce((bestId, w) => {
      const wSummary = approvalSummaries[w.id]
      const bestSummary = approvalSummaries[bestId]
      if (!wSummary) return bestId
      if (!bestSummary) return w.id
      return wSummary.approvals > bestSummary.approvals ? w.id : bestId
    }, proposedWindows[0]?.id || '')

    // Lock state for dialog
    const lockTargetSummary = lockTargetId ? approvalSummaries[lockTargetId] : null
    const lockTargetWindow = lockTargetId ? windows.find(w => w.id === lockTargetId) : null
    const lockTargetCanLock = lockTargetSummary?.readyToLock ?? false

    return (
      <div className="space-y-4 p-4">
        <PhaseIndicator phase="PROPOSED" />
        <div className="text-center mb-4">
          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
            {proposedWindows.length > 1
              ? `${proposedWindows.length} Options — Share Your Thoughts`
              : "Leader's Pick — Share Your Thoughts"
            }
          </Badge>
        </div>

        {/* Proposed window cards */}
        {proposedWindows.map((pw) => {
          const wSummary = approvalSummaries[pw.id]
          const wUserReaction = wSummary?.userReaction
          const isLeadingOption = pw.id === leadingId && proposedWindows.length > 1 && (wSummary?.approvals || 0) > 0

          return (
            <Card key={pw.id} className={`border-2 ${isLeadingOption ? 'border-green-300 bg-green-50/30' : 'border-amber-300 bg-amber-50/50'}`}>
              <CardContent className="pt-4 space-y-3">
                <div className="text-center">
                  <div className="flex items-center justify-center gap-2">
                    <p className="text-lg font-bold text-brand-carbon">
                      {formatWindowDisplay(pw)}
                    </p>
                    {isLeadingOption && (
                      <Badge variant="outline" className="text-xs bg-green-100 text-green-700 border-green-300">
                        Leading
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {pw.supportCount} {pw.supportCount === 1 ? 'person' : 'people'} can make this
                  </p>
                </div>

                {/* Per-window reaction buttons */}
                {isActiveParticipant && (
                  <div className="flex gap-2 justify-center">
                    <Button
                      size="sm"
                      variant={wUserReaction === 'WORKS' ? 'default' : 'outline'}
                      onClick={() => handleReact('WORKS', pw.id)}
                      className={wUserReaction === 'WORKS' ? 'bg-green-600 hover:bg-green-700' : 'border-green-200 text-green-700 hover:bg-green-50'}
                    >
                      <ThumbsUp className="h-4 w-4 mr-1" />
                      Works
                    </Button>
                    <Button
                      size="sm"
                      variant={wUserReaction === 'CAVEAT' ? 'default' : 'outline'}
                      onClick={() => handleReact('CAVEAT', pw.id)}
                      className={wUserReaction === 'CAVEAT' ? 'bg-amber-500 hover:bg-amber-600' : 'border-amber-200 text-amber-700 hover:bg-amber-50'}
                    >
                      <HelpCircle className="h-4 w-4 mr-1" />
                      Checking
                    </Button>
                    <Button
                      size="sm"
                      variant={wUserReaction === 'CANT' ? 'default' : 'outline'}
                      onClick={() => handleReact('CANT', pw.id)}
                      className={wUserReaction === 'CANT' ? 'bg-brand-red hover:bg-brand-red/90' : 'border-brand-red/30 text-brand-red hover:bg-brand-red/5'}
                    >
                      <ThumbsDown className="h-4 w-4 mr-1" />
                      Can't
                    </Button>
                  </div>
                )}

                {/* Per-window reaction summary */}
                {wSummary && wSummary.totalReactions > 0 && (
                  <div className="bg-brand-sand/30 rounded-md px-3 py-2">
                    <div className="flex justify-center gap-3 text-sm">
                      {wSummary.approvals > 0 && (
                        <span className="flex items-center text-green-600">
                          <ThumbsUp className="h-3 w-3 mr-1" />
                          {wSummary.approvals}
                        </span>
                      )}
                      {wSummary.caveats > 0 && (
                        <span className="flex items-center text-amber-600">
                          <HelpCircle className="h-3 w-3 mr-1" />
                          {wSummary.caveats}
                        </span>
                      )}
                      {wSummary.cants > 0 && (
                        <span className="flex items-center text-brand-red">
                          <ThumbsDown className="h-3 w-3 mr-1" />
                          {wSummary.cants}
                        </span>
                      )}
                    </div>
                    {/* Reaction names */}
                    {wSummary.reactions.length > 0 && (
                      <div className="flex flex-wrap justify-center gap-1 mt-1.5">
                        {wSummary.reactions.map((r: Reaction) => (
                          <span
                            key={r.userId}
                            className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                              r.reactionType === 'WORKS' ? 'bg-green-100 text-green-700' :
                              r.reactionType === 'CAVEAT' ? 'bg-amber-100 text-amber-700' :
                              'bg-brand-red/10 text-brand-red'
                            }`}
                          >
                            {r.userName.split(' ')[0]}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Leader: lock this specific window — prominent when ready, secondary override otherwise */}
                {isLeader && (wSummary?.readyToLock ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { setLockTargetId(pw.id); setShowLockConfirm(true) }}
                    disabled={submitting}
                    className="w-full text-sm"
                  >
                    <Lock className="h-3.5 w-3.5 mr-1.5" />
                    Lock this option
                  </Button>
                ) : (
                  <button
                    onClick={() => { setLockTargetId(pw.id); setShowLockConfirm(true) }}
                    disabled={submitting}
                    className="w-full text-center text-xs text-brand-carbon/50 hover:text-brand-blue hover:underline py-1"
                  >
                    Lock anyway (override)
                  </button>
                ))}
              </CardContent>
            </Card>
          )
        })}

        {/* Leader actions */}
        {isLeader && (
          <div className="space-y-3 pt-2 border-t">
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
            The leader will confirm dates once enough travelers respond.
          </p>
        )}

        {/* Lock confirmation dialog */}
        <AlertDialog open={showLockConfirm} onOpenChange={(open) => { setShowLockConfirm(open); if (!open) setLockTargetId(null) }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Lock in these dates?</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2">
                  {lockTargetWindow && (
                    <p><strong>{formatWindowDisplay(lockTargetWindow)}</strong></p>
                  )}
                  {lockTargetSummary && (
                    <p className="text-sm">
                      {lockTargetSummary.approvals} of {lockTargetSummary.memberCount} travelers approved.
                      {!lockTargetCanLock && (
                        <span className="text-muted-foreground block mt-1">
                          {lockTargetSummary.approvals} of {lockTargetSummary.requiredApprovals} approvals so far.
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
              {!lockTargetCanLock && (
                <AlertDialogAction
                  onClick={() => handleLock(true, lockTargetId || undefined)}
                  disabled={submitting}
                  className="bg-brand-red hover:bg-brand-red/90"
                >
                  {submitting ? 'Locking...' : 'Lock anyway'}
                </AlertDialogAction>
              )}
              {lockTargetCanLock && (
                <AlertDialogAction
                  onClick={() => handleLock(false, lockTargetId || undefined)}
                  disabled={submitting}
                  className="bg-brand-red hover:bg-brand-red/90"
                >
                  {submitting ? 'Confirming...' : 'Confirm dates'}
                </AlertDialogAction>
              )}
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    )
  }

  // COLLECTING phase - show windows and allow adding/supporting
  // Sort available windows by support count, blockers at end
  const sortedWindows = [...windows].sort((a, b) => {
    const aBlocker = (a.windowType || 'available') === 'blocker'
    const bBlocker = (b.windowType || 'available') === 'blocker'
    if (aBlocker !== bBlocker) return aBlocker ? 1 : -1
    if (b.supportCount !== a.supportCount) return b.supportCount - a.supportCount
    // Tiebreaker: earlier window wins (matches server-side proposalReady.js)
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  })
  const stats = proposalStatus?.stats
  const remainingWindows = maxWindows - userWindowCount
  const similarWindow = similarWindowId ? windows.find(w => w.id === similarWindowId) : null

  return (
    <div className="space-y-4 p-4">
      <PhaseIndicator phase="COLLECTING" />
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

      {/* Duration preference selector — collapsed after user votes */}
      <Collapsible defaultOpen={!userDurationPref}>
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center justify-between px-4 py-2.5 rounded-lg bg-brand-sand/20 border border-brand-sand/40 hover:bg-brand-sand/30 transition-colors">
            <span className="text-sm font-medium text-brand-carbon">
              {userDurationPref
                ? `Trip length: ${userDurationPref === 'weekend' ? 'Weekend' : userDurationPref === 'extended' ? 'Extended' : userDurationPref === 'week' ? 'A week' : userDurationPref === 'week_plus' ? 'Week+' : 'Flexible'}`
                : 'How long should this trip be?'}
            </span>
            <ChevronDown className="h-4 w-4 text-brand-carbon/40" />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <Card className="bg-brand-sand/20 mt-2 border-brand-sand/40">
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
                        ? 'bg-brand-sand/50 text-brand-carbon/40 border-brand-carbon/10 cursor-not-allowed'
                        : userDurationPref === opt.value
                        ? 'bg-brand-blue text-white border-brand-blue'
                        : 'bg-white text-brand-carbon/80 border-brand-carbon/10 hover:border-brand-blue/50'
                    }`}
                  >
                    {opt.label}
                    <span className="text-[10px] opacity-70 ml-1">({opt.desc})</span>
                  </button>
                ))}
              </div>
              {isLeader && durationTotalResponses > 0 && (
                <div className="mt-3 pt-3 border-t border-brand-carbon/10">
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
        </CollapsibleContent>
      </Collapsible>

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

                      {/* Smart date chips (only in free mode) */}
                      {inputMode === 'free' && (
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {smartChips.map((chip) => (
                            <button
                              key={chip.label}
                              type="button"
                              onClick={() => handleChipTap(chip)}
                              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                                selectedChipLabel === chip.label
                                  ? 'border-brand-blue bg-brand-blue/10 text-brand-blue'
                                  : 'border-brand-carbon/10 bg-white text-brand-carbon/70 hover:border-brand-blue/50 hover:text-brand-blue'
                              }`}
                            >
                              {chip.label}
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Spacer between chips and calendar/text toggle */}
                      <div className="mt-2 mb-1" />

                      {/* Equal-weight toggle tabs */}
                      <div className="flex rounded-lg bg-brand-sand/50 p-0.5 mt-1.5 mb-3">
                        <button
                          type="button"
                          onClick={() => setUseTextInput(true)}
                          className={`flex-1 text-sm font-medium py-1.5 rounded-md transition-colors ${
                            useTextInput
                              ? 'bg-white text-brand-carbon shadow-sm'
                              : 'text-brand-carbon/60 hover:text-brand-carbon/80'
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
                              : 'text-brand-carbon/60 hover:text-brand-carbon/80'
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
                          <DateRangePicker
                            onSelect={handleCalendarSelect}
                            selectedStart={chipPreStart}
                            selectedEnd={chipPreEnd}
                            heatData={heatData}
                            totalTravelers={stats?.totalTravelers || travelers.length}
                          />
                        </div>
                      )}

                      <p className="text-xs text-brand-carbon/40 mt-2">
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
            const isBlocker = (window.windowType || 'available') === 'blocker'
            const isSupported = userSupportedWindowIds.includes(window.id)
            const isLeading = !isBlocker && index === 0 && window.supportCount > 0

            const isShortlisted = selectedShortlistIds.includes(window.id)

            return (
              <Card
                key={window.id}
                className={`transition-all ${
                  isBlocker
                    ? 'border-dashed border-brand-red/40 bg-brand-red/5'
                    : isShortlisted
                    ? 'border-brand-red/50 bg-brand-red/5'
                    : isLeading
                    ? 'border-brand-blue/50 bg-brand-blue/5'
                    : ''
                }`}
                onClick={shortlistMode && !isBlocker ? () => {
                  setSelectedShortlistIds(prev =>
                    prev.includes(window.id)
                      ? prev.filter(id => id !== window.id)
                      : prev.length >= 3
                      ? prev
                      : [...prev, window.id]
                  )
                } : undefined}
              >
                <CardContent className="py-3 px-4">
                  <div className="flex items-center justify-between">
                    {/* Shortlist checkbox */}
                    {shortlistMode && !isBlocker && (
                      <div className="mr-3 flex-shrink-0">
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                          isShortlisted
                            ? 'bg-brand-red border-brand-red text-white'
                            : 'border-brand-carbon/20'
                        }`}>
                          {isShortlisted && <Check className="h-3 w-3" />}
                        </div>
                      </div>
                    )}
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`font-medium ${isBlocker ? 'text-brand-red' : 'text-brand-carbon'}`}>
                          {window.precision === 'unstructured'
                            ? `"${window.sourceText}"`
                            : `${formatDate(window.startDate)} – ${formatDate(window.endDate)}`
                          }
                        </span>
                        {isBlocker && (
                          <Badge variant="outline" className="text-xs bg-brand-red/10 text-brand-red border-brand-red/30">
                            Busy
                          </Badge>
                        )}
                        {isLeading && (
                          <Badge variant="outline" className="text-xs bg-brand-blue/10 text-brand-blue border-brand-blue/30">
                            Most popular
                          </Badge>
                        )}
                        {!isBlocker && (window.precision === 'approx' || window.precision === 'unstructured') && (
                          <Badge variant="outline" className="text-xs text-brand-carbon/50">
                            Approx dates
                          </Badge>
                        )}
                      </div>
                      {!isBlocker && (
                        <>
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
                              <p className="text-xs text-brand-carbon/40 mt-0.5">
                                Not yet: {unconfirmedNames.slice(0, 4).join(', ')}{unconfirmedNames.length > 4 ? ` +${unconfirmedNames.length - 4}` : ''}
                              </p>
                            ) : null
                          })()}
                        </>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Support/unsupport button (hide for blockers) */}
                      {!isBlocker && phase === 'COLLECTING' && isActiveParticipant && (
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
          const leaderCount = stats.leaderCount || 0

          if (responseRate >= 0.5) {
            return (
              <ConfidenceMeter current={leaderCount} target={stats.thresholdNeeded} />
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

              {/* Insight card — summary always visible, details collapsed for non-leaders */}
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
                        <span className="text-[10px] text-muted-foreground bg-brand-sand/50 px-1.5 py-0.5 rounded">
                          may be outdated
                        </span>
                      )}
                    </div>

                    {/* Summary — always visible */}
                    <p className="text-sm text-brand-carbon leading-relaxed">{output.summary}</p>

                    {/* Details — auto-expanded for leaders, collapsed for non-leaders */}
                    {isLeader ? (
                      <>
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
                                      <span className="text-[10px] text-brand-carbon/40 ml-1">(low confidence)</span>
                                    )}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

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

                        {missingNames.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-brand-carbon mb-1">
                              Waiting on ({missingNames.length})
                            </p>
                            <p className="text-sm text-muted-foreground">{missingNames.join(', ')}</p>
                          </div>
                        )}

                        {output.ambiguities?.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-brand-carbon mb-1">Unclear</p>
                            <ul className="space-y-1">
                              {output.ambiguities.map((a: any, i: number) => (
                                <li key={i} className="text-sm text-muted-foreground flex items-start gap-1.5">
                                  <span className="text-brand-carbon/40 mt-0.5 shrink-0">•</span>
                                  <span>{a.text}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {output.followups?.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-brand-carbon mb-1">Suggested questions to ask</p>
                            <ul className="space-y-2">
                              {output.followups.map((f: any, i: number) => (
                                <li key={i} className="text-sm text-muted-foreground bg-white rounded p-2 border">
                                  <div className="flex items-start justify-between gap-2">
                                    <span className="italic">&ldquo;{f.question}&rdquo;</span>
                                    <button
                                      onClick={() => handleCopyFollowup(f.question)}
                                      className="shrink-0 text-muted-foreground hover:text-brand-blue p-1"
                                      aria-label="Copy to clipboard"
                                    >
                                      <Copy className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                  {f.reason && (
                                    <p className="text-xs text-brand-carbon/40 mt-1">{f.reason}</p>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        {!showInsightDetails ? (
                          <button
                            onClick={() => setShowInsightDetails(true)}
                            className="text-xs text-brand-blue hover:underline"
                          >
                            View details
                          </button>
                        ) : (
                          <div className="space-y-3">
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
                                          <span className="text-[10px] text-brand-carbon/40 ml-1">(low confidence)</span>
                                        )}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

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

                            {missingNames.length > 0 && (
                              <div>
                                <p className="text-xs font-medium text-brand-carbon mb-1">
                                  Waiting on ({missingNames.length})
                                </p>
                                <p className="text-sm text-muted-foreground">{missingNames.join(', ')}</p>
                              </div>
                            )}

                            {output.followups?.length > 0 && (
                              <div>
                                <p className="text-xs font-medium text-brand-carbon mb-1">Open questions</p>
                                <ul className="space-y-2">
                                  {output.followups.map((f: any, i: number) => (
                                    <li key={i} className="text-sm text-muted-foreground bg-white rounded p-2 border">
                                      <span className="italic">&ldquo;{f.question}&rdquo;</span>
                                      {f.reason && (
                                        <p className="text-xs text-brand-carbon/40 mt-1">{f.reason}</p>
                                      )}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            <button
                              onClick={() => setShowInsightDetails(false)}
                              className="text-xs text-brand-blue hover:underline"
                            >
                              Hide details
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          )
        })()
      )}

      {/* Sticky propose footer — leader only */}
      {isLeader && phase === 'COLLECTING' && sortedWindowsMemo.length > 0 && (
        (proposalStatus?.proposalReady || sortedWindowsMemo.length >= 3 || showLeaderFooter) ? (
        <div className="sticky bottom-0 -mx-4 -mb-4 bg-white border-t shadow-[0_-2px_8px_rgba(0,0,0,0.06)] px-4 py-3 space-y-2">
          {/* Condensed AI recommendation one-liner */}
          {aiRecommendation && (
            <div className="space-y-1">
              <p className="text-xs text-brand-carbon/70 text-center">
                <Sparkles className="inline h-3 w-3 text-brand-red mr-1 align-text-bottom" />
                TRIPTI.ai recommends <strong>{formatWindowDisplay(aiRecommendation.window)}</strong>
              </p>
              <ConfidenceMeter
                current={aiRecommendation.window.supporterIds.length}
                target={stats?.thresholdNeeded || Math.ceil((stats?.totalTravelers || travelers.length) / 2)}
              />
            </div>
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
          ) : sortedWindowsMemo.length > 0 ? (
            <Button
              onClick={() => handlePropose(sortedWindowsMemo[0].id, true)}
              disabled={submitting}
              variant="outline"
              className="w-full border-brand-red/30 text-brand-red hover:bg-brand-red/5"
            >
              {submitting ? 'Proposing...' : `Propose ${formatWindowDisplay(sortedWindowsMemo[0])}`}
            </Button>
          ) : null}

          {/* Shortlist mode — "Narrow it down" for multi-window proposals */}
          {sortedWindowsMemo.length >= 3 && !shortlistMode && (
            <button
              onClick={() => { setShortlistMode(true); setSelectedShortlistIds([]) }}
              className="w-full text-center text-xs text-brand-blue hover:underline"
            >
              Narrow it down (present 2-3 options)
            </button>
          )}

          {shortlistMode && (
            <div className="space-y-2 pt-2 border-t">
              <p className="text-xs text-muted-foreground text-center">
                Select 1-3 options to present to the group
                {selectedShortlistIds.length > 0 && ` (${selectedShortlistIds.length} selected)`}
              </p>
              <div className="flex gap-2">
                <Button
                  onClick={() => handleProposeMulti(selectedShortlistIds)}
                  disabled={submitting || selectedShortlistIds.length === 0}
                  className="flex-1 bg-brand-red hover:bg-brand-red/90"
                  size="sm"
                >
                  {submitting ? 'Proposing...' : 'Present to group'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => { setShortlistMode(false); setSelectedShortlistIds([]) }}
                  size="sm"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Custom dates toggle — collapse when in shortlist mode */}
          {!showCustomProposal || shortlistMode ? (
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
        ) : (
        <button
          onClick={() => setShowLeaderFooter(true)}
          className="w-full text-center text-sm text-brand-blue hover:underline py-2"
        >
          Leader actions
        </button>
        )
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
