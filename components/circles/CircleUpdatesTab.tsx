'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, UserPlus, Vote, Lock, CheckCircle2, Circle, ChevronRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { BrandedSpinner } from '@/app/HomeClient'
import { tripHref } from '@/lib/navigation/routes'

interface CircleUpdatesTabProps {
  circleId: string
  token: string
}

interface Update {
  id: string
  type: string
  timestamp: string
  tripId?: string
  tripName?: string
  circleName?: string
  actorId?: string
  actorName?: string
  message?: string
}

function getUpdateIcon(type: string) {
  switch (type) {
    case 'trip_created':
    case 'circle_created':
      return <Plus className="h-3.5 w-3.5" />
    case 'circle_member_joined':
    case 'user_joined':
      return <UserPlus className="h-3.5 w-3.5" />
    case 'user_voted':
      return <Vote className="h-3.5 w-3.5" />
    case 'dates_locked':
      return <Lock className="h-3.5 w-3.5" />
    case 'itinerary_finalized':
      return <CheckCircle2 className="h-3.5 w-3.5" />
    default:
      return <Circle className="h-3.5 w-3.5" />
  }
}

function formatTimestamp(timestamp: string) {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function getActionText(update: Update) {
  if (update.actorName) {
    switch (update.type) {
      case 'trip_created':
      case 'circle_created':
        return `${update.actorName} created`
      case 'circle_member_joined':
      case 'user_joined':
        return `${update.actorName} joined`
      case 'user_voted':
        return `${update.actorName} voted on dates`
      default:
        return update.message || update.actorName
    }
  }
  switch (update.type) {
    case 'dates_locked':
      return 'Dates locked'
    case 'itinerary_finalized':
      return 'Itinerary finalized'
    default:
      return update.message || ''
  }
}

function groupUpdatesByDay(updates: Update[]) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  const groups: { today: Update[]; yesterday: Update[]; earlier: Update[] } = {
    today: [],
    yesterday: [],
    earlier: [],
  }

  updates.forEach((update) => {
    if (!update.timestamp) {
      groups.earlier.push(update)
      return
    }
    const d = new Date(update.timestamp)
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate())

    if (day.getTime() === today.getTime()) groups.today.push(update)
    else if (day.getTime() === yesterday.getTime()) groups.yesterday.push(update)
    else groups.earlier.push(update)
  })

  return groups
}

export function CircleUpdatesTab({ circleId, token }: CircleUpdatesTabProps) {
  const router = useRouter()
  const [updates, setUpdates] = useState<Update[]>([])
  const [loading, setLoading] = useState(true)

  const fetchUpdates = useCallback(async () => {
    try {
      const res = await fetch(`/api/circles/${circleId}/updates`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setUpdates(data)
      }
    } catch {
      // Silently fail on polling errors
    } finally {
      setLoading(false)
    }
  }, [circleId, token])

  useEffect(() => {
    fetchUpdates()
    const interval = setInterval(fetchUpdates, 30000)
    return () => clearInterval(interval)
  }, [fetchUpdates])

  const handleClick = (update: Update) => {
    const currentUrl = typeof window !== 'undefined'
      ? window.location.pathname + window.location.search
      : '/dashboard'
    const returnTo = encodeURIComponent(currentUrl)

    const hasMemberTarget =
      (update.type === 'circle_member_joined' || update.type === 'circle_created') &&
      update.actorId
    if (hasMemberTarget) {
      router.push(`/members/${update.actorId}?returnTo=${returnTo}`)
      return
    }
    if (update.tripId) {
      router.push(`${tripHref(update.tripId)}?tab=chat`)
    }
  }

  const grouped = groupUpdatesByDay(updates)

  const renderSection = (label: string, items: Update[], marginTop: boolean) => {
    if (items.length === 0) return null
    return (
      <div className={marginTop ? 'mt-4' : ''}>
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2 px-1">
          {label}
        </p>
        <div className="space-y-2">
          {items.map((update) => {
            const isStageTransition = update.type === 'dates_locked' || update.type === 'itinerary_finalized'
            const iconColor = isStageTransition ? 'text-brand-blue' : 'text-gray-400'
            const hasTripTarget = Boolean(update.tripId)
            const hasMemberTarget =
              (update.type === 'circle_member_joined' || update.type === 'circle_created') &&
              update.actorId
            const isClickable = hasTripTarget || hasMemberTarget
            const contextLabel = update.tripName || update.circleName || ''

            return (
              <div
                key={update.id}
                onClick={() => isClickable && handleClick(update)}
                className={`p-3 rounded-md border border-gray-200 transition-all ${
                  isClickable ? 'hover:bg-gray-50 hover:border-gray-300 cursor-pointer' : ''
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 flex-shrink-0 ${iconColor}`}>
                    {getUpdateIcon(update.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${isStageTransition ? 'text-brand-blue' : 'text-gray-900'}`}>
                      {getActionText(update)}
                    </p>
                    {contextLabel && (
                      <p className="text-xs text-gray-600 mt-0.5">{contextLabel}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-1">
                      {formatTimestamp(update.timestamp)}
                    </p>
                  </div>
                  {isClickable && (
                    <ChevronRight className="h-4 w-4 text-gray-300 ml-2 flex-shrink-0 mt-0.5" />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Circle Updates</CardTitle>
        <CardDescription className="text-xs">Recent activity across trips in this circle.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col px-4 pb-4">
        <div className="max-h-[60vh] md:max-h-[450px] overflow-y-auto pr-2">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <BrandedSpinner size="lg" />
            </div>
          ) : updates.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm text-gray-500">
                No updates yet. Activity will appear here as the circle grows.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {renderSection('Today', grouped.today, false)}
              {renderSection('Yesterday', grouped.yesterday, grouped.today.length > 0)}
              {renderSection('Earlier', grouped.earlier, grouped.today.length > 0 || grouped.yesterday.length > 0)}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
