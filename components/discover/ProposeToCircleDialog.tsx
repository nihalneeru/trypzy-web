'use client'

import { useState } from 'react'
import { UserPlus, Users, Check } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'

interface Circle {
  id: string
  name: string
}

interface Post {
  id: string
  [key: string]: any
}

interface ProposeToCircleDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  post: Post | null
  circles: Circle[]
  token: string
  onProposed?: (tripId: string, circleId: string) => void
}

export function ProposeToCircleDialog({ open, onOpenChange, post, circles, token, onProposed }: ProposeToCircleDialogProps) {
  const [selectedCircleId, setSelectedCircleId] = useState('')
  const [proposing, setProposing] = useState(false)

  const handlePropose = async () => {
    if (!selectedCircleId || !post) {
      toast.error('Please select a circle')
      return
    }

    setProposing(true)
    try {
      const res = await fetch(`/api/discover/posts/${post.id}/propose`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ circleId: selectedCircleId }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to propose trip')
      }

      toast.success('Trip proposed! Your group can now schedule dates and customize the itinerary.')
      onOpenChange(false)
      setSelectedCircleId('')

      if (onProposed && data.trip) {
        onProposed(data.trip.id, data.trip.circleId)
      }
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setProposing(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Propose Trip to Your Circle
          </DialogTitle>
          <DialogDescription>
            Start planning a trip inspired by this memory
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {/* Circle Selection */}
          <div className="space-y-2">
            <Label>Select a Circle</Label>
            {circles && circles.length > 0 ? (
              <Select value={selectedCircleId} onValueChange={setSelectedCircleId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a circle..." />
                </SelectTrigger>
                <SelectContent>
                  {circles.map(circle => (
                    <SelectItem key={circle.id} value={circle.id}>
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        {circle.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-sm text-brand-carbon/60">
                You need to create or join a circle first to propose trips.
              </p>
            )}
          </div>

          {/* Info Box */}
          <div className="bg-brand-sand/30 rounded-lg p-4 text-sm space-y-2">
            <p className="font-medium text-brand-carbon/80">What happens next:</p>
            <ul className="space-y-1 text-brand-carbon/70">
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                <span>A new trip will be created in your circle</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                <span>The itinerary will be copied as an editable template</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                <span>Your circle decides the actual dates</span>
              </li>
            </ul>
            <p className="text-xs text-brand-carbon/60 italic mt-2">
              This itinerary worked for them. Your group can change it.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handlePropose}
            disabled={proposing || !selectedCircleId}
          >
            {proposing ? 'Proposing...' : 'Propose Trip'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
