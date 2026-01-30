'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { ArrowRightLeft, Check, X, Mail } from 'lucide-react'
import { toast } from 'sonner'

interface ChatBottomCTAProps {
  trip: any
  token: string
  user: any
  onRefresh: (updatedTrip?: any) => void
}

/**
 * Renders an inline CTA banner just above the chat composer for:
 * 1. Hosted trip invitation — accept/decline (higher priority)
 * 2. Leadership transfer request — accept/decline
 *
 * Only one CTA shows at a time. Invite takes priority.
 */
export function ChatBottomCTA({ trip, token, user, onRefresh }: ChatBottomCTAProps) {
  const [invitation, setInvitation] = useState<any>(null)
  const [loadingInvite, setLoadingInvite] = useState(false)
  const [processing, setProcessing] = useState(false)

  const viewer = trip?.viewer || {}
  const isPendingLeader = viewer.isPendingLeader === true
  const isCancelled = trip?.status === 'canceled'
  const isHosted = trip?.type === 'hosted'

  // Fetch pending invitation for hosted trips
  useEffect(() => {
    if (!isHosted || !trip?.id || !token || isCancelled) return
    if (viewer.isActiveParticipant) return // already accepted

    let cancelled = false
    const fetchInvite = async () => {
      setLoadingInvite(true)
      try {
        const res = await fetch(`/api/trips/${trip.id}/invitations/me`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled && data?.status === 'pending') {
          setInvitation(data)
        }
      } catch {
        // Silently ignore — invitation CTA is supplementary
      } finally {
        if (!cancelled) setLoadingInvite(false)
      }
    }
    fetchInvite()
    return () => { cancelled = true }
  }, [isHosted, trip?.id, token, isCancelled, viewer.isActiveParticipant])

  // --- Invitation handlers ---
  const handleInviteAction = async (action: 'accept' | 'decline') => {
    if (!invitation?.id) return
    setProcessing(true)
    try {
      const res = await fetch(
        `/api/trips/${trip.id}/invitations/${invitation.id}/${action}`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}` } }
      )
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `Failed to ${action} invitation`)
      }
      toast.success(action === 'accept' ? 'You joined the trip!' : 'Invitation declined')
      setInvitation(null)
      onRefresh()
    } catch (err: any) {
      toast.error(err.message || `Failed to ${action} invitation`)
    } finally {
      setProcessing(false)
    }
  }

  // --- Transfer handlers ---
  const handleTransferAction = async (action: 'accept' | 'decline') => {
    setProcessing(true)
    try {
      const res = await fetch(
        `/api/trips/${trip.id}/transfer-leadership/${action}`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}` } }
      )
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `Failed to ${action} transfer`)
      }
      toast.success(
        action === 'accept' ? 'You are now the trip leader!' : 'Leadership transfer declined'
      )
      onRefresh()
    } catch (err: any) {
      toast.error(err.message || `Failed to ${action} transfer`)
    } finally {
      setProcessing(false)
    }
  }

  // Don't show anything if trip is canceled or user has left
  if (isCancelled || viewer.participantStatus === 'left') return null

  // Priority 1: Hosted trip invitation
  if (invitation) {
    return (
      <div className="flex items-center gap-3 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg mx-1 mb-2">
        <Mail className="h-4 w-4 text-brand-blue shrink-0" />
        <p className="text-sm text-gray-800 flex-1 min-w-0">
          You've been invited to join this trip
        </p>
        <div className="flex gap-2 shrink-0">
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleInviteAction('decline')}
            disabled={processing}
            className="h-10 md:h-8 px-3 text-xs"
          >
            Decline
          </Button>
          <Button
            size="sm"
            onClick={() => handleInviteAction('accept')}
            disabled={processing}
            className="h-10 md:h-8 px-3 text-xs bg-brand-blue hover:opacity-90"
          >
            Accept
          </Button>
        </div>
      </div>
    )
  }

  // Priority 2: Leadership transfer
  if (isPendingLeader) {
    return (
      <div className="flex items-center gap-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg mx-1 mb-2">
        <ArrowRightLeft className="h-4 w-4 text-amber-600 shrink-0" />
        <p className="text-sm text-gray-800 flex-1 min-w-0">
          Leadership transfer requested
        </p>
        <div className="flex gap-2 shrink-0">
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleTransferAction('decline')}
            disabled={processing}
            className="h-10 md:h-8 px-3 text-xs"
          >
            Decline
          </Button>
          <Button
            size="sm"
            onClick={() => handleTransferAction('accept')}
            disabled={processing}
            className="h-10 md:h-8 px-3 text-xs bg-brand-blue hover:opacity-90"
          >
            Accept
          </Button>
        </div>
      </div>
    )
  }

  return null
}
