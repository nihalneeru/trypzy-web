'use client'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface CancelTripDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => Promise<void>
  loading?: boolean
}

export function CancelTripDialog({
  open,
  onOpenChange,
  onConfirm,
  loading = false
}: CancelTripDialogProps) {
  const handleConfirm = async () => {
    try {
      await onConfirm()
      onOpenChange(false)
    } catch (error) {
      // Error handling is done in onConfirm
      // Just keep dialog open on error
    }
  }

  const handleCancel = () => {
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>You're the last traveler</DialogTitle>
          <DialogDescription>
            Since there's no one to transfer leadership to, canceling will end the trip for everyone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleCancel} disabled={loading}>
            Keep trip
          </Button>
          <Button 
            onClick={handleConfirm} 
            disabled={loading}
            variant="destructive"
          >
            {loading ? 'Canceling...' : 'Cancel trip'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
