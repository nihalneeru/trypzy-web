'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Share2, Copy } from 'lucide-react'
import { nativeShare, copyToClipboard } from '@/lib/native/share'

/**
 * Reusable invite link + share UI block.
 * Used by CircleOnboardingInterstitial and TripFirstFlow.
 *
 * @param {Object} props
 * @param {string} props.inviteCode - The invite code to display
 * @param {string} props.shareText - Text for the share payload (e.g. 'Join "My Trip" on Tripti!')
 * @param {string} props.shareUrl - Full URL for the invite link
 * @param {(shared: boolean) => void} [props.onShareComplete] - Called after share/skip
 */
export function InviteShareBlock({ inviteCode, shareText, shareUrl, onShareComplete }) {
  const [inviteCopied, setInviteCopied] = useState(false)

  async function handleCopyInviteCode() {
    if (!inviteCode) return
    const result = await copyToClipboard(inviteCode)
    if (result === 'copied') {
      setInviteCopied(true)
      toast.success('Code copied!')
      setTimeout(() => setInviteCopied(false), 2000)
    } else {
      toast.error('Could not copy — please copy manually')
    }
  }

  async function handleShare() {
    const result = await nativeShare({ title: 'Tripti.ai Invite', text: shareText, url: shareUrl })
    if (result === 'shared' || result === 'copied') {
      if (result === 'copied') toast.success('Invite link copied!')
      if (onShareComplete) onShareComplete(true)
    } else {
      toast.error('Could not copy — please copy manually')
    }
  }

  return (
    <div className="space-y-4">
      {/* Share Link */}
      <div className="space-y-2">
        <Label>Invite Link</Label>
        <div className="p-3 bg-brand-sand border border-brand-carbon/20 rounded-lg">
          <p className="text-sm font-mono text-brand-carbon break-all">
            {shareUrl}
          </p>
        </div>
      </div>

      {/* Share Button */}
      <Button onClick={handleShare} className="w-full" size="lg">
        <Share2 className="h-4 w-4 mr-2" />
        Share Invite Link
      </Button>

      {/* Invite Code (secondary) */}
      <div className="pt-2 border-t">
        <p className="text-xs text-brand-carbon/60 mb-2">Or share the code directly:</p>
        <div className="flex items-center gap-2">
          <div className="flex-1 p-2 bg-brand-sand/50 border rounded">
            <p className="text-lg font-mono font-bold text-brand-carbon text-center">
              {inviteCode || 'N/A'}
            </p>
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={handleCopyInviteCode}
            className="flex-shrink-0"
          >
            <Copy className={`h-4 w-4 ${inviteCopied ? 'text-brand-blue' : ''}`} />
          </Button>
        </div>
      </div>
    </div>
  )
}
