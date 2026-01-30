'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Calendar as CalendarIcon,
  Check,
  X,
  Lock,
  CheckCircle2,
  Vote,
  AlertCircle,
  Heart,
  ThumbsUp,
  HelpCircle
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
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
import { formatTripDateRange } from '@/lib/utils'
import { SchedulingFunnelCard } from '@/components/trip/scheduling/SchedulingFunnelCard'
import { DateWindowsFunnel } from '@/components/trip/scheduling/DateWindowsFunnel'

// Types
interface DatePick {
  rank: 1 | 2 | 3
  startDateISO: string
  endDateISO?: string
}

interface VotingOption {
  optionKey: string
  startDate: string
  endDate: string
  score: number
}

interface SchedulingOverlayProps {
  trip: any
  token: string
  user: any
  onRefresh: (updatedTrip?: any) => void
  onClose: () => void
  setHasUnsavedChanges: (has: boolean) => void
}

// Helper function for getting initials
function getInitials(name: string) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/**
 * SchedulingOverlay - Handles all date scheduling functionality
 *
 * Supports:
 * 1. Scheduling Funnel (funnel mode) - Window proposals + date reactions
 * 2. Availability Submission (top3_heatmap mode) - Pick top 3 date windows
 * 3. Voting Phase - Vote on proposed date options
 * 4. Lock Dates - Leader only, finalize trip dates
 * 5. Read-only state - Show locked dates
 */
export function SchedulingOverlay({
  trip,
  token,
  user,
  onRefresh,
  onClose,
  setHasUnsavedChanges
}: SchedulingOverlayProps) {
  // Check scheduling mode - use funnel for 'funnel' mode trips
  const isFunnelMode = trip.schedulingMode === 'funnel'

  // State for date picks (top 3 heatmap mode)
  const [datePicks, setDatePicks] = useState<DatePick[]>([])
  const [activeRank, setActiveRank] = useState<1 | 2 | 3 | null>(null)
  const [savingPicks, setSavingPicks] = useState(false)
  const [hoveredStartDate, setHoveredStartDate] = useState<string | null>(null)

  // State for voting
  const [selectedVote, setSelectedVote] = useState<string>('')
  const [submittingVote, setSubmittingVote] = useState(false)

  // State for lock confirmation
  const [showLockConfirmation, setShowLockConfirmation] = useState(false)
  const [pendingLockDate, setPendingLockDate] = useState<string | null>(null)
  const [locking, setLocking] = useState(false)

  // Trip scheduling parameters
  const startBound = trip.startBound || trip.startDate
  const endBound = trip.endBound || trip.endDate
  const tripLengthDays = trip.tripLengthDays || trip.duration || 3
  const isLocked = trip.status === 'locked'
  const isVoting = trip.status === 'voting'
  const canParticipate = trip?.viewer?.isActiveParticipant === true
  const isCreator = trip.isCreator || trip.createdBy === user?.id

  // Initialize picks from trip data
  useEffect(() => {
    if (trip.userDatePicks && Array.isArray(trip.userDatePicks)) {
      setDatePicks(trip.userDatePicks)
    }
  }, [trip.userDatePicks])

  // Initialize vote from trip data
  useEffect(() => {
    if (trip.userVote) {
      setSelectedVote(trip.userVote)
    }
  }, [trip.userVote])

  // Compute activeRank based on current picks
  useEffect(() => {
    if (isLocked || isVoting) {
      setActiveRank(null)
      return
    }

    if (datePicks.length === 0) {
      setActiveRank(1)
    } else if (datePicks.length === 1) {
      setActiveRank(datePicks[0].rank === 1 ? 2 : 1)
    } else if (datePicks.length === 2) {
      const ranks = datePicks.map(p => p.rank).sort()
      if (ranks[0] === 1 && ranks[1] === 2) {
        setActiveRank(3)
      } else if (ranks[0] === 1) {
        setActiveRank(2)
      } else {
        setActiveRank(1)
      }
    } else {
      // All 3 picks set
      setActiveRank(null)
    }
  }, [datePicks, isLocked, isVoting])

  // Track unsaved changes for date picks
  const originalPicks = useMemo(() => {
    return trip.userDatePicks || []
  }, [trip.userDatePicks])

  useEffect(() => {
    const hasChanges = JSON.stringify(datePicks) !== JSON.stringify(originalPicks)
    setHasUnsavedChanges(hasChanges)
  }, [datePicks, originalPicks, setHasUnsavedChanges])

  // Compute preview window dates for hovered start date
  const previewWindowDates = useMemo(() => {
    if (!hoveredStartDate) return new Set<string>()

    const startDateObj = new Date(hoveredStartDate + 'T12:00:00')
    const endDateObj = new Date(startDateObj)
    endDateObj.setDate(endDateObj.getDate() + tripLengthDays - 1)
    const endDateISO = endDateObj.toISOString().split('T')[0]

    if (hoveredStartDate < startBound || hoveredStartDate > endBound || endDateISO > endBound) {
      return new Set<string>()
    }

    const windowDates = new Set<string>()
    for (let d = new Date(startDateObj); d <= endDateObj; d.setDate(d.getDate() + 1)) {
      windowDates.add(d.toISOString().split('T')[0])
    }
    return windowDates
  }, [hoveredStartDate, tripLengthDays, startBound, endBound])

  // Compute selected window dates
  const selectedWindowDates = useMemo(() => {
    const selectedWindows = new Map<string, Set<string>>()
    datePicks.forEach(pick => {
      const startDateObj = new Date(pick.startDateISO + 'T12:00:00')
      const endDateObj = new Date(startDateObj)
      endDateObj.setDate(endDateObj.getDate() + tripLengthDays - 1)
      const dates = new Set<string>()
      for (let d = new Date(startDateObj); d <= endDateObj; d.setDate(d.getDate() + 1)) {
        dates.add(d.toISOString().split('T')[0])
      }
      selectedWindows.set(pick.startDateISO, dates)
    })
    return selectedWindows
  }, [datePicks, tripLengthDays])

  // Generate calendar months
  const calendarMonths = useMemo(() => {
    if (!startBound || !endBound) return []

    const months: Array<{
      year: number
      month: number
      monthName: string
      days: Array<{
        date: Date
        dateISO: string
        isInBounds: boolean
        isValidStart: boolean
        score: number
      } | null>
    }> = []

    const startDate = new Date(startBound + 'T12:00:00')
    const endDate = new Date(endBound + 'T12:00:00')

    let currentMonth = new Date(startDate.getFullYear(), startDate.getMonth(), 1)
    const endMonth = new Date(endDate.getFullYear(), endDate.getMonth() + 1, 0)

    while (currentMonth <= endMonth) {
      const year = currentMonth.getFullYear()
      const month = currentMonth.getMonth()
      const firstDay = new Date(year, month, 1)
      const lastDay = new Date(year, month + 1, 0)
      const startDayOfWeek = firstDay.getDay()

      const days: Array<{
        date: Date
        dateISO: string
        isInBounds: boolean
        isValidStart: boolean
        score: number
      } | null> = []

      // Add padding for days before month start
      for (let i = 0; i < startDayOfWeek; i++) {
        days.push(null)
      }

      // Add all days in the month
      for (let d = 1; d <= lastDay.getDate(); d++) {
        const dateISO = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
        const date = new Date(dateISO + 'T12:00:00')

        const isInBounds = dateISO >= startBound && dateISO <= endBound

        let isValidStart = false
        if (isInBounds) {
          const windowEndObj = new Date(date)
          windowEndObj.setDate(windowEndObj.getDate() + tripLengthDays - 1)
          const windowEndISO = windowEndObj.toISOString().split('T')[0]
          isValidStart = windowEndISO <= endBound
        }

        days.push({
          date,
          dateISO,
          isInBounds,
          isValidStart,
          score: trip.heatmapScores?.[dateISO] || 0
        })
      }

      months.push({
        year,
        month,
        monthName: firstDay.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
        days
      })

      currentMonth = new Date(year, month + 1, 1)
    }

    return months
  }, [startBound, endBound, tripLengthDays, trip.heatmapScores])

  // Heat intensity scaling
  const activeVoterCount = trip.effectiveActiveVoterCount ?? 1
  const expectedMaxScore = Math.max(3 * activeVoterCount, 1)

  // Helper functions
  const getRankLabel = (rank: number) => {
    if (rank === 1) return 'Love to go'
    if (rank === 2) return 'Can go'
    if (rank === 3) return 'Might be able'
    return ''
  }

  const getRankIcon = (rank: number) => {
    if (rank === 1) return Heart
    if (rank === 2) return ThumbsUp
    if (rank === 3) return HelpCircle
    return null
  }

  const getRankColor = (rank: number) => {
    if (rank === 1) return 'text-brand-red'
    if (rank === 2) return 'text-brand-blue'
    if (rank === 3) return 'text-yellow-600'
    return ''
  }

  const formatDateRange = (startDateISO: string) => {
    const start = new Date(startDateISO + 'T12:00:00')
    const end = new Date(start)
    end.setDate(end.getDate() + tripLengthDays - 1)
    return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
  }

  const formatDisplayDate = (dateISO: string) => {
    const date = new Date(dateISO + 'T12:00:00')
    return date.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  // Handle date selection
  const handleDateSelect = useCallback((dateISO: string) => {
    if (isLocked || isVoting || !activeRank || !canParticipate) return

    const startDateObj = new Date(dateISO + 'T12:00:00')
    const endDateObj = new Date(startDateObj)
    endDateObj.setDate(endDateObj.getDate() + tripLengthDays - 1)
    const endDateISO = endDateObj.toISOString().split('T')[0]

    if (dateISO < startBound || dateISO > endBound || endDateISO > endBound) {
      return
    }

    const otherPicks = datePicks.filter(p => p.rank !== activeRank)
    setDatePicks([...otherPicks, { rank: activeRank, startDateISO: dateISO, endDateISO }])

    if (activeRank === 1) {
      setActiveRank(2)
    } else if (activeRank === 2) {
      setActiveRank(3)
    } else {
      setActiveRank(null)
    }
  }, [isLocked, isVoting, activeRank, canParticipate, tripLengthDays, startBound, endBound, datePicks])

  const removePick = useCallback((startDateISO: string) => {
    if (isLocked || isVoting) return
    setDatePicks(datePicks.filter(p => p.startDateISO !== startDateISO))
  }, [isLocked, isVoting, datePicks])

  const editPick = useCallback((rank: 1 | 2 | 3) => {
    if (isLocked || isVoting) return
    setActiveRank(rank)
  }, [isLocked, isVoting])

  // API calls
  const savePicks = async () => {
    if (!canParticipate || datePicks.length === 0) return

    setSavingPicks(true)
    try {
      const response = await fetch(`/api/trips/${trip.id}/date-picks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ picks: datePicks })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Failed to save picks')
      }

      const updatedTrip = await response.json()
      toast.success('Date picks saved!')
      setHasUnsavedChanges(false)
      onRefresh(updatedTrip)
    } catch (error: any) {
      toast.error(error.message || 'Could not save picks — please try again')
    } finally {
      setSavingPicks(false)
    }
  }

  const submitVote = async () => {
    if (!canParticipate || !selectedVote) return

    setSubmittingVote(true)
    try {
      const response = await fetch(`/api/trips/${trip.id}/vote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ optionKey: selectedVote })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Failed to submit vote')
      }

      // P0-3: Get updated trip for immediate UI refresh
      const updatedTrip = await response.json()

      toast.success(trip.userVote ? 'Vote updated!' : 'Vote submitted!')
      onRefresh(updatedTrip)
    } catch (error: any) {
      toast.error(error.message || 'Could not submit vote — please try again')
    } finally {
      setSubmittingVote(false)
    }
  }

  const lockDates = async (startDateISO: string) => {
    if (!isCreator) {
      toast.error('Only the trip organizer can lock dates.')
      return
    }

    setPendingLockDate(startDateISO)
    setShowLockConfirmation(true)
  }

  const confirmLockDates = async () => {
    if (!pendingLockDate) return

    setLocking(true)
    try {
      const response = await fetch(`/api/trips/${trip.id}/lock`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ startDateISO: pendingLockDate })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Failed to lock dates')
      }

      // P0-3: Get updated trip for immediate UI refresh
      const updatedTrip = await response.json()

      toast.success('Trip dates locked!')
      setShowLockConfirmation(false)
      setPendingLockDate(null)
      onRefresh(updatedTrip)
    } catch (error: any) {
      if (error.message?.includes('403') || error.message?.includes('Only')) {
        toast.error('Locking dates is available to the trip leader')
      } else {
        toast.error(error.message || 'Could not lock dates — please try again')
      }
      setShowLockConfirmation(false)
      setPendingLockDate(null)
    } finally {
      setLocking(false)
    }
  }

  // Compute vote counts and voters by option
  const { voteCounts, votersByOption } = useMemo(() => {
    const counts: Record<string, number> = {}
    const voters: Record<string, Array<{ id: string; name: string }>> = {}

    if (trip.votes && Array.isArray(trip.votes)) {
      trip.votes.forEach((vote: any) => {
        const optionKey = vote.optionKey || vote.selectedOption
        if (optionKey) {
          counts[optionKey] = (counts[optionKey] || 0) + 1
          if (!voters[optionKey]) voters[optionKey] = []
          voters[optionKey].push({
            id: vote.userId,
            name: vote.userName || vote.user?.name || 'Unknown'
          })
        }
      })
    }

    return { voteCounts: counts, votersByOption: voters }
  }, [trip.votes])

  // Use scheduling funnel for 'funnel' mode trips (checked after all hooks)
  if (isFunnelMode) {
    const memberCount = trip.effectiveActiveVoterCount ?? trip.memberCount ?? 1
    return (
      <SchedulingFunnelCard
        trip={trip}
        token={token}
        user={user}
        memberCount={memberCount}
        onRefresh={onRefresh}
        onClose={onClose}
        setHasUnsavedChanges={setHasUnsavedChanges}
      />
    )
  }

  // Use date windows funnel for 'date_windows' mode trips
  if (trip.schedulingMode === 'date_windows') {
    const travelers = trip.travelers || []
    return (
      <DateWindowsFunnel
        trip={trip}
        token={token}
        user={user}
        travelers={travelers}
        onRefresh={onRefresh}
        onClose={onClose}
        setHasUnsavedChanges={setHasUnsavedChanges}
      />
    )
  }

  // Render locked state
  if (isLocked) {
    return (
      <div className="space-y-4">
        <Card className="bg-green-50 border-green-200">
          <CardContent className="py-8 text-center">
            <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Dates Locked</h3>
            <p className="text-gray-600 mb-4">
              Trip dates have been finalized
            </p>
            <div className="text-3xl font-bold text-green-800 mb-4">
              {formatTripDateRange(trip.lockedStartDate, trip.lockedEndDate)}
            </div>
            <p className="text-sm text-green-700">
              Your trip dates are confirmed. Time to start planning the details!
            </p>
          </CardContent>
        </Card>

        <Button variant="outline" onClick={onClose} className="w-full">
          Close
        </Button>
      </div>
    )
  }

  // Render voting state
  if (isVoting) {
    const votingOptions: VotingOption[] = trip.consensusOptions || trip.votingOptions || []

    return (
      <div className="space-y-4">
        {/* Voting Phase Info */}
        <Card className="border-blue-200 bg-blue-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-blue-800">
              <Vote className="h-5 w-5" />
              Vote for Your Preferred Dates
            </CardTitle>
            <CardDescription>
              Voting is preference - we'll move forward even if everyone doesn't vote.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RadioGroup value={selectedVote} onValueChange={setSelectedVote}>
              <div className="space-y-3">
                {votingOptions.map((option, idx) => {
                  const voters = votersByOption[option.optionKey] || []
                  const voteCount = voteCounts[option.optionKey] || 0
                  const displayVoters = voters.slice(0, 6)
                  const remainingCount = voters.length - displayVoters.length

                  return (
                    <div key={option.optionKey} className="flex items-start space-x-3">
                      <RadioGroupItem
                        value={option.optionKey}
                        id={option.optionKey}
                        className="mt-1"
                        disabled={!canParticipate}
                      />
                      <Label htmlFor={option.optionKey} className="flex-1 cursor-pointer">
                        <div className="p-3 bg-white rounded-lg border hover:bg-gray-50 transition-colors">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-3">
                              <span className="text-lg font-bold text-gray-400">#{idx + 1}</span>
                              <div>
                                <p className="font-medium">{option.startDate} to {option.endDate}</p>
                                <p className="text-sm text-gray-500">
                                  Compatibility: {(option.score * 100).toFixed(0)}%
                                </p>
                              </div>
                            </div>
                            <Badge variant="secondary">
                              {voteCount} vote{voteCount !== 1 ? 's' : ''}
                            </Badge>
                          </div>
                          {voters.length > 0 && (
                            <div className="flex items-center gap-2 flex-wrap mt-2 pt-2 border-t border-gray-200">
                              <span className="text-xs text-gray-500 font-medium">Voted by:</span>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {displayVoters.map((voter) => (
                                  <span
                                    key={voter.id}
                                    className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-800 font-medium"
                                    title={voter.name}
                                  >
                                    {getInitials(voter.name)}
                                  </span>
                                ))}
                                {remainingCount > 0 && (
                                  <span
                                    className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-700 font-medium"
                                    title={voters.slice(6).map(v => v.name).join(', ')}
                                  >
                                    +{remainingCount} more
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </Label>
                    </div>
                  )
                })}
              </div>
            </RadioGroup>

            <div className="mt-6 flex gap-3 flex-wrap">
              <Button
                onClick={submitVote}
                disabled={!canParticipate || !selectedVote || submittingVote}
                className="flex-1"
              >
                {!canParticipate
                  ? 'You have left this trip'
                  : submittingVote
                  ? 'Submitting...'
                  : trip.userVote
                  ? 'Update Vote'
                  : 'Submit Vote'}
              </Button>

              {isCreator && selectedVote && canParticipate && (
                <Button
                  variant="default"
                  onClick={() => lockDates(selectedVote)}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <Lock className="h-4 w-4 mr-2" />
                  Lock Dates
                </Button>
              )}
            </div>

            {!isCreator && (
              <p className="text-xs text-gray-500 mt-2">
                Only the trip organizer can lock dates.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Lock Confirmation Dialog */}
        <AlertDialog open={showLockConfirmation} onOpenChange={setShowLockConfirmation}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Lock dates for everyone?</AlertDialogTitle>
              <AlertDialogDescription>
                This finalizes the trip dates. Once locked, dates cannot be changed.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => {
                setShowLockConfirmation(false)
                setPendingLockDate(null)
              }}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmLockDates}
                disabled={locking}
                className="bg-green-600 hover:bg-green-700"
              >
                {locking ? 'Locking...' : 'Confirm'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    )
  }

  // Render availability submission (top 3 date picks)
  return (
    <div className="space-y-4">
      {/* Left Trip Banner */}
      {!canParticipate && trip?.viewer?.participantStatus === 'left' && (
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="py-4">
            <p className="text-sm text-orange-800">
              <strong>You have left this trip</strong> - scheduling actions are disabled.
              You can still view the trip, but cannot participate in scheduling.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5" />
            Pick Your Top 3 Date Windows
          </CardTitle>
          <CardDescription>
            Pick your top 3 date options. Hover to preview, then click to select.
            You can adjust your picks anytime until the leader locks dates.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Current Picks */}
          <div className="mb-4 space-y-2">
            {datePicks.length === 0 ? (
              <p className="text-sm text-gray-500">
                Hover over dates to preview, then click to select your first pick.
              </p>
            ) : (
              datePicks
                .sort((a, b) => a.rank - b.rank)
                .map((pick) => (
                  <div
                    key={pick.startDateISO}
                    className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                      activeRank === pick.rank
                        ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-200'
                        : 'bg-gray-50 border-gray-200'
                    } ${canParticipate ? 'cursor-pointer hover:bg-gray-100' : ''}`}
                    onClick={() => canParticipate && editPick(pick.rank)}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {(() => {
                          const PickIcon = getRankIcon(pick.rank)
                          return (
                            <Badge variant={pick.rank === 1 ? 'default' : pick.rank === 2 ? 'secondary' : 'outline'} className="flex items-center gap-1">
                              {PickIcon && <PickIcon className={`h-3 w-3 ${pick.rank === 1 ? 'text-white' : getRankColor(pick.rank)}`} />}
                              {pick.rank === 1 ? '1st' : pick.rank === 2 ? '2nd' : '3rd'} {getRankLabel(pick.rank)}
                            </Badge>
                          )
                        })()}
                        <span className="font-medium">{formatDateRange(pick.startDateISO)}</span>
                        {activeRank === pick.rank && (
                          <span className="text-xs text-blue-600">(editing)</span>
                        )}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation()
                        removePick(pick.startDateISO)
                      }}
                      disabled={!canParticipate}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))
            )}
          </div>

          {/* Calendar Overview */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <div className="flex items-center gap-3 flex-wrap">
                <h3 className="text-sm font-medium">Availability Overview</h3>
                {trip.pickProgress && (
                  <Badge variant="secondary" className="text-xs">
                    Picks saved: {trip.pickProgress.respondedCount}/{trip.pickProgress.totalCount}
                  </Badge>
                )}
              </div>
              {activeRank && canParticipate && (
                <Badge variant="outline" className="text-xs">
                  Selecting: {getRankLabel(activeRank)}
                </Badge>
              )}
            </div>

            {/* Date range info */}
            <div className="mb-3 text-xs text-gray-600 space-y-1">
              <div className="flex items-center gap-4 flex-wrap">
                <span>
                  <strong>Date range:</strong> {formatDisplayDate(startBound)} - {formatDisplayDate(endBound)}
                </span>
                <span>
                  <strong>Trip length:</strong> {tripLengthDays} day{tripLengthDays !== 1 ? 's' : ''}
                </span>
              </div>
            </div>

            {/* Rank Selection Legend */}
            {canParticipate && !isLocked && !isVoting && (
              <div className="mb-4 p-3 bg-gray-50 rounded-lg border">
                <p className="text-xs font-medium text-gray-700 mb-2">Click a rank below, then click a date to select:</p>
                <div className="flex items-center gap-3 flex-wrap">
                  {[1, 2, 3].map((rank) => {
                    const RankIcon = getRankIcon(rank)
                    const isActive = activeRank === rank
                    const existingPick = datePicks.find(p => p.rank === rank)
                    return (
                      <button
                        key={rank}
                        onClick={() => setActiveRank(rank as 1 | 2 | 3)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                          isActive
                            ? 'bg-blue-100 text-blue-800 ring-2 ring-blue-400'
                            : existingPick
                            ? 'bg-green-50 text-green-700 border border-green-200'
                            : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-100'
                        }`}
                      >
                        {RankIcon && <RankIcon className={`h-3.5 w-3.5 ${getRankColor(rank)}`} />}
                        <span>{getRankLabel(rank)}</span>
                        {existingPick && <Check className="h-3 w-3 text-green-600 ml-1" />}
                      </button>
                    )
                  })}
                </div>
                {activeRank && (
                  <p className="text-xs text-blue-600 mt-2">
                    Now click a date on the calendar to set your "{getRankLabel(activeRank)}" pick
                  </p>
                )}
              </div>
            )}

            {/* Calendar Grid */}
            <div className="space-y-4 max-h-[320px] overflow-y-auto">
              {calendarMonths.map((monthData) => (
                <div key={`${monthData.year}-${monthData.month}`} className="space-y-1">
                  <h4 className="text-xs font-semibold text-gray-700 px-1 sticky top-0 bg-white">
                    {monthData.monthName}
                  </h4>
                  <div className="grid grid-cols-7 gap-0.5">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                      <div key={day} className="text-center text-[10px] font-medium text-gray-500 py-0.5">
                        {day.slice(0, 1)}
                      </div>
                    ))}
                    {monthData.days.map((day, idx) => {
                      if (!day) {
                        return <div key={`empty-${idx}`} className="h-9" />
                      }

                      // Determine background color
                      let bgColor
                      if (!day.isInBounds) {
                        bgColor = 'bg-transparent'
                      } else if (!day.isValidStart) {
                        bgColor = 'bg-gray-50'
                      } else {
                        const intensity = day.score > 0 ? Math.min(day.score / expectedMaxScore, 1) : 0
                        bgColor = intensity > 0.7 ? 'bg-green-600' : intensity > 0.4 ? 'bg-green-400' : intensity > 0 ? 'bg-green-200' : 'bg-gray-100'
                      }

                      const userPick = datePicks.find(p => p.startDateISO === day.dateISO)
                      const isInPreviewWindow = previewWindowDates.has(day.dateISO)

                      let isInSelectedWindow = false
                      for (const [, windowDates] of selectedWindowDates.entries()) {
                        if (windowDates.has(day.dateISO)) {
                          isInSelectedWindow = true
                          break
                        }
                      }

                      const isValidForPreview = day.isValidStart && activeRank && canParticipate
                      const isDisabled = !day.isInBounds || !day.isValidStart || !canParticipate

                      // Show icon on hover for entire preview block
                      const isHoveredStartDate = hoveredStartDate === day.dateISO && activeRank
                      const isInHoveredBlock = isInPreviewWindow && activeRank
                      const HoverIcon = activeRank ? getRankIcon(activeRank) : null
                      const UserPickIcon = userPick ? getRankIcon(userPick.rank) : null

                      return (
                        <button
                          key={day.dateISO}
                          onClick={() => isValidForPreview && handleDateSelect(day.dateISO)}
                          onMouseEnter={() => isValidForPreview && setHoveredStartDate(day.dateISO)}
                          onMouseLeave={() => setHoveredStartDate(null)}
                          disabled={isDisabled}
                          className={`h-9 w-full rounded text-[11px] font-medium border transition-all relative flex items-center justify-center ${
                            day.isValidStart && day.isInBounds && canParticipate
                              ? 'cursor-pointer hover:ring-2 hover:ring-blue-300'
                              : 'cursor-not-allowed opacity-40'
                          } ${
                            isInPreviewWindow
                              ? 'ring-2 ring-yellow-400 ring-offset-0 shadow-md z-10'
                              : isInSelectedWindow
                              ? 'ring-2 ring-blue-300 ring-offset-0'
                              : userPick
                              ? 'ring-2 ring-blue-500 ring-offset-0'
                              : ''
                          } ${bgColor} ${bgColor.startsWith('bg-green') ? 'text-white' : 'text-gray-600'}`}
                          title={
                            !day.isInBounds
                              ? 'Outside date range'
                              : !day.isValidStart
                              ? 'Invalid start date'
                              : isHoveredStartDate && activeRank
                              ? `Click to set as "${getRankLabel(activeRank)}"`
                              : day.score > 0
                              ? 'Preferred by group'
                              : ''
                          }
                        >
                          {/* Show hover icon on entire preview block when selecting */}
                          {isInHoveredBlock && HoverIcon ? (
                            <HoverIcon className={`h-4 w-4 ${getRankColor(activeRank!)}`} />
                          ) : (
                            day.date.getDate()
                          )}
                          {/* Show user pick icon */}
                          {userPick && UserPickIcon && !isHoveredStartDate && (
                            <div className="absolute top-0 right-0">
                              <UserPickIcon className={`h-3 w-3 ${getRankColor(userPick.rank)}`} />
                            </div>
                          )}
                          {isInPreviewWindow && (
                            <div className="absolute inset-0 bg-yellow-200 bg-opacity-30 rounded pointer-events-none" />
                          )}
                          {isInSelectedWindow && !isInPreviewWindow && (
                            <div className="absolute inset-0 bg-blue-200 bg-opacity-20 rounded pointer-events-none" />
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Legend */}
            <div className="mt-3 flex items-center gap-4 text-xs text-gray-500 flex-wrap">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-gray-100 border rounded" />
                <span>No preference</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-green-200 rounded" />
                <span>Low</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-green-400 rounded" />
                <span>Medium</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-green-600 rounded" />
                <span>High</span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button
              onClick={savePicks}
              disabled={!canParticipate || savingPicks || datePicks.length === 0}
              className="flex-1"
            >
              {!canParticipate
                ? 'You have left this trip'
                : savingPicks
                ? 'Saving...'
                : 'Save Picks'}
            </Button>
            {datePicks.length > 0 && canParticipate && (
              <Button
                variant="outline"
                onClick={() => {
                  setDatePicks([])
                  setActiveRank(1)
                }}
                disabled={savingPicks}
                title="Clear all picks and start over"
              >
                <X className="h-4 w-4 mr-1" />
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Best Date Options (if available) */}
      {trip.topCandidates && trip.topCandidates.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Best Date Options</CardTitle>
            <CardDescription>
              Most preferred dates based on everyone's picks
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {trip.topCandidates.slice(0, 3).map((candidate: any, idx: number) => (
                <div key={candidate.startDateISO} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <Badge variant="secondary">#{idx + 1}</Badge>
                      <span className="font-medium">
                        {formatDateRange(candidate.startDateISO)}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600">
                      {candidate.loveCount} love, {candidate.canCount} can, {candidate.mightCount} might
                    </div>
                  </div>
                  {isCreator && canParticipate && (
                    <Button
                      size="sm"
                      onClick={() => lockDates(candidate.startDateISO)}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      <Lock className="h-4 w-4 mr-1" />
                      Lock
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lock Confirmation Dialog */}
      <AlertDialog open={showLockConfirmation} onOpenChange={setShowLockConfirmation}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Lock dates for everyone?</AlertDialogTitle>
            <AlertDialogDescription>
              This finalizes the trip dates. Once locked, dates cannot be changed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setShowLockConfirmation(false)
              setPendingLockDate(null)
            }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmLockDates}
              disabled={locking}
              className="bg-green-600 hover:bg-green-700"
            >
              {locking ? 'Locking...' : 'Confirm'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default SchedulingOverlay
