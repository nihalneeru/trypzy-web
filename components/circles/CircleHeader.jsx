'use client'

import { useState } from 'react'
import { Users, LogOut, Copy, Share2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { LeaveCircleDialog } from '@/components/circles/LeaveCircleDialog'
import { nativeShare, copyToClipboard } from '@/lib/native/share'

export function CircleHeader({ circle, token, onLeft }) {
  const [showLeaveDialog, setShowLeaveDialog] = useState(false)

  // Build share URL
  const shareUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/join/${circle.inviteCode}`
    : `/join/${circle.inviteCode}`

  // Copy just the invite code
  async function handleCopyCode() {
    const result = await copyToClipboard(circle.inviteCode)
    if (result === 'copied') {
      toast.success('Code copied!')
    } else {
      toast.error('Could not copy — please copy manually')
    }
  }

  // Share invite via native share sheet, Web Share API, or clipboard fallback
  async function handleShare() {
    const shareText = circle.name
      ? `Join my Tripti.ai circle "${circle.name}" to plan trips together!`
      : `Join my Tripti.ai circle to plan trips together!`

    const result = await nativeShare({ title: 'Tripti.ai Invite', text: shareText, url: shareUrl })
    if (result === 'copied') {
      toast.success('Invite message copied!')
    } else if (result === 'failed') {
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
            <p className="text-brand-carbon/70">{circle.description}</p>
          )}
        </div>
        {!circle.isOwner && (
          <Button
            variant="ghost"
            size="sm"
            className="text-brand-carbon/60 hover:text-brand-red"
            onClick={() => setShowLeaveDialog(true)}
          >
            <LogOut className="h-4 w-4 mr-1" />
            Leave
          </Button>
        )}
      </div>

      {/* Invite Section */}
      <Card className="bg-brand-sand border-brand-carbon/10">
        <CardContent className="py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-brand-carbon/70 mb-1">Invite friends to join</p>
              <p className="text-xs text-brand-carbon/40">
                Code:{' '}
                <span className="font-mono font-medium text-brand-carbon">
                  {circle.inviteCode}
                </span>
                <button
                  onClick={handleCopyCode}
                  className="ml-1.5 text-brand-carbon/40 hover:text-brand-blue transition-colors"
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
