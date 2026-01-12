'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Users } from 'lucide-react'

/**
 * Circle Picker Dialog - Select a circle for creating a trip
 * @param {Object} props
 * @param {boolean} props.open
 * @param {Function} props.onOpenChange
 * @param {Array} props.circles - Array of circle objects with {id, name}
 * @param {Function} props.onSelect - Callback with selected circleId
 */
export function CirclePickerDialog({ open, onOpenChange, circles, onSelect }) {
  const [selectedCircleId, setSelectedCircleId] = useState('')

  // Reset selection when dialog closes
  useEffect(() => {
    if (!open) {
      setSelectedCircleId('')
    }
  }, [open])

  const handleContinue = () => {
    if (selectedCircleId && onSelect) {
      onSelect(selectedCircleId)
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Select a Circle</DialogTitle>
          <DialogDescription>Choose which circle to create the trip in</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
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
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleContinue} disabled={!selectedCircleId}>
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
