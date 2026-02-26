'use client'

import {
  Sun, Sunset, Moon, Clock, Calendar as CalendarIcon,
  ListTodo, MapPin, UserPlus
} from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface ItineraryItem {
  id?: string
  title: string
  timeBlock: string
  notes?: string
  locationText?: string
}

interface ItineraryDay {
  dayNumber: number
  items: ItineraryItem[]
  hasMore?: boolean
  totalItems?: number
}

interface ItinerarySnapshot {
  tripLength: number
  style: string
  totalActivities?: number
  days?: ItineraryDay[]
}

interface Post {
  id: string
  itinerarySnapshot?: ItinerarySnapshot
  [key: string]: any
}

interface ViewItineraryDialogProps {
  post: Post | null
  onClose: () => void
  onProposeTrip: (post: Post) => void
}

function getTimeBlockIcon(timeBlock: string) {
  switch (timeBlock) {
    case 'morning': return <Sun className="h-4 w-4 text-yellow-500" />
    case 'afternoon': return <Sunset className="h-4 w-4 text-orange-500" />
    case 'evening': return <Moon className="h-4 w-4 text-brand-carbon/60" />
    default: return <Clock className="h-4 w-4 text-brand-carbon/40" />
  }
}

export function ViewItineraryDialog({ post, onClose, onProposeTrip }: ViewItineraryDialogProps) {
  const snapshot = post?.itinerarySnapshot

  return (
    <Dialog open={!!post} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        {snapshot && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ListTodo className="h-5 w-5 text-brand-blue" />
                Full Itinerary
              </DialogTitle>
              <DialogDescription>
                {snapshot.tripLength}-day {snapshot.style} itinerary
                {snapshot.totalActivities ? ` \u2022 ${snapshot.totalActivities} activities` : ''}
              </DialogDescription>
            </DialogHeader>

            {/* Inspiration Notice */}
            <div className="bg-brand-sand border border-brand-carbon/10 rounded-lg p-3 text-sm text-brand-carbon">
              <p className="font-medium">This itinerary worked for them</p>
              <p className="text-brand-carbon/70">Your group can change it to fit your preferences.</p>
            </div>

            {/* Day by Day Itinerary */}
            <div className="space-y-4 mt-4">
              {snapshot.days?.map((day) => (
                <div key={day.dayNumber} className="border rounded-lg p-4">
                  <h4 className="font-semibold mb-3 flex items-center gap-2">
                    <CalendarIcon className="h-4 w-4 text-brand-carbon/60" />
                    Day {day.dayNumber}
                  </h4>
                  <div className="space-y-2">
                    {day.items.map((item, idx) => (
                      <div key={idx} className="flex items-start gap-3 pl-2">
                        {getTimeBlockIcon(item.timeBlock)}
                        <div className="flex-1">
                          <p className="font-medium text-sm">{item.title}</p>
                          {item.notes && (
                            <p className="text-xs text-brand-carbon/60">{item.notes}</p>
                          )}
                          {item.locationText && (
                            <p className="text-xs text-brand-blue flex items-center gap-1 mt-1">
                              <MapPin className="h-3 w-3" />
                              {item.locationText}
                            </p>
                          )}
                        </div>
                        <Badge variant="outline" className="text-xs capitalize">
                          {item.timeBlock}
                        </Badge>
                      </div>
                    ))}
                    {day.hasMore && (
                      <p className="text-xs text-brand-carbon/40 pl-7">
                        +{(day.totalItems || 0) - day.items.length} more activities
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <DialogFooter className="mt-4">
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
              <Button onClick={() => {
                onClose()
                if (post) onProposeTrip(post)
              }}>
                <UserPlus className="h-4 w-4 mr-2" />
                Propose to Circle
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
