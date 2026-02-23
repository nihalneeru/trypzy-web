'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface EligibleUser {
  userId: string
  displayName: string
  username?: string
}

interface TransferLeadershipDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  eligibleUsers: EligibleUser[]
  onConfirm: (transferToUserId: string) => Promise<void>
  loading?: boolean
}

export function TransferLeadershipDialog({
  open,
  onOpenChange,
  eligibleUsers,
  onConfirm,
  loading = false
}: TransferLeadershipDialogProps) {
  const [selectedNewLeader, setSelectedNewLeader] = useState('')
  const [validationError, setValidationError] = useState('')

  const handleConfirm = async () => {
    if (!selectedNewLeader) {
      setValidationError('Please select a new leader to continue')
      return
    }

    setValidationError('')
    try {
      await onConfirm(selectedNewLeader)
      // Reset state on success
      setSelectedNewLeader('')
      onOpenChange(false)
    } catch (error) {
      // Error handling is done in onConfirm
      // Just keep dialog open on error
    }
  }

  const handleCancel = () => {
    setSelectedNewLeader('')
    setValidationError('')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pass the lead before leaving</DialogTitle>
          <DialogDescription>
            Pick someone to take over before you go.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Label htmlFor="new-leader">Select new leader</Label>
          <Select value={selectedNewLeader} onValueChange={(value) => {
            setSelectedNewLeader(value)
            setValidationError('')
          }}>
            <SelectTrigger id="new-leader" className="mt-2">
              <SelectValue placeholder="Choose a member..." />
            </SelectTrigger>
            <SelectContent>
              {eligibleUsers.map((user) => (
                <SelectItem key={user.userId} value={user.userId}>
                  {user.displayName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!selectedNewLeader && !validationError && (
            <p className="text-xs text-gray-500 mt-2">
              Please select a new leader to continue
            </p>
          )}
          {validationError && (
            <p className="text-xs text-brand-red mt-2">
              {validationError}
            </p>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleCancel} disabled={loading}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!selectedNewLeader || loading}
          >
            {loading ? 'Leaving...' : 'Transfer & Leave'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
