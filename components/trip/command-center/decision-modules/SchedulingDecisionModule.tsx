'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ChevronDown, ChevronUp, Calendar, Check, Users, Vote } from 'lucide-react'
import { formatTripDateRange } from '@/lib/utils'

interface SchedulingDecisionModuleProps {
  trip: any
  token: string
  user: any
  onRefresh: (updatedTrip?: any) => void
  isExpanded: boolean
  onToggle: () => void
  onOpenLegacyTab: (tab: string) => void
  isPrimaryBlocker?: boolean
}

/**
 * SchedulingDecisionModule - Wrapper for date scheduling decisions
 *
 * Shows scheduling status summary with action button.
 * Full scheduling UI is complex (50+ props) - links to legacy tab for actions.
 */
export function SchedulingDecisionModule({
  trip,
  token,
  user,
  onRefresh,
  isExpanded,
  onToggle,
  onOpenLegacyTab,
  isPrimaryBlocker = false
}: SchedulingDecisionModuleProps) {
  const datesLocked = trip?.status === 'locked'
  const isVoting = trip?.status === 'voting'
  const isScheduling = trip?.status === 'scheduling' || trip?.status === 'proposed'

  // User's participation status
  const userHasPicked = trip?.userDatePicks && trip.userDatePicks.length > 0
  const userHasVoted = !!trip?.userVote
  const isTripLeader = trip?.viewer?.isTripLeader || trip?.createdBy === user?.id

  // Completion status
  const isComplete = datesLocked
  const isActive = !datesLocked

  // Response counts
  const respondedCount = trip?.respondedCount || 0
  const totalMembers = trip?.activeTravelerCount || trip?.totalMembers || 0
  const votedCount = trip?.votedCount || 0

  // Status message
  const getStatusMessage = () => {
    if (datesLocked) {
      return `Dates locked: ${formatTripDateRange(trip.lockedStartDate, trip.lockedEndDate)}`
    }
    if (isVoting) {
      return `Voting in progress: ${votedCount}/${totalMembers} voted`
    }
    return `${respondedCount}/${totalMembers} responded with availability`
  }

  // Action message
  const getActionMessage = () => {
    if (datesLocked) return null
    if (isVoting && !userHasVoted) return 'Cast your vote'
    if (isVoting && userHasVoted) return 'Waiting for others to vote'
    if (!userHasPicked) return 'Pick your preferred dates'
    return 'Waiting for others to respond'
  }

  // Phase 5: De-emphasize non-blocker modules visually
  const getCardClasses = () => {
    if (isComplete) return 'border-green-200'
    if (!isPrimaryBlocker) return 'border-gray-200 opacity-75'
    if (isActive) return 'border-blue-300 shadow-md'
    return 'border-gray-200'
  }

  // If dates are locked, show minimal card (can be collapsed by default)
  return (
    <Card className={`transition-all ${getCardClasses()}`}>
      <CardHeader
        className="cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-full ${isComplete ? 'bg-green-100' : isActive && isPrimaryBlocker ? 'bg-blue-100' : 'bg-gray-100'}`}>
              {isComplete ? (
                <Check className="h-5 w-5 text-green-600" />
              ) : isVoting ? (
                <Vote className={`h-5 w-5 ${isPrimaryBlocker ? 'text-blue-600' : 'text-gray-400'}`} />
              ) : (
                <Calendar className={`h-5 w-5 ${isActive && isPrimaryBlocker ? 'text-blue-600' : 'text-gray-400'}`} />
              )}
            </div>
            <div>
              <CardTitle className={`text-base flex items-center gap-2 ${!isPrimaryBlocker && !isComplete ? 'text-gray-500' : ''}`}>
                Scheduling
                {isComplete && (
                  <Badge className="bg-green-100 text-green-800 text-xs">Complete</Badge>
                )}
                {isVoting && isPrimaryBlocker && (
                  <Badge className="bg-purple-100 text-purple-800 text-xs">Voting</Badge>
                )}
                {isScheduling && !isVoting && isPrimaryBlocker && (
                  <Badge className="bg-blue-100 text-blue-800 text-xs">Action Needed</Badge>
                )}
              </CardTitle>
              <p className="text-sm text-gray-500">{getStatusMessage()}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Phase 8: Quick-action CTA visible even when collapsed
                Phase 9: Will expand module and show inline scheduling UI */}
            {!isExpanded && !datesLocked && (
              <Button
                size="sm"
                variant={isPrimaryBlocker ? 'default' : 'outline'}
                className={isPrimaryBlocker ? '' : 'text-gray-500 border-gray-300'}
                onClick={(e) => {
                  e.stopPropagation()
                  onToggle() // Expand first, show content
                }}
              >
                {isVoting && !userHasVoted ? 'Vote' : userHasPicked ? 'View' : 'Pick Dates'}
              </Button>
            )}
            <Button variant="ghost" size="sm">
              {isExpanded ? (
                <ChevronUp className="h-5 w-5" />
              ) : (
                <ChevronDown className="h-5 w-5" />
              )}
            </Button>
          </div>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="pt-0">
          <div className="space-y-4">
            {/* Progress indicator */}
            {!datesLocked && (
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-gray-400" />
                  <span>
                    {isVoting
                      ? `${votedCount} of ${totalMembers} voted`
                      : `${respondedCount} of ${totalMembers} responded`}
                  </span>
                </div>
              </div>
            )}

            {/* Locked dates display */}
            {datesLocked && (
              <div className="bg-green-50 rounded-lg p-4">
                <div className="flex items-center gap-2 text-green-800">
                  <Check className="h-5 w-5" />
                  <span className="font-medium">
                    {formatTripDateRange(trip.lockedStartDate, trip.lockedEndDate)}
                  </span>
                </div>
              </div>
            )}

            {/* Action prompt - Phase 8: Always show CTA for visibility
                Phase 9: Replace onOpenLegacyTab with inline scheduling UI */}
            {getActionMessage() && (
              <div className={`flex items-center justify-between rounded-lg p-4 ${isPrimaryBlocker ? 'bg-blue-50' : 'bg-gray-50'}`}>
                <span className={isPrimaryBlocker ? 'text-blue-800' : 'text-gray-600'}>{getActionMessage()}</span>
                <Button
                  size="sm"
                  variant={isPrimaryBlocker ? 'default' : 'outline'}
                  className={isPrimaryBlocker ? '' : 'text-gray-600'}
                  onClick={(e) => {
                    e.stopPropagation()
                    // Phase 9: Replace with inline scheduling component
                    onOpenLegacyTab('planning')
                  }}
                >
                  {isVoting && !userHasVoted ? 'Vote Now' : userHasPicked ? 'View Status' : 'Pick Dates'}
                </Button>
              </div>
            )}

            {/* Leader actions - Phase 8: Always show when applicable
                Phase 9: Replace with inline lock action */}
            {isTripLeader && isVoting && trip?.votingStatus?.readyToLock && (
              <div className="flex items-center justify-between bg-green-50 rounded-lg p-4">
                <span className="text-green-800">Ready to lock dates</span>
                <Button
                  size="sm"
                  className="bg-green-600 hover:bg-green-700"
                  onClick={(e) => {
                    e.stopPropagation()
                    // Phase 9: Replace with inline lock action
                    onOpenLegacyTab('planning')
                  }}
                >
                  Lock Dates
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  )
}
