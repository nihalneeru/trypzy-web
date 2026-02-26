'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Lightbulb,
  MessageCircle,
  Save,
  X,
  Heart,
  Edit2,
  AlertTriangle
} from 'lucide-react'

interface Idea {
  id: string
  text: string
  authorUserId?: string
  authorId?: string
  userId?: string
  author?: {
    name: string
    id?: string
  }
  likeCount?: number
  userLiked?: boolean
  createdAt?: string
}

interface GroupedIdeas {
  travelerId: string
  travelerName: string
  ideas: Idea[]
  count: number
}

interface ItineraryIdeasSectionProps {
  trip: any
  user: any
  isLeader: boolean
  viewerIsReadOnly: boolean
  readOnlyReason: string | null
  maxIdeasPerUser: number
  maxIdeaLength: number
  // Ideas state
  ideas: Idea[]
  loadingIdeas: boolean
  ideasError: string | null
  newIdeaText: string
  setNewIdeaText: (text: string) => void
  addingIdea: boolean
  userIdeaCount: number
  groupedIdeas: GroupedIdeas[]
  // Destination hint state
  editingDestinationHint: boolean
  setEditingDestinationHint: (editing: boolean) => void
  destinationHintValue: string
  setDestinationHintValue: (value: string) => void
  savingDestinationHint: boolean
  // Callbacks
  onAddIdea: () => void
  onLikeIdea: (ideaId: string) => void
  onSaveDestinationHint: () => void
  onCancelDestinationHint: () => void
  onRetryLoadIdeas: () => void
  onQuoteToChat?: (quote: string) => void
}

export function ItineraryIdeasSection({
  trip,
  user,
  isLeader,
  viewerIsReadOnly,
  readOnlyReason,
  maxIdeasPerUser,
  maxIdeaLength,
  ideas,
  loadingIdeas,
  ideasError,
  newIdeaText,
  setNewIdeaText,
  addingIdea,
  userIdeaCount,
  groupedIdeas,
  editingDestinationHint,
  setEditingDestinationHint,
  destinationHintValue,
  setDestinationHintValue,
  savingDestinationHint,
  onAddIdea,
  onLikeIdea,
  onSaveDestinationHint,
  onCancelDestinationHint,
  onRetryLoadIdeas,
  onQuoteToChat
}: ItineraryIdeasSectionProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Lightbulb className="h-5 w-5 text-yellow-500" />
          Activity Ideas
        </CardTitle>
        <CardDescription>
          Share up to {maxIdeasPerUser} activity ideas
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Destination Hint (Leader only, not on completed trips) */}
        {(trip?.destinationHint || (isLeader && !viewerIsReadOnly)) && (
          <div className="pb-3 border-b">
            <p className="text-xs font-medium text-brand-carbon/60 mb-1">Destination</p>
            {editingDestinationHint && isLeader && !viewerIsReadOnly ? (
              <div className="space-y-2">
                <Input
                  value={destinationHintValue}
                  onChange={(e) => setDestinationHintValue(e.target.value)}
                  placeholder="e.g., Kenya (Nairobi + Maasai Mara)"
                  className="text-sm"
                  disabled={savingDestinationHint}
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="default"
                    onClick={onSaveDestinationHint}
                    disabled={savingDestinationHint}
                    className="h-7"
                  >
                    <Save className="h-3 w-3 mr-1" />
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={onCancelDestinationHint}
                    disabled={savingDestinationHint}
                    className="h-7"
                  >
                    <X className="h-3 w-3 mr-1" />
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div
                className={`flex items-start justify-between gap-2${isLeader && !viewerIsReadOnly ? ' cursor-pointer hover:bg-brand-sand/30 rounded-md -mx-1 px-1 transition-colors' : ''}`}
                onClick={isLeader && !viewerIsReadOnly ? () => {
                  setDestinationHintValue(trip?.destinationHint || '')
                  setEditingDestinationHint(true)
                } : undefined}
              >
                {trip?.destinationHint ? (
                  <p className="text-sm text-brand-carbon/80 flex-1">{trip.destinationHint}</p>
                ) : (
                  <p className="text-sm text-brand-carbon/40 italic flex-1">No destination set</p>
                )}
                {isLeader && !viewerIsReadOnly && (
                  <Edit2 className="h-3 w-3 text-brand-carbon/40 shrink-0 mt-0.5" />
                )}
              </div>
            )}
          </div>
        )}

        {/* Add Idea Form */}
        {userIdeaCount < maxIdeasPerUser ? (
          <div className="space-y-2">
            <Textarea
              value={newIdeaText}
              onChange={(e) => setNewIdeaText(e.target.value)}
              placeholder={
                viewerIsReadOnly
                  ? readOnlyReason || ''
                  : 'e.g., Visit the local market, Try authentic street food...'
              }
              className="text-sm min-h-[80px]"
              maxLength={maxIdeaLength}
              disabled={viewerIsReadOnly}
            />
            <div className="flex items-center justify-between text-xs text-brand-carbon/60">
              <span>{newIdeaText.length}/{maxIdeaLength} characters</span>
              <span>{userIdeaCount}/{maxIdeasPerUser} ideas added</span>
            </div>
            <Button
              onClick={onAddIdea}
              disabled={viewerIsReadOnly || addingIdea || !newIdeaText.trim()}
              className="w-full"
              size="sm"
            >
              {addingIdea ? 'Adding...' : 'Add idea'}
            </Button>
            {viewerIsReadOnly && readOnlyReason && (
              <p className="text-xs text-brand-carbon/60 text-center mt-1">{readOnlyReason}</p>
            )}
          </div>
        ) : (
          <div className="text-center py-4 px-2 bg-brand-sand/30 rounded-lg border">
            <p className="text-sm text-brand-carbon/70">You've added all {maxIdeasPerUser} ideas</p>
          </div>
        )}

        {/* Ideas List - Grouped by Traveler */}
        <div className="pt-2">
          <p className="text-xs font-medium text-brand-carbon/60 mb-2">All Ideas</p>
          <ScrollArea className="h-[180px] md:h-[250px]">
            {loadingIdeas ? (
              <div className="space-y-3 py-2">
                {[1, 2, 3].map(i => (
                  <div key={i} className="flex items-start gap-3 px-2">
                    <Skeleton className="h-6 w-6 rounded-full shrink-0 mt-0.5" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : ideasError ? (
              <div className="flex flex-col items-center justify-center p-8 text-center">
                <AlertTriangle className="h-10 w-10 text-brand-red mb-3" />
                <p className="text-sm text-brand-carbon/70 mb-4">{ideasError}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onRetryLoadIdeas}
                >
                  Try again
                </Button>
              </div>
            ) : ideas.length === 0 ? (
              <p className="text-center text-brand-carbon/60 py-6 text-sm">
                No ideas yet. Add some activities!
              </p>
            ) : (
              <Accordion type="multiple" className="w-full">
                {groupedIdeas.map((group) => {
                  const isCurrentUser = group.travelerId === user?.id
                  const travelerName = isCurrentUser ? 'You' : group.travelerName
                  const hasEnoughIdeas = group.count >= maxIdeasPerUser

                  return (
                    <AccordionItem key={group.travelerId} value={`traveler-${group.travelerId}`}>
                      <AccordionTrigger className="hover:no-underline py-2">
                        <div className="flex items-center gap-2 flex-1 text-left">
                          <span className="font-medium text-sm">{travelerName}</span>
                          <span className="text-xs text-brand-carbon/60">({group.count}/{maxIdeasPerUser})</span>
                          {hasEnoughIdeas ? (
                            <span className="text-green-600 text-xs">Complete</span>
                          ) : (
                            <span className="text-yellow-600 text-xs">Pending</span>
                          )}
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-2 pt-1">
                          {group.ideas.map((idea) => (
                            <div
                              key={idea.id}
                              className="flex items-start gap-2 p-2 bg-brand-sand/30 rounded-lg border"
                            >
                              <Button
                                size="icon"
                                variant={idea.userLiked ? 'default' : 'ghost'}
                                className="h-7 w-7 flex-shrink-0"
                                onClick={() => onLikeIdea(idea.id)}
                                disabled={viewerIsReadOnly}
                              >
                                <Heart
                                  className={`h-3.5 w-3.5 ${idea.userLiked ? 'text-white fill-white' : ''}`}
                                />
                              </Button>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-brand-carbon">{idea.text}</p>
                                {(idea.likeCount || 0) > 0 && (
                                  <p className="text-xs text-brand-carbon/60 mt-0.5">
                                    {idea.likeCount} {idea.likeCount === 1 ? 'like' : 'likes'}
                                  </p>
                                )}
                              </div>
                              {onQuoteToChat && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7 flex-shrink-0 text-muted-foreground hover:text-brand-blue"
                                  onClick={() => onQuoteToChat(`Re: "${idea.text}" — `)}
                                  title="Discuss in chat"
                                >
                                  <MessageCircle className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  )
                })}
              </Accordion>
            )}
          </ScrollArea>
        </div>
      </CardContent>
    </Card>
  )
}
