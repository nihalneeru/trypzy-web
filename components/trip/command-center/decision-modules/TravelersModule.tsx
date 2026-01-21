'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ChevronDown, ChevronUp, Users } from 'lucide-react'

interface TravelersModuleProps {
  trip: any
  token: string
  user: any
  onRefresh: (updatedTrip?: any) => void
  isExpanded: boolean
  onToggle: () => void
  onOpenLegacyTab: (tab: string) => void
}

/**
 * TravelersModule - Secondary module for traveler coordination
 *
 * Shows who's going/not going. Not a blocker - always accessible.
 * Phase 9: Will show inline traveler management UI
 */
export function TravelersModule({
  trip,
  token,
  user,
  onRefresh,
  isExpanded,
  onToggle,
  onOpenLegacyTab
}: TravelersModuleProps) {
  // Traveler counts
  const activeTravelers = trip?.activeTravelerCount || 0
  const totalInvited = trip?.totalMembers || activeTravelers
  const pendingCount = trip?.pendingTravelerCount || 0

  // Status message
  const getStatusMessage = () => {
    if (activeTravelers === 0) return 'No confirmed travelers yet'
    if (pendingCount > 0) {
      return `${activeTravelers} going, ${pendingCount} pending`
    }
    return `${activeTravelers} traveler${activeTravelers !== 1 ? 's' : ''} confirmed`
  }

  return (
    <Card className="border-gray-200">
      <CardHeader
        className="cursor-pointer hover:bg-gray-50 transition-colors py-3"
        onClick={onToggle}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-gray-100">
              <Users className="h-4 w-4 text-gray-500" />
            </div>
            <div>
              <CardTitle className="text-sm font-medium text-gray-700 flex items-center gap-2">
                Travelers
                {activeTravelers > 0 && (
                  <Badge variant="outline" className="text-xs font-normal">
                    {activeTravelers} going
                  </Badge>
                )}
              </CardTitle>
              <p className="text-xs text-gray-500">{getStatusMessage()}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!isExpanded && (
              <Button
                size="sm"
                variant="outline"
                className="text-xs text-gray-500 border-gray-300 h-7"
                onClick={(e) => {
                  e.stopPropagation()
                  onToggle()
                }}
              >
                View
              </Button>
            )}
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
              {isExpanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="pt-0 pb-3">
          <div className="space-y-3">
            {/* Traveler summary */}
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">
                  {activeTravelers} of {totalInvited} confirmed
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs h-7"
                  onClick={(e) => {
                    e.stopPropagation()
                    // Phase 9: Replace with inline traveler management
                    onOpenLegacyTab('travelers')
                  }}
                >
                  Manage Travelers
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  )
}
