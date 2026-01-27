'use client'

import { useState } from 'react'
import { Users, LogOut, Copy } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { LeaveCircleDialog } from '@/components/circles/LeaveCircleDialog'

interface CircleHeaderProps {
  circle: {
    id: string
    name: string
    description?: string
    inviteCode: string
    isOwner: boolean
  }
  token: string
  onLeft: () => void
}

export function CircleHeader({ circle, token, onLeft }: CircleHeaderProps) {
  const [showLeaveDialog, setShowLeaveDialog] = useState(false)

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

      {/* Invite Code */}
      <Card className="bg-brand-sand border-gray-200">
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-brand-blue font-medium">Invite Code</p>
              <p className="text-2xl font-mono font-bold text-brand-carbon">{circle.inviteCode}</p>
            </div>
            <Button
              variant="outline"
              onClick={() => {
                navigator.clipboard.writeText(circle.inviteCode)
                toast.success('Invite code copied!')
              }}
            >
              <Copy className="h-4 w-4 mr-1" />
              Copy Code
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
