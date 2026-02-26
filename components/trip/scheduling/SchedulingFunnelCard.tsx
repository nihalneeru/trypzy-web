'use client'

import { useState, useMemo } from 'react'
import {
  Calendar as CalendarIcon,
  Check,
  X,
  Lock,
  CheckCircle2,
  MessageSquare,
  ThumbsUp,
  ThumbsDown,
  HelpCircle,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Loader2
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
  getSchedulingFunnelState,
  SchedulingFunnelState,
  type SchedulingFunnelStateType,
  type WindowProposal,
  type WindowPreference,
  type DateReaction
} from '@/lib/trips/schedulingFunnelState'

interface SchedulingFunnelCardProps {
  trip: any
  token: string
  user: any
  memberCount: number
  onRefresh: (updatedTrip?: any) => void
  onClose: () => void
  setHasUnsavedChanges: (has: boolean) => void
}

/**
 * SchedulingFunnelCard - Handles the collaborative scheduling funnel
 *
 * States:
 * - NO_DATES: Show window proposal form
 * - WINDOWS_OPEN: List windows with preference controls + leader compress
 * - DATE_PROPOSED: Show proposed dates with reaction buttons
 * - READY_TO_LOCK: Leader can lock; others see "waiting"
 * - DATES_LOCKED/HOSTED_LOCKED: Show locked dates
 */
export function SchedulingFunnelCard({
  trip,
  token,
  user,
  memberCount,
  onRefresh,
  onClose,
  setHasUnsavedChanges
}: SchedulingFunnelCardProps) {
  // Form states
  const [showWindowForm, setShowWindowForm] = useState(false)
  const [windowDescription, setWindowDescription] = useState('')
  const [submittingWindow, setSubmittingWindow] = useState(false)

  const [showDateProposalForm, setShowDateProposalForm] = useState(false)
  const [proposalStartDate, setProposalStartDate] = useState('')
  const [proposalEndDate, setProposalEndDate] = useState('')
  const [submittingProposal, setSubmittingProposal] = useState(false)

  const [submittingPreference, setSubmittingPreference] = useState<string | null>(null)
  const [submittingReaction, setSubmittingReaction] = useState(false)
  const [locking, setLocking] = useState(false)
  const [showLockConfirmation, setShowLockConfirmation] = useState(false)

  const [windowsExpanded, setWindowsExpanded] = useState(true)

  const isCreator = trip.createdBy === user?.id
  const canParticipate = trip?.viewer?.isActiveParticipant !== false

  // Compute funnel state
  const funnelState = useMemo(() => {
    return getSchedulingFunnelState(trip, memberCount)
  }, [trip, memberCount])

  // Get active windows (non-archived)
  const activeWindows: WindowProposal[] = useMemo(() => {
    return (trip.windowProposals || []).filter((w: WindowProposal) => !w.archived)
  }, [trip.windowProposals])

  // Get user's preferences for windows
  const getUserPreference = (windowId: string): WindowPreference | undefined => {
    return (trip.windowPreferences || []).find(
      (p: WindowPreference) => p.userId === user?.id && p.windowId === windowId
    )
  }

  // Aggregate preferences for a window
  const getWindowStats = (windowId: string) => {
    const prefs = (trip.windowPreferences || []).filter((p: WindowPreference) => p.windowId === windowId)
    return {
      works: prefs.filter((p: WindowPreference) => p.preference === 'WORKS').length,
      maybe: prefs.filter((p: WindowPreference) => p.preference === 'MAYBE').length,
      no: prefs.filter((p: WindowPreference) => p.preference === 'NO').length
    }
  }

  // Get user's reaction to date proposal
  const userReaction: DateReaction | undefined = useMemo(() => {
    return (trip.dateReactions || []).find((r: DateReaction) => r.userId === user?.id)
  }, [trip.dateReactions, user?.id])

  // Compute approval stats
  const approvalStats = useMemo(() => {
    const reactions = trip.dateReactions || []
    const approvals = reactions.filter((r: DateReaction) => r.reactionType === 'WORKS').length
    const caveats = reactions.filter((r: DateReaction) => r.reactionType === 'CAVEAT').length
    const cant = reactions.filter((r: DateReaction) => r.reactionType === 'CANT').length
    const required = Math.ceil(memberCount / 2)
    return { approvals, caveats, cant, required, total: reactions.length }
  }, [trip.dateReactions, memberCount])

  // Format date for display
  const formatDate = (dateStr: string) => {
    if (!dateStr) return ''
    const date = new Date(dateStr + 'T12:00:00')
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const formatDateRange = (start: string, end: string) => {
    if (!start || !end) return ''
    const startDate = new Date(start + 'T12:00:00')
    const endDate = new Date(end + 'T12:00:00')
    return `${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
  }

  // API: Propose a window
  const submitWindowProposal = async () => {
    if (!windowDescription.trim()) {
      toast.error('Please enter a description')
      return
    }

    setSubmittingWindow(true)
    try {
      const response = await fetch(`/api/trips/${trip.id}/windows/propose`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ description: windowDescription.trim() })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Couldn't propose window — try again")
      }

      const updatedTrip = await response.json()
      toast.success('Time window suggested!')
      setWindowDescription('')
      setShowWindowForm(false)
      setHasUnsavedChanges(false)
      onRefresh(updatedTrip)
    } catch (error: any) {
      toast.error(error.message || "Couldn't suggest window — try again")
    } finally {
      setSubmittingWindow(false)
    }
  }

  // API: Set window preference
  const submitWindowPreference = async (windowId: string, preference: 'WORKS' | 'MAYBE' | 'NO') => {
    setSubmittingPreference(windowId)
    try {
      const response = await fetch(`/api/trips/${trip.id}/windows/preference`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ windowId, preference })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Couldn't save preference — try again")
      }

      const updatedTrip = await response.json()
      onRefresh(updatedTrip)
    } catch (error: any) {
      toast.error(error.message || "Couldn't save preference — try again")
    } finally {
      setSubmittingPreference(null)
    }
  }

  // API: Propose concrete dates (leader only)
  const submitDateProposal = async () => {
    if (!proposalStartDate || !proposalEndDate) {
      toast.error('Please select both start and end dates')
      return
    }

    if (proposalStartDate > proposalEndDate) {
      toast.error('Start date must be before end date')
      return
    }

    setSubmittingProposal(true)
    try {
      const response = await fetch(`/api/trips/${trip.id}/dates/propose`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          startDate: proposalStartDate,
          endDate: proposalEndDate
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Couldn't propose dates — try again")
      }

      const updatedTrip = await response.json()
      toast.success('Dates proposed!')
      setProposalStartDate('')
      setProposalEndDate('')
      setShowDateProposalForm(false)
      setHasUnsavedChanges(false)
      onRefresh(updatedTrip)
    } catch (error: any) {
      toast.error(error.message || "Couldn't propose dates — try again")
    } finally {
      setSubmittingProposal(false)
    }
  }

  // API: React to date proposal
  const submitDateReaction = async (reactionType: 'WORKS' | 'CAVEAT' | 'CANT') => {
    setSubmittingReaction(true)
    try {
      const response = await fetch(`/api/trips/${trip.id}/dates/react`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ reactionType })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Couldn't submit reaction — try again")
      }

      const updatedTrip = await response.json()
      toast.success('Reaction saved!')
      onRefresh(updatedTrip)
    } catch (error: any) {
      toast.error(error.message || "Couldn't submit reaction — try again")
    } finally {
      setSubmittingReaction(false)
    }
  }

  // API: Lock dates
  const lockDates = async () => {
    setLocking(true)
    try {
      const response = await fetch(`/api/trips/${trip.id}/lock`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({})  // Funnel mode locks from dateProposal
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Couldn't confirm dates — try again")
      }

      const updatedTrip = await response.json()
      toast.success('Dates locked!')
      setShowLockConfirmation(false)
      onRefresh(updatedTrip)
    } catch (error: any) {
      toast.error(error.message || "Couldn't confirm dates — try again")
      setShowLockConfirmation(false)
    } finally {
      setLocking(false)
    }
  }

  // Render: HOSTED_LOCKED or DATES_LOCKED
  if (funnelState === SchedulingFunnelState.HOSTED_LOCKED || funnelState === SchedulingFunnelState.DATES_LOCKED) {
    return (
      <div className="space-y-4">
        <Card className="bg-green-50 border-green-200">
          <CardContent className="py-8 text-center">
            <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-brand-carbon mb-2">Dates Locked</h3>
            <p className="text-brand-carbon/70 mb-4">
              {funnelState === SchedulingFunnelState.HOSTED_LOCKED
                ? 'This is a hosted trip with fixed dates.'
                : 'Trip dates have been finalized.'}
            </p>
            <div className="text-3xl font-bold text-green-800 mb-4">
              {formatDateRange(trip.lockedStartDate, trip.lockedEndDate)}
            </div>
            <p className="text-sm text-green-700">
              Time to start planning the details!
            </p>
          </CardContent>
        </Card>
        <Button variant="outline" onClick={onClose} className="w-full">
          Close
        </Button>
      </div>
    )
  }

  // Render: READY_TO_LOCK
  if (funnelState === SchedulingFunnelState.READY_TO_LOCK) {
    return (
      <div className="space-y-4">
        <Card className="bg-green-50 border-green-200">
          <CardContent className="py-6">
            <div className="text-center mb-4">
              <CheckCircle2 className="h-10 w-10 text-green-600 mx-auto mb-3" />
              <h3 className="text-lg font-semibold text-brand-carbon">Ready to Lock!</h3>
              <p className="text-brand-carbon/70">
                {approvalStats.approvals} of {memberCount} members approved ({approvalStats.required} needed)
              </p>
            </div>

            <div className="text-2xl font-bold text-center text-green-800 mb-4">
              {formatDateRange(trip.dateProposal?.startDate, trip.dateProposal?.endDate)}
            </div>

            {isCreator ? (
              <Button
                onClick={() => setShowLockConfirmation(true)}
                className="w-full bg-green-600 hover:bg-green-700"
              >
                <Lock className="h-4 w-4 mr-2" />
                Lock Dates
              </Button>
            ) : (
              <div className="text-center text-brand-carbon/70 text-sm">
                Waiting for the trip leader to confirm dates...
              </div>
            )}
          </CardContent>
        </Card>

        {/* Lock Confirmation Dialog */}
        <AlertDialog open={showLockConfirmation} onOpenChange={setShowLockConfirmation}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm dates for everyone?</AlertDialogTitle>
              <AlertDialogDescription>
                This finalizes the trip dates. Once confirmed, dates cannot be changed.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={lockDates}
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

  // Render: DATE_PROPOSED
  if (funnelState === SchedulingFunnelState.DATE_PROPOSED) {
    return (
      <div className="space-y-4">
        <Card className="border-brand-blue/20 bg-brand-blue/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-brand-blue">
              <CalendarIcon className="h-5 w-5" />
              Proposed Dates
            </CardTitle>
            <CardDescription>
              React to let the organizer know if these dates work for you.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-center text-brand-blue mb-4">
              {formatDateRange(trip.dateProposal?.startDate, trip.dateProposal?.endDate)}
            </div>

            {/* Approval progress */}
            <div className="flex items-center justify-center gap-4 mb-4 text-sm">
              <span className="text-green-600 font-medium">
                <ThumbsUp className="h-4 w-4 inline mr-1" />
                {approvalStats.approvals} Works
              </span>
              <span className="text-yellow-600 font-medium">
                <HelpCircle className="h-4 w-4 inline mr-1" />
                {approvalStats.caveats} Caveat
              </span>
              <span className="text-brand-red font-medium">
                <ThumbsDown className="h-4 w-4 inline mr-1" />
                {approvalStats.cant} Can't
              </span>
            </div>

            <div className="text-center text-xs text-brand-carbon/60 mb-4">
              {approvalStats.required - approvalStats.approvals > 0
                ? `Need ${approvalStats.required - approvalStats.approvals} more approval(s) to lock`
                : 'Ready to lock!'}
            </div>

            {/* Reaction buttons */}
            {canParticipate && (
              <div className="flex gap-2 justify-center mb-4">
                {(['WORKS', 'CAVEAT', 'CANT'] as const).map((reaction) => {
                  const isSelected = userReaction?.reactionType === reaction
                  const colors = {
                    WORKS: isSelected ? 'bg-green-600 text-white' : 'border-green-600 text-green-600 hover:bg-green-50',
                    CAVEAT: isSelected ? 'bg-yellow-600 text-white' : 'border-yellow-600 text-yellow-600 hover:bg-yellow-50',
                    CANT: isSelected ? 'bg-brand-red text-white' : 'border-brand-red text-brand-red hover:bg-brand-red/5'
                  }
                  const labels = { WORKS: 'Works!', CAVEAT: 'Caveat', CANT: "Can't" }
                  const icons = {
                    WORKS: <ThumbsUp className="h-4 w-4 mr-1" />,
                    CAVEAT: <HelpCircle className="h-4 w-4 mr-1" />,
                    CANT: <ThumbsDown className="h-4 w-4 mr-1" />
                  }

                  return (
                    <Button
                      key={reaction}
                      variant={isSelected ? 'default' : 'outline'}
                      className={colors[reaction]}
                      onClick={() => submitDateReaction(reaction)}
                      disabled={submittingReaction}
                    >
                      {submittingReaction ? (
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      ) : (
                        icons[reaction]
                      )}
                      {labels[reaction]}
                    </Button>
                  )
                })}
              </div>
            )}

            {/* Leader can propose new dates */}
            {isCreator && (
              <div className="border-t pt-4 mt-4">
                <Button
                  variant="outline"
                  onClick={() => setShowDateProposalForm(true)}
                  className="w-full"
                >
                  Propose Different Dates
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Collapsed windows list (read-only) */}
        {activeWindows.length > 0 && (
          <Card className="bg-brand-sand/30">
            <CardHeader
              className="cursor-pointer py-3"
              onClick={() => setWindowsExpanded(!windowsExpanded)}
            >
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm text-brand-carbon/70">
                  Window Proposals ({activeWindows.length})
                </CardTitle>
                {windowsExpanded ? (
                  <ChevronUp className="h-4 w-4 text-brand-carbon/40" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-brand-carbon/40" />
                )}
              </div>
            </CardHeader>
            {windowsExpanded && (
              <CardContent className="pt-0">
                <div className="space-y-2">
                  {activeWindows.map((window) => (
                    <div key={window.id} className="flex items-center justify-between text-sm p-2 bg-white rounded border">
                      <span className="text-brand-carbon/80">{window.description}</span>
                      <span className="text-xs text-brand-carbon/60">by {window.userName}</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-brand-carbon/60 mt-2">
                  Windows are frozen while a date proposal is active.
                </p>
              </CardContent>
            )}
          </Card>
        )}

        {/* Date proposal form (for leader) */}
        {showDateProposalForm && (
          <Card>
            <CardHeader>
              <CardTitle>Propose New Dates</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <Label>Start Date</Label>
                  <Input
                    type="date"
                    value={proposalStartDate}
                    onChange={(e) => setProposalStartDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                  />
                </div>
                <div>
                  <Label>End Date</Label>
                  <Input
                    type="date"
                    value={proposalEndDate}
                    onChange={(e) => setProposalEndDate(e.target.value)}
                    min={proposalStartDate || new Date().toISOString().split('T')[0]}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={submitDateProposal} disabled={submittingProposal}>
                  {submittingProposal ? 'Proposing...' : 'Propose Dates'}
                </Button>
                <Button variant="outline" onClick={() => setShowDateProposalForm(false)}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    )
  }

  // Render: WINDOWS_OPEN
  if (funnelState === SchedulingFunnelState.WINDOWS_OPEN) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Time Window Proposals
            </CardTitle>
            <CardDescription>
              Share your preferences to help find the best dates.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Window list */}
            <div className="space-y-3 mb-4">
              {activeWindows.map((window) => {
                const stats = getWindowStats(window.id)
                const userPref = getUserPreference(window.id)
                const isSubmitting = submittingPreference === window.id

                return (
                  <div key={window.id} className="p-3 bg-brand-sand/30 rounded-lg border">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="font-medium text-brand-carbon">{window.description}</p>
                        <p className="text-xs text-brand-carbon/60">Suggested by {window.userName}</p>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-green-600">{stats.works} Works</span>
                        <span className="text-yellow-600">{stats.maybe} Maybe</span>
                        <span className="text-brand-red">{stats.no} No</span>
                      </div>
                    </div>

                    {/* Preference buttons */}
                    {canParticipate && (
                      <div className="flex gap-2">
                        {(['WORKS', 'MAYBE', 'NO'] as const).map((pref) => {
                          const isSelected = userPref?.preference === pref
                          const colors = {
                            WORKS: isSelected ? 'bg-green-600 text-white' : 'border-green-300 text-green-700 hover:bg-green-50',
                            MAYBE: isSelected ? 'bg-yellow-600 text-white' : 'border-yellow-300 text-yellow-700 hover:bg-yellow-50',
                            NO: isSelected ? 'bg-brand-red text-white' : 'border-brand-red/30 text-brand-red hover:bg-brand-red/5'
                          }

                          return (
                            <Button
                              key={pref}
                              size="sm"
                              variant={isSelected ? 'default' : 'outline'}
                              className={`flex-1 ${colors[pref]}`}
                              onClick={() => submitWindowPreference(window.id, pref)}
                              disabled={isSubmitting}
                            >
                              {isSubmitting ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                pref === 'WORKS' ? 'Works' : pref === 'MAYBE' ? 'Maybe' : 'No'
                              )}
                            </Button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}

              {activeWindows.length === 0 && (
                <p className="text-brand-carbon/60 text-center py-4">
                  No windows proposed yet. Suggest a time that works for you!
                </p>
              )}
            </div>

            {/* Add window button */}
            {canParticipate && !showWindowForm && (
              <Button
                variant="outline"
                onClick={() => setShowWindowForm(true)}
                className="w-full"
              >
                <MessageSquare className="h-4 w-4 mr-2" />
                Suggest a Time Window
              </Button>
            )}

            {/* Window form */}
            {showWindowForm && (
              <div className="border-t pt-4 mt-4 space-y-3">
                <div>
                  <Label>Describe your availability</Label>
                  <Textarea
                    value={windowDescription}
                    onChange={(e) => {
                      setWindowDescription(e.target.value)
                      setHasUnsavedChanges(e.target.value.length > 0)
                    }}
                    placeholder="e.g., 'First week of March', 'Any weekend in April', 'March 15-20'"
                    rows={2}
                  />
                </div>
                <div className="flex gap-2">
                  <Button onClick={submitWindowProposal} disabled={submittingWindow}>
                    {submittingWindow ? 'Submitting...' : 'Submit'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowWindowForm(false)
                      setWindowDescription('')
                      setHasUnsavedChanges(false)
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {/* Leader: Propose dates */}
            {isCreator && activeWindows.length > 0 && (
              <div className="border-t pt-4 mt-4">
                <p className="text-sm text-brand-carbon/70 mb-3">
                  As the organizer, you can propose concrete dates based on group preferences.
                </p>
                {!showDateProposalForm ? (
                  <Button onClick={() => setShowDateProposalForm(true)} className="w-full">
                    <CalendarIcon className="h-4 w-4 mr-2" />
                    Propose Concrete Dates
                  </Button>
                ) : (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Start Date</Label>
                        <Input
                          type="date"
                          value={proposalStartDate}
                          onChange={(e) => setProposalStartDate(e.target.value)}
                          min={new Date().toISOString().split('T')[0]}
                        />
                      </div>
                      <div>
                        <Label>End Date</Label>
                        <Input
                          type="date"
                          value={proposalEndDate}
                          onChange={(e) => setProposalEndDate(e.target.value)}
                          min={proposalStartDate || new Date().toISOString().split('T')[0]}
                        />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={submitDateProposal} disabled={submittingProposal}>
                        {submittingProposal ? 'Proposing...' : 'Propose Dates'}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setShowDateProposalForm(false)
                          setProposalStartDate('')
                          setProposalEndDate('')
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  // Render: NO_DATES
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5" />
            When should we go?
          </CardTitle>
          <CardDescription>
            Start by suggesting time windows that work for you. The group will find the best dates together.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!showWindowForm ? (
            <Button
              onClick={() => setShowWindowForm(true)}
              className="w-full"
              disabled={!canParticipate}
            >
              <MessageSquare className="h-4 w-4 mr-2" />
              Suggest a Time Window
            </Button>
          ) : (
            <div className="space-y-3">
              <div>
                <Label>Describe your availability</Label>
                <Textarea
                  value={windowDescription}
                  onChange={(e) => {
                    setWindowDescription(e.target.value)
                    setHasUnsavedChanges(e.target.value.length > 0)
                  }}
                  placeholder="e.g., 'First week of March', 'Any weekend in April', 'March 15-20'"
                  rows={2}
                />
                <p className="text-xs text-brand-carbon/60 mt-1">
                  Use natural language to describe when you're available.
                </p>
              </div>
              <div className="flex gap-2">
                <Button onClick={submitWindowProposal} disabled={submittingWindow}>
                  {submittingWindow ? 'Submitting...' : 'Submit'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowWindowForm(false)
                    setWindowDescription('')
                    setHasUnsavedChanges(false)
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {!canParticipate && (
            <p className="text-sm text-orange-600 mt-2">
              You have left this trip and cannot suggest windows.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Tip for leader */}
      {isCreator && (
        <Card className="bg-brand-sand/30">
          <CardContent className="py-4">
            <p className="text-sm text-brand-carbon/70">
              <strong>Tip:</strong> Once enough windows are suggested, you can propose concrete dates
              for the group to approve.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export default SchedulingFunnelCard
