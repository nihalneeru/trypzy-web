'use client'

import { useState } from 'react'
import { Users, LogOut, Copy, Share2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { LeaveCircleDialog } from '@/components/circles/LeaveCircleDialog'

export function CircleHeader({ circle, token, onLeft }) {
  const [showLeaveDialog, setShowLeaveDialog] = useState(false)

  // Build share URL
  const shareUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/join/${circle.inviteCode}`
    : `/join/${circle.inviteCode}`

  // Clipboard copy with try/catch fallback
  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch (err) {
      // Fallback for browsers without clipboard API or permission denied
      try {
        const textarea = document.createElement('textarea')
        textarea.value = text
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
        return true
      } catch (fallbackErr) {
        console.error('Clipboard fallback failed:', fallbackErr)
        return false
      }
    }
  }

  // Copy just the invite code
  async function handleCopyCode() {
    const success = await copyToClipboard(circle.inviteCode)
    if (success) {
      toast.success('Code copied!')
    } else {
      toast.error('Could not copy — please copy manually')
    }
  }

  // Smart share: Web Share API or clipboard fallback
  async function handleShare() {
    const inviteMessage = circle.name
      ? `Join my Tripti circle "${circle.name}" to plan trips together 🌍\nTap the link to join:\n${shareUrl}`
      : `Join my Tripti circle to plan trips together 🌍\nTap the link to join:\n${shareUrl}`

    // Try Web Share API first (mobile)
    if (navigator.share) {
      try {
        await navigator.share({
          text: inviteMessage
        })
        return // Success - no toast needed, native share handles it
      } catch (err) {
        // User cancelled (AbortError) - do nothing
        if (err?.name === 'AbortError') {
          return
        }
        // Other error - fall through to clipboard
      }
    }

    // Fallback: copy formatted message to clipboard
    const success = await copyToClipboard(inviteMessage)
    if (success) {
      toast.success('Invite message copied!')
    } else {
      toast.error('Could not copy — please copy manually')
    }
  }

  return (
    <div className="mb-6">
      <div className="flex items-center gap-4 mb-4">
        <div className="h-16 w-16 rounded-full bg-brand-sand flex items-center justify-center">
          <Users className="h-8 w-8 text-brand-blue" />
        </div>
        <div className="flex-1">
          <h1 className="text-3xl font-bold text-brand-carbon">{circle.name}</h1>
          {circle.description && (
            <p className="text-gray-600">{circle.description}</p>
          )}
        </div>
        {!circle.isOwner && (
          <Button
            variant="ghost"
            size="sm"
            className="text-gray-500 hover:text-brand-red"
            onClick={() => setShowLeaveDialog(true)}
          >
            <LogOut className="h-4 w-4 mr-1" />
            Leave
          </Button>
        )}
      </div>

      {/* Invite Section */}
      <Card className="bg-brand-sand border-gray-200">
        <CardContent className="py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-600 mb-1">Invite friends to join</p>
              <p className="text-xs text-gray-400">
                Code:{' '}
                <span className="font-mono font-medium text-brand-carbon">
                  {circle.inviteCode}
                </span>
                <button
                  onClick={handleCopyCode}
                  className="ml-1.5 text-gray-400 hover:text-brand-blue transition-colors"
                  aria-label="Copy invite code"
                >
                  <Copy className="h-3 w-3 inline" />
                </button>
              </p>
            </div>
            <Button onClick={handleShare}>
              <Share2 className="h-4 w-4 mr-1.5" />
              Invite Friends
            </Button>
          </div>
        </CardContent>
      </Card>

      <LeaveCircleDialog
        open={showLeaveDialog}
        onOpenChange={setShowLeaveDialog}
        circleName={circle.name}
        circleId={circle.id}
        token={token}
        onLeft={onLeft}
      />
    </div>
  )
}
