'use client'

import { Badge } from '@/components/ui/badge'

interface ItineraryVersion {
  id: string
  version: number
  changeLog?: string
  createdAt?: string
  llmMeta?: {
    ideaCount?: number
    feedbackCount?: number
    reactionCount?: number
    chatMessageCount?: number
    chatBriefEnabled?: boolean
    chatBriefSucceeded?: boolean
  }
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

interface ItineraryVersionHistoryProps {
  allVersions: ItineraryVersion[]
  selectedVersionIdx: number
  onSelectVersion: (idx: number) => void
  canRevise: boolean
  maxVersions: number
}

export function ItineraryVersionHistory({
  allVersions,
  selectedVersionIdx,
  onSelectVersion,
  canRevise,
  maxVersions
}: ItineraryVersionHistoryProps) {
  if (allVersions.length === 0) return null

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-brand-carbon/60">Version History</p>
      <div className="space-y-1.5">
        {allVersions.map((version, idx) => {
          const isSelected = selectedVersionIdx === idx
          const isLatest = idx === allVersions.length - 1
          const isFinal = isLatest && !canRevise

          return (
            <button
              key={version.id}
              onClick={() => onSelectVersion(idx)}
              className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
                isSelected
                  ? 'bg-brand-blue/5 border-brand-blue/20'
                  : 'bg-white border-transparent hover:bg-brand-sand/30'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">
                  v{version.version}
                </span>
                {isLatest && (
                  <Badge variant="outline" className="text-xs">
                    Latest
                  </Badge>
                )}
                {isFinal && (
                  <Badge variant="secondary" className="text-xs bg-brand-sand text-brand-carbon">
                    Final
                  </Badge>
                )}
                {version.createdAt && (
                  <span className="text-xs text-brand-carbon/40 ml-auto">
                    {formatDate(version.createdAt)}
                  </span>
                )}
              </div>
              {version.changeLog && (
                <p className="text-xs text-brand-carbon/60 mt-0.5 line-clamp-1">
                  {version.changeLog}
                </p>
              )}
              {version.llmMeta && (
                <p className="text-xs text-brand-carbon/40 mt-0.5">
                  {version.llmMeta.ideaCount || 0} ideas
                  {(version.llmMeta.feedbackCount || 0) > 0 && `, ${version.llmMeta.feedbackCount} feedback`}
                  {(version.llmMeta.reactionCount || 0) > 0 && `, ${version.llmMeta.reactionCount} reactions`}
                </p>
              )}
            </button>
          )
        })}
      </div>
      {!canRevise && (
        <p className="text-xs text-brand-carbon/40 text-center">
          Maximum {maxVersions} versions reached
        </p>
      )}
    </div>
  )
}
