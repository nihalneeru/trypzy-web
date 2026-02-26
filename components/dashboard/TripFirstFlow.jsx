'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Pencil, Check, X } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TripFormFields } from './TripFormFields'
import { InviteShareBlock } from './InviteShareBlock'
import { tripHref } from '@/lib/navigation/routes'

const INITIAL_FORM = {
  name: '',
  description: '',
  type: 'collaborative',
  startDate: '',
  endDate: '',
  duration: '',
  destinationHint: '',
  circleName: '',
  circleNameDirty: false
}

/**
 * Trip-First Onboarding Flow
 *
 * Two-step dialog: setup (create trip, auto-create circle) → invite travelers.
 * Gated by NEXT_PUBLIC_TRIP_FIRST_ONBOARDING=true.
 *
 * @param {Object} props
 * @param {boolean} props.open
 * @param {(open: boolean) => void} props.onOpenChange
 * @param {string} props.token - Auth token
 * @param {() => void} props.onSuccess - Called after flow completes
 */
export function TripFirstFlow({ open, onOpenChange, token, onSuccess }) {
  const router = useRouter()
  const [step, setStep] = useState('setup')
  const [tripForm, setTripForm] = useState(INITIAL_FORM)
  const [creating, setCreating] = useState(false)
  const [result, setResult] = useState(null) // { trip, circle }

  // Circle name inline edit state (invite step)
  const [editingCircleName, setEditingCircleName] = useState(false)
  const [circleNameDraft, setCircleNameDraft] = useState('')
  const [savingCircleName, setSavingCircleName] = useState(false)

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (!open) {
      setStep('setup')
      setTripForm(INITIAL_FORM)
      setCreating(false)
      setResult(null)
      setEditingCircleName(false)
      setCircleNameDraft('')
      setSavingCircleName(false)
    }
  }, [open])

  const handleCreate = async () => {
    if (!tripForm.name) {
      toast.error('Please enter a trip name')
      return
    }
    if (tripForm.type === 'hosted' && (!tripForm.startDate || !tripForm.endDate)) {
      toast.error('Hosted trips require start and end dates')
      return
    }

    setCreating(true)

    try {
      // POST without circleId — backend auto-creates circle
      const payload = { ...tripForm }
      // Strip client-only dirty flag
      delete payload.circleNameDirty
      if (tripForm.type === 'collaborative' && (!tripForm.startDate || !tripForm.endDate)) {
        delete payload.startDate
        delete payload.endDate
      }
      if (!tripForm.duration) {
        delete payload.duration
      }
      if (!payload.circleName?.trim()) {
        delete payload.circleName
      }
      if (!payload.destinationHint?.trim()) {
        delete payload.destinationHint
      }

      const response = await fetch('/api/trips', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create trip')
      }

      toast.success('Trip created!')
      setResult({ trip: data, circle: data.circle })
      setStep('invite')
    } catch (error) {
      toast.error(error.message || "Couldn't create trip — please try again")
    } finally {
      setCreating(false)
    }
  }

  const handleFinish = () => {
    onOpenChange(false)
    if (result?.trip?.id) {
      router.push(`${tripHref(result.trip.id)}?overlay=scheduling`)
    }
    if (onSuccess) {
      onSuccess()
    }
  }

  const startEditCircleName = () => {
    setCircleNameDraft(result?.circle?.name || '')
    setEditingCircleName(true)
  }

  const cancelEditCircleName = () => {
    setEditingCircleName(false)
    setCircleNameDraft('')
  }

  const saveCircleName = async () => {
    const trimmed = circleNameDraft.trim()
    if (!trimmed) {
      toast.error('Circle name cannot be empty')
      return
    }
    if (trimmed === result?.circle?.name) {
      setEditingCircleName(false)
      return
    }

    setSavingCircleName(true)
    try {
      const response = await fetch(`/api/circles/${result.circle.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ name: trimmed })
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Could not rename circle')
      }

      setResult(prev => ({
        ...prev,
        circle: { ...prev.circle, name: trimmed }
      }))
      toast.success('Circle renamed')
      setEditingCircleName(false)
    } catch (error) {
      toast.error(error.message || "Couldn't rename circle — please try again")
    } finally {
      setSavingCircleName(false)
    }
  }

  const shareUrl = typeof window !== 'undefined' && result?.circle?.inviteCode
    ? `${window.location.origin}/join/${result.circle.inviteCode}`
    : ''

  if (step === 'invite' && result) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Invite your travelers</DialogTitle>
            <DialogDescription>
              Share this link — they'll land right in the trip.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-brand-carbon/70">Your group:</span>
              {editingCircleName ? (
                <div className="flex items-center gap-1 flex-1">
                  <Input
                    value={circleNameDraft}
                    onChange={(e) => setCircleNameDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveCircleName()
                      if (e.key === 'Escape') cancelEditCircleName()
                    }}
                    className="h-8 text-sm"
                    maxLength={100}
                    disabled={savingCircleName}
                    autoFocus
                  />
                  <button
                    onClick={saveCircleName}
                    disabled={savingCircleName}
                    className="p-1 text-brand-blue hover:text-brand-blue/80"
                    aria-label="Save circle name"
                  >
                    <Check className="h-4 w-4" />
                  </button>
                  <button
                    onClick={cancelEditCircleName}
                    disabled={savingCircleName}
                    className="p-1 text-brand-carbon/40 hover:text-brand-carbon/70"
                    aria-label="Cancel editing"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  <span className="text-sm font-medium">"{result.circle.name}"</span>
                  <button
                    onClick={startEditCircleName}
                    className="p-1 text-brand-blue hover:text-brand-blue/80"
                    aria-label="Edit circle name"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
            <InviteShareBlock
              inviteCode={result.circle.inviteCode}
              shareText={`Join "${result.trip.name}" on Tripti.ai!`}
              shareUrl={shareUrl}
            />
          </div>
          <DialogFooter className="flex gap-2 sm:gap-2">
            <Button variant="outline" onClick={handleFinish}>
              I'll do this later
            </Button>
            <Button onClick={handleFinish}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Plan your trip</DialogTitle>
          <DialogDescription>
            We'll set up your group automatically — one less thing to think about.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4 overflow-y-auto flex-1 min-h-0">
          <TripFormFields tripForm={tripForm} onChange={setTripForm} showCircleName />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={creating}>
            {creating ? 'Creating...' : 'Create Trip'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
