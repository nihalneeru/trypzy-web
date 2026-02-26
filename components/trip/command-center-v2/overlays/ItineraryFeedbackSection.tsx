'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Skeleton } from '@/components/ui/skeleton'
import {
  MessageCircle,
  RefreshCw,
  ChevronDown
} from 'lucide-react'
import { BrandedSpinner } from '@/components/common/BrandedSpinner'

interface Feedback {
  id: string
  type: string
  target?: string
  message: string
  author?: {
    name: string
  }
  createdAt: string
}

interface Reaction {
  id: string
  userId: string
  reactionKey: string
  category: string
  user?: {
    id: string
    name: string
  } | null
}

interface ReactionDef {
  id: string
  label: string
  emoji: string
  advanced: boolean
}

interface ReactionGroup {
  category: string
  label: string
  exclusive: boolean
  advanced: boolean
  reactions: ReactionDef[]
}

interface ItineraryVersion {
  id: string
  version: number
  changeLog?: string
  createdAt?: string
}

interface ItineraryFeedbackSectionProps {
  user: any
  isLeader: boolean
  viewerIsReadOnly: boolean
  latestVersion: ItineraryVersion
  // Feedback state
  feedback: Feedback[]
  loadingFeedback: boolean
  showFeedbackForm: boolean
  setShowFeedbackForm: (show: boolean) => void
  newFeedback: { type: string; target: string; message: string }
  setNewFeedback: (feedback: { type: string; target: string; message: string }) => void
  submittingFeedback: boolean
  newFeedbackCount: number
  feedbackTypes: { value: string; label: string }[]
  // Reactions state
  reactions: Reaction[]
  reactionGroups: ReactionGroup[]
  reactionCounts: Map<string, number>
  userReactions: (string | null)[]
  reactingChip: string | null
  reactingAction: 'adding' | 'removing' | null
  showAdvancedPreferences: boolean
  setShowAdvancedPreferences: (show: boolean) => void
  // Version revision
  canRevise: boolean
  versionCount: number
  maxVersions: number
  revising: boolean
  reviseButtonEnabled: boolean
  llmDisabled: boolean
  llmDisabledMessage: string | null
  generatingMsgIndex: number
  progressMessages: string[]
  // Callbacks
  onSubmitFeedback: () => void
  onQuickReaction: (reactionId: string, category: string) => void
  onReviseItinerary: () => void
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))

  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`
  if (days < 365) return `${Math.floor(days / 30)} months ago`
  return `${Math.floor(days / 365)} years ago`
}

export function ItineraryFeedbackSection({
  user,
  isLeader,
  viewerIsReadOnly,
  latestVersion,
  feedback,
  loadingFeedback,
  showFeedbackForm,
  setShowFeedbackForm,
  newFeedback,
  setNewFeedback,
  submittingFeedback,
  newFeedbackCount,
  feedbackTypes,
  reactions,
  reactionGroups,
  reactionCounts,
  userReactions,
  reactingChip,
  reactingAction,
  showAdvancedPreferences,
  setShowAdvancedPreferences,
  canRevise,
  versionCount,
  maxVersions,
  revising,
  reviseButtonEnabled,
  llmDisabled,
  llmDisabledMessage,
  generatingMsgIndex,
  progressMessages,
  onSubmitFeedback,
  onQuickReaction,
  onReviseItinerary
}: ItineraryFeedbackSectionProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageCircle className="h-5 w-5" />
              Feedback
            </CardTitle>
            <CardDescription>
              React to v{latestVersion.version} or add detailed feedback
            </CardDescription>
          </div>
          {isLeader && (
            <div className="flex flex-col items-end gap-1">
              {!canRevise ? (
                <p className="text-xs text-brand-carbon/60">
                  Maximum {maxVersions} versions reached
                </p>
              ) : newFeedbackCount > 0 || reactions.length > 0 ? (
                <p className="text-xs text-brand-carbon/60">
                  {newFeedbackCount > 0 && `${newFeedbackCount} feedback`}
                  {newFeedbackCount > 0 && reactions.length > 0 && ', '}
                  {reactions.length > 0 && `${reactions.length} reaction${reactions.length !== 1 ? 's' : ''}`}
                  {' '}since v{latestVersion.version}
                </p>
              ) : (
                <p className="text-xs text-brand-carbon/40">Waiting for feedback or reactions</p>
              )}
              {canRevise && versionCount < maxVersions && (
                <p className="text-xs text-brand-carbon/40">
                  {maxVersions - versionCount} revision{maxVersions - versionCount !== 1 ? 's' : ''} remaining
                </p>
              )}
              {llmDisabledMessage && (
                <p className="text-xs text-amber-700">{llmDisabledMessage}</p>
              )}
              <Button
                onClick={onReviseItinerary}
                disabled={!reviseButtonEnabled || llmDisabled}
                size="sm"
                variant="outline"
              >
                {revising ? (
                  <>
                    <BrandedSpinner size="sm" className="mr-2" />
                    {progressMessages[generatingMsgIndex]}
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Revise
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Quick Reactions */}
        <div className="space-y-3">
          {reactionGroups.filter(
            (group) => !group.advanced || showAdvancedPreferences
          ).map((group) => (
            <div key={group.category}>
              <p className="text-xs font-medium text-brand-carbon/80 mb-2">{group.label}</p>
              <div className="flex flex-wrap gap-2">
                {group.reactions
                  .filter((rx) => !rx.advanced || showAdvancedPreferences)
                  .map((reaction) => {
                    const isReacting = reactingChip === reaction.id
                    const isDisabled = reactingChip !== null || viewerIsReadOnly
                    const reactionCount = reactionCounts.get(reaction.id) || 0
                    const userHasReaction = reactions.some(
                      (r) => r.userId === user?.id && r.reactionKey === reaction.id
                    )
                    const reactedUsers = reactions
                      .filter((r) => r.reactionKey === reaction.id)
                      .map((r) => r.user?.name || 'Unknown')

                    return (
                      <div key={reaction.id} className="flex flex-col items-start">
                        <Button
                          variant={userHasReaction ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => onQuickReaction(reaction.id, group.category)}
                          disabled={isDisabled}
                          className="text-xs h-9 md:h-8"
                          title={reactedUsers.length > 0 ? `Voted by: ${reactedUsers.join(', ')}` : undefined}
                        >
                          {isReacting ? (
                            <>
                              <span className="mr-1">OK</span>
                              {reactingAction === 'adding' ? 'Added!' : 'Removed!'}
                            </>
                          ) : (
                            <>
                              <span className="mr-1">{reaction.emoji}</span>
                              {reaction.label}
                              {reactionCount > 0 && (
                                <span className="ml-1 text-brand-carbon/60">({reactionCount})</span>
                              )}
                            </>
                          )}
                        </Button>
                        {reactedUsers.length > 0 && (
                          <p className="text-xs text-brand-carbon/60 mt-0.5 pl-1">
                            {reactedUsers.length <= 2
                              ? reactedUsers.join(', ')
                              : `${reactedUsers.slice(0, 2).join(', ')} +${reactedUsers.length - 2}`}
                          </p>
                        )}
                      </div>
                    )
                  })}
              </div>
            </div>
          ))}

          <button
            onClick={() => setShowAdvancedPreferences(!showAdvancedPreferences)}
            className="text-xs text-brand-carbon/70 hover:text-brand-carbon underline"
          >
            {showAdvancedPreferences ? 'Fewer preferences' : 'More preferences'}
          </button>

          {userReactions.length > 0 && (
            <p className="text-xs text-brand-carbon/60 pt-2 border-t">
              Your selections: {userReactions.join(', ')}
            </p>
          )}
        </div>

        {/* Feedback List */}
        <div className="pt-2 border-t">
          <p className="text-xs font-medium text-brand-carbon/60 mb-2">Feedback History</p>
          <ScrollArea className="h-[150px] md:h-[200px]">
            {loadingFeedback ? (
              <div className="space-y-3 py-2">
                {[1, 2].map(i => (
                  <div key={i} className="flex items-start gap-3 px-2">
                    <Skeleton className="h-6 w-6 rounded-full shrink-0 mt-0.5" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3 w-20" />
                      <Skeleton className="h-4 w-full" />
                    </div>
                  </div>
                ))}
              </div>
            ) : feedback.length === 0 ? (
              <p className="text-center text-brand-carbon/60 py-6 text-sm">
                No feedback yet — be the first!
              </p>
            ) : (
              <div className="space-y-2 pr-2">
                {feedback.map((fb) => (
                  <div key={fb.id} className="p-2.5 bg-brand-sand/30 rounded-lg border">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium">{fb.author?.name || 'Anonymous'}</span>
                      <Badge variant="secondary" className="text-xs">
                        {feedbackTypes.find((t) => t.value === fb.type)?.label || fb.type}
                      </Badge>
                    </div>
                    {fb.target && (
                      <p className="text-xs text-brand-carbon/60 mb-1">Target: {fb.target}</p>
                    )}
                    <p className="text-sm text-brand-carbon/80">{fb.message}</p>
                    <p className="text-xs text-brand-carbon/40 mt-1">{formatDate(fb.createdAt)}</p>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Add Feedback Form */}
        <Collapsible open={showFeedbackForm} onOpenChange={setShowFeedbackForm}>
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs"
              disabled={viewerIsReadOnly}
            >
              <ChevronDown
                className={`h-4 w-4 mr-1 transition-transform ${showFeedbackForm ? 'rotate-180' : ''}`}
              />
              {showFeedbackForm ? 'Hide form' : 'Add detailed feedback'}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="space-y-2 pt-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Select
                  value={newFeedback.type}
                  onValueChange={(v) => setNewFeedback({ ...newFeedback, type: v })}
                >
                  <SelectTrigger className="text-sm h-9">
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent>
                    {feedbackTypes.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={newFeedback.target}
                  onChange={(e) => setNewFeedback({ ...newFeedback, target: e.target.value })}
                  placeholder="Which part? e.g. Day 2, hotels (optional)"
                  className="text-sm h-9"
                  disabled={viewerIsReadOnly}
                />
              </div>
              <Textarea
                value={newFeedback.message}
                onChange={(e) => setNewFeedback({ ...newFeedback, message: e.target.value })}
                placeholder="Your feedback..."
                className="text-sm min-h-[70px] resize-none"
                disabled={viewerIsReadOnly}
              />
              <Button
                onClick={onSubmitFeedback}
                disabled={submittingFeedback || !newFeedback.message.trim() || viewerIsReadOnly}
                className="w-full"
                size="sm"
              >
                {submittingFeedback ? 'Adding...' : 'Add feedback'}
              </Button>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  )
}
