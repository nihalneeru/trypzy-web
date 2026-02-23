'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface BlockingTrip {
  id: string
  name: string
  status: string
}

interface LeaveCircleDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  circleName: string
  circleId: string
  token: string
  onLeft: () => void
}

export function LeaveCircleDialog({
  open,
  onOpenChange,
  circleName,
  circleId,
  token,
  onLeft
}: LeaveCircleDialogProps) {
  const [loading, setLoading] = useState(false)
  const [blockingTrips, setBlockingTrips] = useState<BlockingTrip[] | null>(null)

  const handleLeave = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/circles/${circleId}/leave`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.status === 409) {
        const data = await response.json()
        setBlockingTrips(data.blockingTrips || [])
        setLoading(false)
        return
      }

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to leave circle')
      }

      onOpenChange(false)
      onLeft()
    } catch (error) {
      // Keep dialog open on error
      setLoading(false)
      throw error
    }
    setLoading(false)
  }

  const handleClose = () => {
    setBlockingTrips(null)
    onOpenChange(false)
  }

  // Blocked state: show blocking trips
  if (blockingTrips) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cannot leave circle</DialogTitle>
            <DialogDescription>
              You have active trips in this circle. Leave or complete these trips first.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <ul className="space-y-2">
              {blockingTrips.map((trip) => (
                <li
                  key={trip.id}
                  className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2"
                >
                  <span className="text-sm font-medium text-brand-carbon">{trip.name}</span>
                  <span className="text-xs text-gray-500 capitalize">{trip.status}</span>
                </li>
              ))}
            </ul>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleClose}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  // Confirmation state
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Leave {circleName}?</DialogTitle>
          <DialogDescription>
            You will lose access to this circle's trips and conversations. You can rejoin later with an invite code.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button
            onClick={handleLeave}
            disabled={loading}
            variant="destructive"
          >
            {loading ? 'Leaving...' : 'Leave circle'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
