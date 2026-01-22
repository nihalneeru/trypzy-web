'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ChevronDown, ChevronUp, ClipboardList } from 'lucide-react'

interface PrepModuleProps {
  trip: any
  token: string
  user: any
  onRefresh: (updatedTrip?: any) => void
  isExpanded: boolean
  onToggle: () => void
  onOpenLegacyTab: (tab: string) => void
}

/**
 * PrepModule - Secondary module for trip preparation
 *
 * Shows packing lists, reminders, etc. Not a blocker - always accessible.
 * Phase 9: Will show inline prep management UI
 */
export function PrepModule({
  trip,
  token,
  user,
  onRefresh,
  isExpanded,
  onToggle,
  onOpenLegacyTab
}: PrepModuleProps) {
  // Prep status from trip progress
  const prepStarted = trip?.progress?.prepStartedAt
  const packingItemsCount = trip?.packingItemsCount || 0
  const completedItemsCount = trip?.completedPackingItems || 0

  // Status message
  const getStatusMessage = () => {
    if (!prepStarted && packingItemsCount === 0) {
      return 'No prep items yet'
    }
    if (packingItemsCount > 0) {
      return `${completedItemsCount}/${packingItemsCount} items ready`
    }
    return 'Prep in progress'
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
              <ClipboardList className="h-4 w-4 text-gray-500" />
            </div>
            <div>
              <CardTitle className="text-sm font-medium text-gray-700 flex items-center gap-2">
                Prep
                {packingItemsCount > 0 && (
                  <Badge variant="outline" className="text-xs font-normal">
                    {completedItemsCount}/{packingItemsCount}
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
            {/* Prep summary */}
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">
                  {packingItemsCount === 0
                    ? 'Add packing lists and reminders'
                    : `${completedItemsCount} of ${packingItemsCount} items packed`}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs h-7"
                  onClick={(e) => {
                    e.stopPropagation()
                    // Phase 9: Replace with inline prep management
                    onOpenLegacyTab('prep')
                  }}
                >
                  {packingItemsCount === 0 ? 'Start Prep' : 'View Prep'}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  )
}
