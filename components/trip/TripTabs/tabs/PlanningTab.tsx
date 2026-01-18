'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { 
  CheckCircle2, Calendar as CalendarIcon, Check, X, HelpCircle, Vote, Lock, Lightbulb 
} from 'lucide-react'
import { Top3HeatmapScheduling } from '@/app/HomeClient'
import { toast } from 'sonner'

// Helper function for getting initials (copied from app/page.js)
function getInitials(name: string) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function PlanningTab({
  trip,
  token,
  user,
  onRefresh,
  setActiveTab,
  // Planning-specific state
  availability,
  setAvailability,
  broadAvailability,
  setBroadAvailability,
  weeklyAvailability,
  setWeeklyAvailability,
  refinementAvailability,
  setRefinementAvailability,
  activityIdeas,
  setActivityIdeas,
  saving,
  selectedVote,
  setSelectedVote,
  datePicks,
  setDatePicks,
  savingPicks,
  setSavingPicks,
  dates,
  dateRangeLength,
  useBroadMode,
  useWeeklyMode,
  weeklyBlocks,
  promisingWindows,
  hasPromisingWindows,
  refinementDates,
  // Helper functions
  getDateRangeStrings,
  setDayAvailability,
  setRefinementDayAvailability,
  setWindowBulkAvailability,
  hasAnyAvailability,
  hasAnyRefinementAvailability,
  hasRespondedBroadly,
  hasSubmittedAnyAvailability,
  isSchedulingOpenForMe,
  saveAvailability,
  submitVote,
  lockTrip,
  onOpenLockConfirm,
  openVoting,
  promoteRefinement,
  votersByOption,
  voteCounts
}: any) {
  // Check if user can participate (hasn't left the trip)
  const canParticipate = trip?.viewer?.isActiveParticipant === true
  
  // Show completed summary if dates are locked
  if (trip.status === 'locked') {
    return (
      <Card className="mb-6">
        <CardContent className="py-8 text-center">
          <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Dates Locked</h3>
          <p className="text-gray-600 mb-4">
            Trip dates have been finalized: {trip.lockedStartDate} to {trip.lockedEndDate}
          </p>
          <Button onClick={() => {
            setActiveTab('itinerary')
            trip._initialTab = 'itinerary'
          }}>
            Continue to Itinerary →
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      {/* Left Trip Banner */}
      {!canParticipate && trip?.viewer?.participantStatus === 'left' && (
        <Card className="mb-6 border-orange-200 bg-orange-50">
          <CardContent className="py-4">
            <p className="text-sm text-orange-800">
              <strong>You have left this trip</strong> — planning actions are disabled. You can still view the trip, but cannot participate in scheduling or planning.
            </p>
          </CardContent>
        </Card>
      )}
      
      {/* Collaborative Trip Planning */}
      {trip.type === 'collaborative' && (
        <>
          {/* New top3_heatmap scheduling mode */}
          {trip.schedulingMode === 'top3_heatmap' ? (
            <Top3HeatmapScheduling 
              trip={trip}
              token={token}
              user={user}
              onRefresh={onRefresh}
              datePicks={datePicks}
              onOpenLockConfirm={onOpenLockConfirm}
              setDatePicks={setDatePicks}
              savingPicks={savingPicks}
              setSavingPicks={setSavingPicks}
              canParticipate={canParticipate}
            />
          ) : (
            <>
              {/* Legacy scheduling UI (availability/refinement flow) */}
              {/* Proposed Phase */}
              {trip.status === 'proposed' && (
                <div className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <CalendarIcon className="h-5 w-5" />
                        Mark Your Availability
                      </CardTitle>
                      <CardDescription>
                        Help the group find the best dates. Approximate availability is okay — locking is the only commitment.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <p className="text-sm text-blue-800">
                          <strong>Note:</strong> Approximate is okay — we'll ask for details once dates narrow. If you don't respond, we'll assume you're unavailable.
                        </p>
                      </div>
                      
                      {useBroadMode ? (
                        // Broad Availability Mode
                        useWeeklyMode ? (
                          // Weekly Blocks Mode
                          <div className="space-y-4">
                            <p className="text-sm text-gray-600 mb-4">
                              Select your availability by week. One click covers the entire week.
                            </p>
                            <div className="grid gap-3">
                              {weeklyBlocks.map((block: any) => (
                                <div key={block.key} className="flex items-center gap-4 p-3 border rounded-lg">
                                  <div className="flex-1 min-w-0">
                                    <p className="font-medium text-gray-900">
                                      {block.start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {block.end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                    </p>
                                  </div>
                                  <div className="flex gap-2 flex-wrap">
                                    <Button
                                      size="sm"
                                      variant={weeklyAvailability[block.key] === 'available' ? 'default' : 'outline'}
                                      onClick={() => setWeeklyAvailability({ ...weeklyAvailability, [block.key]: 'available' })}
                                      className={weeklyAvailability[block.key] === 'available' ? 'bg-green-600 hover:bg-green-700' : ''}
                                      disabled={!canParticipate}
                                    >
                                      <Check className="h-4 w-4 mr-1" />
                                      Available
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant={weeklyAvailability[block.key] === 'maybe' ? 'default' : 'outline'}
                                      onClick={() => setWeeklyAvailability({ ...weeklyAvailability, [block.key]: 'maybe' })}
                                      className={weeklyAvailability[block.key] === 'maybe' ? 'bg-yellow-500 hover:bg-yellow-600' : ''}
                                      disabled={!canParticipate}
                                    >
                                      <HelpCircle className="h-4 w-4 mr-1" />
                                      Maybe
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant={weeklyAvailability[block.key] === 'unavailable' ? 'default' : 'outline'}
                                      onClick={() => setWeeklyAvailability({ ...weeklyAvailability, [block.key]: 'unavailable' })}
                                      className={weeklyAvailability[block.key] === 'unavailable' ? 'bg-red-600 hover:bg-red-700' : ''}
                                      disabled={!canParticipate}
                                    >
                                      <X className="h-4 w-4 mr-1" />
                                      Unavailable
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          // Single Broad Selector Mode
                          <div className="space-y-4">
                            <p className="text-sm text-gray-600 mb-4">
                              Select your availability for the entire date range ({dateRangeLength} days). One click covers all dates.
                            </p>
                            <div className="flex gap-3 justify-center">
                              <Button
                                size="lg"
                                variant={broadAvailability === 'available' ? 'default' : 'outline'}
                                onClick={() => setBroadAvailability('available')}
                                className={broadAvailability === 'available' ? 'bg-green-600 hover:bg-green-700' : ''}
                                disabled={!canParticipate}
                              >
                                <Check className="h-5 w-5 mr-2" />
                                Available
                              </Button>
                              <Button
                                size="lg"
                                variant={broadAvailability === 'maybe' ? 'default' : 'outline'}
                                onClick={() => setBroadAvailability('maybe')}
                                className={broadAvailability === 'maybe' ? 'bg-yellow-500 hover:bg-yellow-600' : ''}
                                disabled={!canParticipate}
                              >
                                <HelpCircle className="h-5 w-5 mr-2" />
                                Maybe
                              </Button>
                              <Button
                                size="lg"
                                variant={broadAvailability === 'unavailable' ? 'default' : 'outline'}
                                onClick={() => setBroadAvailability('unavailable')}
                                className={broadAvailability === 'unavailable' ? 'bg-red-600 hover:bg-red-700' : ''}
                                disabled={!canParticipate}
                              >
                                <X className="h-5 w-5 mr-2" />
                                Unavailable
                              </Button>
                            </div>
                          </div>
                        )
                      ) : (
                        // Per-Day Mode (existing UI)
                        <div className="space-y-2">
                          {dates.map((date: string) => (
                            <div key={date} className="flex items-center gap-4 py-2 border-b last:border-0 flex-wrap">
                              <span className="w-32 font-medium text-gray-900">
                                {new Date(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                              </span>
                              <div className="flex gap-2 flex-wrap">
                                <Button
                                  size="sm"
                                  variant={availability[date] === 'available' ? 'default' : 'outline'}
                                  onClick={() => setDayAvailability(date, 'available')}
                                  className={availability[date] === 'available' ? 'bg-green-600 hover:bg-green-700' : ''}
                                  disabled={!canParticipate}
                                >
                                  <Check className="h-4 w-4 mr-1" />
                                  Available
                                </Button>
                                <Button
                                  size="sm"
                                  variant={availability[date] === 'maybe' ? 'default' : 'outline'}
                                  onClick={() => setDayAvailability(date, 'maybe')}
                                  className={availability[date] === 'maybe' ? 'bg-yellow-500 hover:bg-yellow-600' : ''}
                                  disabled={!canParticipate}
                                >
                                  <HelpCircle className="h-4 w-4 mr-1" />
                                  Maybe
                                </Button>
                                <Button
                                  size="sm"
                                  variant={availability[date] === 'unavailable' ? 'default' : 'outline'}
                                  onClick={() => setDayAvailability(date, 'unavailable')}
                                  className={availability[date] === 'unavailable' ? 'bg-red-600 hover:bg-red-700' : ''}
                                  disabled={!canParticipate}
                                >
                                  <X className="h-4 w-4 mr-1" />
                                  Unavailable
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      
                      <div className="mt-6 flex gap-4 flex-wrap">
                        <Button 
                          onClick={saveAvailability} 
                          disabled={
                            !canParticipate ||
                            saving || 
                            (useBroadMode 
                              ? (useWeeklyMode 
                                  ? Object.keys(weeklyAvailability).length === 0 
                                  : !broadAvailability)
                              : !hasAnyAvailability())
                          }
                        >
                          {saving ? 'Saving...' : 'Save Availability'}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Scheduling Phase */}
              {trip.status === 'scheduling' && (
                <div className="space-y-6">
                  {/* Refinement Mode - ONLY show if current user has responded broadly */}
                  {hasPromisingWindows && isSchedulingOpenForMe() && hasRespondedBroadly && (
                    <Card className={promoteRefinement ? "border-purple-200 bg-purple-50/50" : "border-gray-200 bg-gray-50/50"}>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <CalendarIcon className={`h-5 w-5 ${promoteRefinement ? 'text-purple-600' : 'text-gray-600'}`} />
                          {promoteRefinement ? 'Refine Availability' : 'Suggested Windows'}
                        </CardTitle>
                        <CardDescription>
                          {promoteRefinement 
                            ? `Based on responses so far, we've identified ${promisingWindows.length} promising date window${promisingWindows.length !== 1 ? 's' : ''}. Refining helps us lock dates quickly.`
                            : `Based on responses so far, these ${promisingWindows.length} window${promisingWindows.length !== 1 ? 's' : ''} look promising. You can still mark availability outside these windows.`
                          }
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        {promoteRefinement ? (
                          <div className="mb-4 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                            <p className="text-sm text-purple-800">
                              <strong>Note:</strong> We'll only ask for details once dates narrow. Focus on these promising windows.
                            </p>
                          </div>
                        ) : (
                          <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                            <p className="text-sm text-gray-700">
                              <strong>Note:</strong> These are suggestions based on current responses. You can refine these windows or mark availability for any dates in the trip range.
                            </p>
                          </div>
                        )}

                        <div className="space-y-6">
                          {promisingWindows.map((window: any, windowIdx: number) => {
                            const windowDates = getDateRangeStrings(window.startDate, window.endDate)

                            return (
                              <div key={window.optionKey} className="border rounded-lg p-4 bg-white">
                                <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                                  <div>
                                    <h4 className="font-semibold text-gray-900">
                                      Window {windowIdx + 1}: {window.startDate} to {window.endDate}
                                    </h4>
                                    <p className="text-sm text-gray-500">
                                      Compatibility: {(window.score * 100).toFixed(0)}% • {windowDates.length} day{windowDates.length !== 1 ? 's' : ''}
                                    </p>
                                  </div>
                                  <div className="flex gap-2 flex-wrap">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => setWindowBulkAvailability(window, 'available')}
                                      className="text-green-700 border-green-300 hover:bg-green-50"
                                      disabled={!canParticipate || !isSchedulingOpenForMe()}
                                    >
                                      <Check className="h-4 w-4 mr-1" />
                                      Mark All Available
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => setWindowBulkAvailability(window, 'maybe')}
                                      className="text-yellow-700 border-yellow-300 hover:bg-yellow-50"
                                      disabled={!canParticipate || !isSchedulingOpenForMe()}
                                    >
                                      <HelpCircle className="h-4 w-4 mr-1" />
                                      Mark All Maybe
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => setWindowBulkAvailability(window, 'unavailable')}
                                      className="text-red-700 border-red-300 hover:bg-red-50"
                                      disabled={!canParticipate || !isSchedulingOpenForMe()}
                                    >
                                      <X className="h-4 w-4 mr-1" />
                                      Mark All Unavailable
                                    </Button>
                                  </div>
                                </div>

                                <div className="space-y-2 mt-4 pt-4 border-t">
                                  {windowDates.map((date: string) => (
                                    <div key={date} className="flex items-center gap-4 py-2 border-b last:border-0 flex-wrap">
                                      <span className="w-32 font-medium text-gray-900">
                                        {new Date(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                                      </span>
                                      <div className="flex gap-2 flex-wrap">
                                        <Button
                                          size="sm"
                                          variant={refinementAvailability[date] === 'available' ? 'default' : 'outline'}
                                          onClick={() => setRefinementDayAvailability(date, 'available')}
                                          className={refinementAvailability[date] === 'available' ? 'bg-green-600 hover:bg-green-700' : ''}
                                          disabled={!canParticipate || !isSchedulingOpenForMe()}
                                        >
                                          <Check className="h-4 w-4 mr-1" />
                                          Available
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant={refinementAvailability[date] === 'maybe' ? 'default' : 'outline'}
                                          onClick={() => setRefinementDayAvailability(date, 'maybe')}
                                          className={refinementAvailability[date] === 'maybe' ? 'bg-yellow-500 hover:bg-yellow-600' : ''}
                                          disabled={!canParticipate || !isSchedulingOpenForMe()}
                                        >
                                          <HelpCircle className="h-4 w-4 mr-1" />
                                          Maybe
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant={refinementAvailability[date] === 'unavailable' ? 'default' : 'outline'}
                                          onClick={() => setRefinementDayAvailability(date, 'unavailable')}
                                          className={refinementAvailability[date] === 'unavailable' ? 'bg-red-600 hover:bg-red-700' : ''}
                                          disabled={!canParticipate || !isSchedulingOpenForMe()}
                                        >
                                          <X className="h-4 w-4 mr-1" />
                                          Unavailable
                                        </Button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )
                          })}
                        </div>

                        <div className="mt-6 flex gap-4 flex-wrap">
                          <Button 
                            onClick={saveAvailability} 
                            disabled={!canParticipate || saving || !isSchedulingOpenForMe() || (!hasAnyRefinementAvailability() && !hasAnyAvailability())}
                          >
                            {!canParticipate
                              ? 'You have left this trip'
                              : !isSchedulingOpenForMe()
                              ? 'Availability Frozen'
                              : saving ? 'Saving...' : 'Save Refinement'}
                          </Button>
                        </div>
                        {!isSchedulingOpenForMe() && (
                          <p className="text-xs text-gray-500 mt-2">
                            {trip.status === 'voting' 
                              ? 'Availability is frozen while voting is open.'
                              : 'Dates are locked; scheduling is closed.'}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {/* Informational: Show promising windows as read-only info if user hasn't responded yet */}
                  {hasPromisingWindows && isSchedulingOpenForMe() && !hasRespondedBroadly && (
                    <Card className="border-gray-200 bg-gray-50/50">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <CalendarIcon className="h-5 w-5 text-gray-600" />
                          Suggested Windows (Informational)
                        </CardTitle>
                        <CardDescription>
                          Based on responses so far, these {promisingWindows.length} window{promisingWindows.length !== 1 ? 's' : ''} look promising. Submit your availability above to help refine these suggestions.
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          {promisingWindows.map((window: any, windowIdx: number) => {
                            const windowDates = getDateRangeStrings(window.startDate, window.endDate)
                            return (
                              <div key={window.optionKey} className="border rounded-lg p-3 bg-white">
                                <div>
                                  <h4 className="font-semibold text-gray-900">
                                    Window {windowIdx + 1}: {window.startDate} to {window.endDate}
                                  </h4>
                                  <p className="text-sm text-gray-500">
                                    Compatibility: {(window.score * 100).toFixed(0)}% • {windowDates.length} day{windowDates.length !== 1 ? 's' : ''}
                                  </p>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Voting Phase - Availability Frozen Message */}
                  {trip.status === 'voting' && (
                    <Card className="border-orange-200 bg-orange-50/50">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-orange-800">
                          <Lock className="h-5 w-5" />
                          Availability Frozen
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-orange-800">
                          Availability is frozen while voting is open. You can vote for your preferred dates below.
                        </p>
                      </CardContent>
                    </Card>
                  )}

                  {/* Locked Phase - Scheduling Closed Message */}
                  {trip.status === 'locked' && (
                    <Card className="border-green-200 bg-green-50">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-green-800">
                          <Lock className="h-5 w-5" />
                          Dates Locked
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-green-800">
                          Dates are locked; scheduling is closed. Trip dates: {trip.lockedStartDate} to {trip.lockedEndDate}
                        </p>
                      </CardContent>
                    </Card>
                  )}

                  {/* Standard Availability UI */}
                  {isSchedulingOpenForMe() && !hasSubmittedAnyAvailability && (
                    <Card className={!hasRespondedBroadly ? "" : "border-gray-200"}>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <CalendarIcon className="h-5 w-5" />
                          {hasRespondedBroadly ? 'Update Your Availability' : 'Submit Your Availability'}
                        </CardTitle>
                        <CardDescription>
                          {hasRespondedBroadly 
                            ? "You can update your availability for the entire date range. Changes will help refine the promising windows."
                            : "Mark days you're genuinely open. If you don't respond, we'll assume you're unavailable."
                          }
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        {!hasRespondedBroadly && (
                          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                            <p className="text-sm text-blue-800">
                              <strong>Remember:</strong> Approximate is okay — we'll ask for details once dates narrow. If you don't respond, we'll assume you're unavailable.
                            </p>
                          </div>
                        )}
                      
                        {useBroadMode ? (
                          useWeeklyMode ? (
                            <div className="space-y-4">
                              <p className="text-sm text-gray-600 mb-4">
                                Select your availability by week. One click covers the entire week.
                              </p>
                              <div className="grid gap-3">
                                {weeklyBlocks.map((block: any) => (
                                  <div key={block.key} className="flex items-center gap-4 p-3 border rounded-lg">
                                    <div className="flex-1 min-w-0">
                                      <p className="font-medium text-gray-900">
                                        {block.start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {block.end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                      </p>
                                    </div>
                                    <div className="flex gap-2 flex-wrap">
                                      <Button
                                        size="sm"
                                        variant={weeklyAvailability[block.key] === 'available' ? 'default' : 'outline'}
                                        onClick={() => setWeeklyAvailability({ ...weeklyAvailability, [block.key]: 'available' })}
                                        className={weeklyAvailability[block.key] === 'available' ? 'bg-green-600 hover:bg-green-700' : ''}
                                        disabled={!canParticipate || !isSchedulingOpenForMe()}
                                      >
                                        <Check className="h-4 w-4 mr-1" />
                                        Available
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant={weeklyAvailability[block.key] === 'maybe' ? 'default' : 'outline'}
                                        onClick={() => setWeeklyAvailability({ ...weeklyAvailability, [block.key]: 'maybe' })}
                                        className={weeklyAvailability[block.key] === 'maybe' ? 'bg-yellow-500 hover:bg-yellow-600' : ''}
                                        disabled={!canParticipate || !isSchedulingOpenForMe()}
                                      >
                                        <HelpCircle className="h-4 w-4 mr-1" />
                                        Maybe
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant={weeklyAvailability[block.key] === 'unavailable' ? 'default' : 'outline'}
                                        onClick={() => setWeeklyAvailability({ ...weeklyAvailability, [block.key]: 'unavailable' })}
                                        className={weeklyAvailability[block.key] === 'unavailable' ? 'bg-red-600 hover:bg-red-700' : ''}
                                        disabled={!canParticipate || !isSchedulingOpenForMe()}
                                      >
                                        <X className="h-4 w-4 mr-1" />
                                        Unavailable
                                      </Button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-4">
                              <p className="text-sm text-gray-600 mb-4">
                                Select your availability for the entire date range ({dateRangeLength} days). One click covers all dates.
                              </p>
                              <div className="flex gap-3 justify-center">
                                <Button
                                  size="lg"
                                  variant={broadAvailability === 'available' ? 'default' : 'outline'}
                                  onClick={() => setBroadAvailability('available')}
                                  className={broadAvailability === 'available' ? 'bg-green-600 hover:bg-green-700' : ''}
                                  disabled={!canParticipate || !isSchedulingOpenForMe()}
                                >
                                  <Check className="h-5 w-5 mr-2" />
                                  Available
                                </Button>
                                <Button
                                  size="lg"
                                  variant={broadAvailability === 'maybe' ? 'default' : 'outline'}
                                  onClick={() => setBroadAvailability('maybe')}
                                  className={broadAvailability === 'maybe' ? 'bg-yellow-500 hover:bg-yellow-600' : ''}
                                  disabled={!canParticipate || !isSchedulingOpenForMe()}
                                >
                                  <HelpCircle className="h-5 w-5 mr-2" />
                                  Maybe
                                </Button>
                                <Button
                                  size="lg"
                                  variant={broadAvailability === 'unavailable' ? 'default' : 'outline'}
                                  onClick={() => setBroadAvailability('unavailable')}
                                  className={broadAvailability === 'unavailable' ? 'bg-red-600 hover:bg-red-700' : ''}
                                  disabled={!canParticipate || !isSchedulingOpenForMe()}
                                >
                                  <X className="h-5 w-5 mr-2" />
                                  Unavailable
                                </Button>
                              </div>
                            </div>
                          )
                        ) : (
                          <div className="space-y-2">
                            {dates.map((date: string) => (
                              <div key={date} className="flex items-center gap-4 py-2 border-b last:border-0 flex-wrap">
                                <span className="w-32 font-medium text-gray-900">
                                  {new Date(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                                </span>
                                <div className="flex gap-2 flex-wrap">
                                  <Button
                                    size="sm"
                                    variant={availability[date] === 'available' ? 'default' : 'outline'}
                                    onClick={() => setDayAvailability(date, 'available')}
                                    className={availability[date] === 'available' ? 'bg-green-600 hover:bg-green-700' : ''}
                                    disabled={!canParticipate || !isSchedulingOpenForMe()}
                                  >
                                    <Check className="h-4 w-4 mr-1" />
                                    Available
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant={availability[date] === 'maybe' ? 'default' : 'outline'}
                                    onClick={() => setDayAvailability(date, 'maybe')}
                                    className={availability[date] === 'maybe' ? 'bg-yellow-500 hover:bg-yellow-600' : ''}
                                    disabled={!canParticipate || !isSchedulingOpenForMe()}
                                  >
                                    <HelpCircle className="h-4 w-4 mr-1" />
                                    Maybe
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant={availability[date] === 'unavailable' ? 'default' : 'outline'}
                                    onClick={() => setDayAvailability(date, 'unavailable')}
                                    className={availability[date] === 'unavailable' ? 'bg-red-600 hover:bg-red-700' : ''}
                                    disabled={!canParticipate || !isSchedulingOpenForMe()}
                                  >
                                    <X className="h-4 w-4 mr-1" />
                                    Unavailable
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      
                        {/* Optional Activity Ideas (Idea Jar) */}
                        <div className="mt-6 pt-6 border-t">
                          <div className="flex items-center gap-2 mb-3">
                            <Lightbulb className="h-5 w-5 text-yellow-500" />
                            <span className="font-medium text-sm">Any activity ideas? (optional)</span>
                          </div>
                          <p className="text-xs text-gray-500 mb-3">Suggest up to 3 activities you'd like to do on this trip</p>
                          <div className="grid gap-2">
                            {activityIdeas.map((idea: string, idx: number) => (
                              <Input
                                key={idx}
                                value={idea}
                                onChange={(e) => {
                                  const newIdeas = [...activityIdeas]
                                  newIdeas[idx] = e.target.value
                                  setActivityIdeas(newIdeas)
                                }}
                                placeholder={`Activity idea ${idx + 1}...`}
                                className="text-sm"
                              />
                            ))}
                          </div>
                        </div>
                      
                        <div className="mt-6 flex gap-4 flex-wrap">
                          <Button 
                            onClick={saveAvailability} 
                            disabled={
                              !canParticipate ||
                              saving || 
                              trip.status === 'voting' || 
                              trip.status === 'locked' ||
                              (useBroadMode 
                                ? (useWeeklyMode 
                                    ? Object.keys(weeklyAvailability).length === 0 
                                    : !broadAvailability)
                                : !hasAnyAvailability())
                            }
                          >
                            {!canParticipate
                              ? 'You have left this trip'
                              : !isSchedulingOpenForMe()
                              ? 'Availability Frozen' 
                              : saving ? 'Saving...' : 'Save Availability'}
                          </Button>
                          {trip.isCreator && trip.status === 'scheduling' && canParticipate && (
                            <Button variant="outline" onClick={openVoting}>
                              <Vote className="h-4 w-4 mr-2" />
                              Open Voting
                            </Button>
                          )}
                        </div>
                        {!isSchedulingOpenForMe() && (
                          <p className="text-xs text-gray-500 mt-2">
                            {trip.status === 'voting' 
                              ? 'Availability is frozen while voting is open.'
                              : 'Dates are locked; scheduling is closed.'}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {/* Consensus Preview - Only show when not in refinement mode */}
                  {!hasPromisingWindows && trip.consensusOptions?.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle>Top Date Options (Preview)</CardTitle>
                        <CardDescription>
                          Based on {trip.availabilities?.length || 0} availability submissions
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {trip.consensusOptions.map((option: any, idx: number) => (
                            <div key={option.optionKey} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                              <div className="flex items-center gap-3">
                                <span className="text-lg font-bold text-gray-400">#{idx + 1}</span>
                                <div>
                                  <p className="font-medium">{option.startDate} to {option.endDate}</p>
                                  <p className="text-sm text-gray-500">Score: {(option.score * 100).toFixed(0)}%</p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}

              {/* Voting Phase */}
              {trip.status === 'voting' && (
                <div className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Vote className="h-5 w-5" />
                        Vote for Your Preferred Dates
                      </CardTitle>
                      <CardDescription>
                        Voting is preference — we'll move forward even if everyone doesn't vote.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <RadioGroup value={selectedVote} onValueChange={setSelectedVote}>
                        <div className="space-y-3">
                          {trip.consensusOptions?.map((option: any, idx: number) => {
                            const voters = votersByOption[option.optionKey] || []
                            const voteCount = voteCounts[option.optionKey] || 0
                            const displayVoters = voters.slice(0, 6)
                            const remainingCount = voters.length - displayVoters.length
                            
                            return (
                              <div key={option.optionKey} className="flex items-start space-x-3">
                                <RadioGroupItem value={option.optionKey} id={option.optionKey} className="mt-1" />
                                <Label htmlFor={option.optionKey} className="flex-1 cursor-pointer">
                                  <div className="p-3 bg-gray-50 rounded-lg hover:bg-gray-100">
                                    <div className="flex items-center justify-between mb-2">
                                      <div className="flex items-center gap-3">
                                        <span className="text-lg font-bold text-gray-400">#{idx + 1}</span>
                                        <div>
                                          <p className="font-medium">{option.startDate} to {option.endDate}</p>
                                          <p className="text-sm text-gray-500">Compatibility: {(option.score * 100).toFixed(0)}%</p>
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
                                          {displayVoters.map((voter: any) => (
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
                                              title={voters.slice(6).map((v: any) => v.name).join(', ')}
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
                      <div className="mt-6 flex gap-4 flex-wrap">
                        <Button onClick={submitVote} disabled={!canParticipate || !selectedVote}>
                          {!canParticipate ? 'You have left this trip' : trip.userVote ? 'Update Vote' : 'Submit Vote'}
                        </Button>
                        {trip.canLock && selectedVote && canParticipate && (
                          <Button 
                            variant="default" 
                            onClick={() => {
                              // For legacy voting, use lockTrip directly
                              // For top3_heatmap, use onOpenLockConfirm if available
                              if (trip.schedulingMode === 'top3_heatmap' && onOpenLockConfirm) {
                                // Extract startDateISO from optionKey (format: YYYY-MM-DD_YYYY-MM-DD)
                                const [startDateISO] = selectedVote.split('_')
                                if (startDateISO) {
                                  onOpenLockConfirm({ startDateISO })
                                } else {
                                  toast.error('Pick a date option before locking.')
                                }
                              } else {
                                lockTrip(selectedVote)
                              }
                            }}
                          >
                            <Lock className="h-4 w-4 mr-2" />
                            Lock Dates
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Locked Phase */}
              {trip.status === 'locked' && (
                <Card className="bg-green-50 border-green-200">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-green-800">
                      <Lock className="h-5 w-5" />
                      Trip Dates Locked!
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-center py-8">
                      <div className="text-4xl font-bold text-green-800 mb-4">
                        {trip.lockedStartDate} to {trip.lockedEndDate}
                      </div>
                      <p className="text-green-700">
                        Your trip dates are confirmed. Time to start planning the details!
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </>
      )}

      {/* Hosted Trip - Just show locked dates */}
      {trip.type === 'hosted' && (
        <Card className="bg-green-50 border-green-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-800">
              <Lock className="h-5 w-5" />
              Fixed Trip Dates
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8">
              <div className="text-4xl font-bold text-green-800 mb-4">
                {trip.lockedStartDate} to {trip.lockedEndDate}
              </div>
              <p className="text-green-700">
                This is a hosted trip with fixed dates. Join if you're available!
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  )
}
