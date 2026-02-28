'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Skeleton } from '@/components/ui/skeleton'
import {
  ListTodo,
  MapPin,
  Calendar as CalendarIcon,
  CalendarPlus,
  Sparkles,
  AlertTriangle
} from 'lucide-react'
import { BrandedSpinner } from '@/components/common/BrandedSpinner'

interface ItineraryDay {
  date: string
  title?: string
  blocks?: ItineraryBlock[]
  areaFocus?: string
  groupFit?: string
}

interface ItineraryBlock {
  timeRange: string
  title: string
  description?: string
  location?: string
  estCost?: string
  transitNotes?: string
  tags?: string[]
  reservation?: { needed?: boolean; notes?: string }
}

interface ItineraryVersion {
  id: string
  version: number
  changeLog?: string
  createdAt?: string
  content?: {
    overview?: {
      pace?: string
      budget?: string
      notes?: string
    }
    days?: ItineraryDay[]
  }
  llmMeta?: {
    ideaCount?: number
    feedbackCount?: number
    reactionCount?: number
    chatMessageCount?: number
    chatBriefEnabled?: boolean
    chatBriefSucceeded?: boolean
  }
}

interface GroupedIdeas {
  travelerId: string
  travelerName: string
  ideas: any[]
  count: number
}

interface ItineraryEditorPanelProps {
  trip: any
  isLeader: boolean
  destinationHint: string
  ideas: any[]
  groupedIdeas: GroupedIdeas[]
  // Version state
  allVersions: ItineraryVersion[]
  selectedVersionIdx: number
  setSelectedVersionIdx: (idx: number) => void
  latestVersion: ItineraryVersion | null
  selectedVersion: ItineraryVersion | null
  isViewingLatest: boolean
  loadingVersions: boolean
  maxVersions: number
  canRevise: boolean
  // Generation state
  generating: boolean
  llmDisabled: boolean
  llmDisabledMessage: string | null
  generatingMsgIndex: number
  progressMessages: string[]
  viewerIsReadOnly: boolean
  // Callbacks
  onGenerateClick: () => void
  onExportICS: () => void
}

function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function ItineraryEditorPanel({
  trip,
  isLeader,
  destinationHint,
  ideas,
  groupedIdeas,
  allVersions,
  selectedVersionIdx,
  setSelectedVersionIdx,
  latestVersion,
  selectedVersion,
  isViewingLatest,
  loadingVersions,
  maxVersions,
  canRevise,
  generating,
  llmDisabled,
  llmDisabledMessage,
  generatingMsgIndex,
  progressMessages,
  viewerIsReadOnly,
  onGenerateClick,
  onExportICS
}: ItineraryEditorPanelProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <ListTodo className="h-5 w-5" />
              Itinerary
            </CardTitle>
            {latestVersion && (
              <div className="flex flex-col gap-1.5 mt-1">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">
                    Version {selectedVersion?.version || latestVersion.version} of {maxVersions}
                  </Badge>
                  {!canRevise && isViewingLatest && (
                    <Badge variant="secondary" className="text-xs bg-brand-sand text-brand-carbon">
                      Final
                    </Badge>
                  )}
                  {!isViewingLatest && (
                    <Badge variant="secondary" className="text-xs">
                      Viewing older version
                    </Badge>
                  )}
                </div>
                {/* llmMeta transparency — what inputs were used */}
                {selectedVersion?.llmMeta && (
                  <p className="text-xs text-brand-carbon/60">
                    Based on {selectedVersion.llmMeta.ideaCount || 0} idea{(selectedVersion.llmMeta.ideaCount || 0) !== 1 ? 's' : ''}
                    {(selectedVersion.llmMeta.feedbackCount || 0) > 0 && (
                      <>, {selectedVersion.llmMeta.feedbackCount} feedback</>
                    )}
                    {(selectedVersion.llmMeta.reactionCount || 0) > 0 && (
                      <>, {selectedVersion.llmMeta.reactionCount} reaction{selectedVersion.llmMeta.reactionCount !== 1 ? 's' : ''}</>
                    )}
                    {selectedVersion.llmMeta.chatBriefSucceeded && (
                      <> + chat context</>
                    )}
                  </p>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {selectedVersion && trip?.lockedStartDate && (
              <Button
                variant="outline"
                size="sm"
                onClick={onExportICS}
                className="text-brand-blue border-brand-blue hover:bg-brand-blue/5"
              >
                <CalendarPlus className="h-4 w-4 mr-1" />
                Add to Calendar
              </Button>
            )}
            {isLeader && !latestVersion && !viewerIsReadOnly && (
              <Button
                onClick={onGenerateClick}
                disabled={generating || llmDisabled}
                size="sm"
              >
                {generating ? (
                  <>
                    <BrandedSpinner size="sm" className="mr-2" />
                    {progressMessages[generatingMsgIndex]}
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Generate
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Version picker tabs */}
        {allVersions.length > 1 && (
          <div className="flex gap-1 mb-3 pb-3 border-b">
            {allVersions.map((v, idx) => (
              <button
                key={v.id}
                onClick={() => setSelectedVersionIdx(idx)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  selectedVersionIdx === idx
                    ? 'bg-brand-blue text-white'
                    : 'bg-brand-sand/50 text-brand-carbon/70 hover:bg-brand-sand/70'
                }`}
              >
                v{v.version}
                {idx === allVersions.length - 1 && ' (latest)'}
              </button>
            ))}
          </div>
        )}

        <ScrollArea className="h-[250px] md:h-[350px]">
          {loadingVersions ? (
            <div className="space-y-4 py-2 px-2">
              {[1, 2].map(day => (
                <div key={day} className="space-y-2">
                  <Skeleton className="h-5 w-20" />
                  {[1, 2, 3].map(item => (
                    <div key={item} className="flex items-center gap-3 pl-2">
                      <Skeleton className="h-4 w-4 rounded shrink-0" />
                      <Skeleton className="h-4 w-full max-w-[200px]" />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ) : !latestVersion ? (
            <div className="py-6">
              {/* "What Tripti will use" panel — pre-generate transparency */}
              {isLeader ? (
                <div className="space-y-3">
                  <div className="text-center mb-4">
                    <ListTodo className="h-10 w-10 text-brand-carbon/40 mx-auto mb-2" />
                    <p className="text-brand-carbon/60 text-sm">No itinerary generated yet</p>
                  </div>
                  <div className="rounded-lg border border-brand-sand bg-brand-sand/30 p-3">
                    <p className="text-xs font-semibold text-brand-carbon mb-2">What Tripti will use to generate</p>
                    <div className="space-y-1.5 text-xs text-brand-carbon/80">
                      <div className="flex items-center justify-between">
                        <span>Destination</span>
                        <span className={`font-medium ${destinationHint ? 'text-brand-carbon' : 'text-brand-carbon/40 italic'}`}>
                          {destinationHint || 'Not set'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Trip dates</span>
                        <span className="font-medium">
                          {trip?.lockedStartDate && trip?.lockedEndDate
                            ? `${new Date(trip.lockedStartDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date(trip.lockedEndDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                            : 'Not locked'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Ideas</span>
                        <span className={`font-medium ${ideas.length > 0 ? 'text-brand-carbon' : 'text-brand-carbon/40 italic'}`}>
                          {ideas.length > 0
                            ? `${ideas.length} from ${groupedIdeas.length} traveler${groupedIdeas.length !== 1 ? 's' : ''}`
                            : 'None yet'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Group size</span>
                        <span className="font-medium">{trip?.activeTravelerCount || trip?.memberCount || '–'} travelers</span>
                      </div>
                    </div>
                  </div>
                  {llmDisabledMessage && (
                    <div className="inline-flex items-center gap-2 text-xs text-amber-700">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      <span>{llmDisabledMessage}</span>
                    </div>
                  )}
                  {generating && (
                    <p className="text-xs text-brand-carbon/60 text-center">{progressMessages[generatingMsgIndex]}</p>
                  )}
                </div>
              ) : (
                <div className="text-center py-4">
                  <ListTodo className="h-10 w-10 text-brand-carbon/40 mx-auto mb-3" />
                  <p className="text-brand-carbon/60 mb-2 text-sm">No itinerary generated yet</p>
                  <p className="text-xs text-brand-carbon/40">
                    The leader will generate an itinerary once ideas are in.
                  </p>
                </div>
              )}
            </div>
          ) : selectedVersion ? (
            <div className="space-y-4">
              {/* Changelog — prominent banner for v2+ */}
              {selectedVersion.changeLog && selectedVersion.version > 1 && (
                <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                  <p className="text-xs font-semibold text-amber-800 mb-1">
                    What changed in v{selectedVersion.version}
                  </p>
                  <p className="text-sm text-amber-900/80">{selectedVersion.changeLog}</p>
                </div>
              )}

              {/* Overview */}
              {selectedVersion.content?.overview && (
                <div className="p-3 bg-brand-blue/5 rounded-lg border border-brand-blue/20">
                  <p className="text-xs font-medium mb-1">Overview</p>
                  <p className="text-xs text-brand-carbon/70">
                    Pace: {selectedVersion.content.overview.pace} | Budget:{' '}
                    {selectedVersion.content.overview.budget}
                  </p>
                  {selectedVersion.content.overview.notes && (
                    <p className="text-xs text-brand-carbon/70 mt-1">
                      {selectedVersion.content.overview.notes}
                    </p>
                  )}
                </div>
              )}

              {/* Days */}
              {selectedVersion.content?.days && (
                <Accordion type="multiple" className="w-full">
                  {selectedVersion.content.days.map((day, dayIdx) => (
                    <AccordionItem key={dayIdx} value={`day-${dayIdx}`}>
                      <AccordionTrigger className="hover:no-underline py-2">
                        <div className="flex items-center gap-2">
                          <CalendarIcon className="h-4 w-4" />
                          <span className="font-medium text-sm">
                            {parseLocalDate(day.date).toLocaleDateString('en-US', {
                              weekday: 'short',
                              month: 'short',
                              day: 'numeric'
                            })}
                          </span>
                          {day.title && (
                            <span className="text-xs text-brand-carbon/60">- {day.title}</span>
                          )}
                          {day.areaFocus && (
                            <span className="text-xs text-brand-blue ml-1">· {day.areaFocus}</span>
                          )}
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-2 pt-1">
                          {day.blocks && day.blocks.length > 0 ? (
                            day.blocks.map((block, blockIdx) => (
                              <div
                                key={blockIdx}
                                className="border rounded-lg p-2.5 bg-brand-sand/30"
                              >
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-xs font-medium text-[#FA3823]">
                                    {block.timeRange}
                                  </span>
                                  {block.tags?.map((tag, tagIdx) => (
                                    <Badge key={tagIdx} variant="secondary" className="text-xs">
                                      {tag}
                                    </Badge>
                                  ))}
                                </div>
                                <p className="font-medium text-sm">{block.title}</p>
                                {block.description && (
                                  <p className="text-xs text-brand-carbon/70 mt-0.5">
                                    {block.description}
                                  </p>
                                )}
                                {block.location && (
                                  <p className="text-xs text-brand-blue mt-1 flex items-center gap-1">
                                    <MapPin className="h-3 w-3" />
                                    {block.location}
                                  </p>
                                )}
                                {block.estCost && (
                                  <p className="text-xs text-green-600 mt-0.5">
                                    Est. {block.estCost}
                                  </p>
                                )}
                                {block.transitNotes && (
                                  <p className="text-xs text-brand-carbon/60 mt-0.5 italic">
                                    Transit: {block.transitNotes}
                                  </p>
                                )}
                                {block.reservation?.needed && (
                                  <p className="text-xs text-amber-600 mt-0.5">
                                    Reservation{block.reservation.notes ? `: ${block.reservation.notes}` : ' recommended'}
                                  </p>
                                )}
                              </div>
                            ))
                          ) : (
                            <p className="text-xs text-brand-carbon/40 italic">No activities planned</p>
                          )}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              )}
            </div>
          ) : null}
        </ScrollArea>
      </CardContent>
    </Card>
  )
}
