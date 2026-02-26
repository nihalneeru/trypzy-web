'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Calendar,
  MapPin,
  Home,
  Users,
  ClipboardList,
  DollarSign,
  CheckCircle2,
  Package,
  Link2,
  Share2,
  Copy,
  Check
} from 'lucide-react'
import { BrandedSpinner } from '@/components/common/BrandedSpinner'
import { Skeleton } from '@/components/ui/skeleton'

// ============================================================================
// Types
// ============================================================================

interface BriefOverlayProps {
  trip: any
  token: string
  user: any
  onRefresh: (updatedTrip?: any) => void
  onClose: () => void
  setHasUnsavedChanges: (has: boolean) => void
}

interface BriefData {
  overview: {
    name: string
    destinationHint: string | null
    lockedStartDate: string | null
    lockedEndDate: string | null
    duration: number | null
    travelerCount: number
    status: string
    stage: string
  }
  accommodation: {
    chosen: { name: string; location: string | null; priceRange: string | null; url: string | null } | null
    optionCount: number
    voteCount: number
  } | null
  dayByDay: Array<{
    date: string
    title: string | null
    blocks: Array<{
      timeRange: string
      activity: string
      notes: string | null
    }>
  }> | null
  decisions: {
    open: any[]
    closed: Array<{
      type: string
      summary: string
      decidedAt: string | null
    }>
  }
  packingReminders: Array<{
    name: string
    scope: string
    assignedTo: string | null
  }>
  expensesSummary: {
    totalAmount: number
    currency: string
    itemCount: number
  } | null
}

// ============================================================================
// Helpers
// ============================================================================

function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function formatCurrency(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount)
  } catch {
    return `${currency} ${amount.toFixed(2)}`
  }
}

// ============================================================================
// Component
// ============================================================================

export function BriefOverlay({
  trip,
  token,
  user,
  onRefresh,
  onClose,
  setHasUnsavedChanges
}: BriefOverlayProps) {
  const [brief, setBrief] = useState<BriefData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Share brief state
  const [briefToken, setBriefToken] = useState<string | null>(trip?.briefToken || null)
  const [shareLoading, setShareLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const isLeader = trip?.createdBy === user?.id

  useEffect(() => {
    if (!trip?.id || !token) return

    async function fetchBrief() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/trips/${trip.id}/brief`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || 'Failed to load brief')
        }
        const data = await res.json()
        setBrief(data)
      } catch (err: any) {
        setError(err.message || 'Something went wrong')
      } finally {
        setLoading(false)
      }
    }

    fetchBrief()
  }, [trip?.id, token])

  // No unsaved changes (read-only overlay)
  useEffect(() => {
    setHasUnsavedChanges(false)
  }, [setHasUnsavedChanges])

  if (loading) {
    return (
      <div className="space-y-4 p-1">
        {[1, 2, 3, 4].map(i => (
          <Card key={i}>
            <CardContent className="pt-4 space-y-3">
              <Skeleton className="h-5 w-1/3" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <p className="text-sm text-brand-carbon/70 mb-2">{error}</p>
        <button
          onClick={() => {
            setError(null)
            setLoading(true)
            fetch(`/api/trips/${trip.id}/brief`, {
              headers: { Authorization: `Bearer ${token}` }
            })
              .then(r => r.json())
              .then(data => setBrief(data))
              .catch(err => setError(err.message))
              .finally(() => setLoading(false))
          }}
          className="text-sm text-brand-blue hover:underline"
        >
          Try again
        </button>
      </div>
    )
  }

  if (!brief) return null

  const { overview, accommodation, dayByDay, decisions, packingReminders, expensesSummary } = brief

  async function handleShareBrief() {
    if (!trip?.id || !token) return
    setShareLoading(true)
    try {
      const res = await fetch(`/api/trips/${trip.id}/brief/share`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) throw new Error('Failed to share brief')
      const data = await res.json()
      setBriefToken(data.briefToken)
      onRefresh?.({ ...trip, briefToken: data.briefToken })
    } catch {
      // silent — user can retry
    } finally {
      setShareLoading(false)
    }
  }

  async function handleRevokeBrief() {
    if (!trip?.id || !token) return
    setShareLoading(true)
    try {
      const res = await fetch(`/api/trips/${trip.id}/brief/share`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) throw new Error('Failed to revoke brief')
      setBriefToken(null)
      setCopied(false)
      onRefresh?.({ ...trip, briefToken: null })
    } catch {
      // silent
    } finally {
      setShareLoading(false)
    }
  }

  function handleCopyLink() {
    if (!briefToken) return
    const url = `${window.location.origin}/t/${briefToken}`
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function handleNativeShare() {
    if (!briefToken) return
    const url = `${window.location.origin}/t/${briefToken}`
    navigator.share?.({
      title: `${overview?.name || trip?.name || 'Trip'} — Brief`,
      text: 'Check out our trip brief on Tripti',
      url
    }).catch(() => {})
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-4 pb-6">

        {/* Share Brief — leader only */}
        {isLeader && (
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-3">
                <Link2 className="h-4 w-4 text-brand-blue shrink-0" />
                <h3 className="text-sm font-semibold text-brand-carbon">Share Brief</h3>
              </div>

              {briefToken ? (
                <div className="space-y-3">
                  <p className="text-xs text-brand-carbon/70">
                    Anyone with this link can view a read-only summary of your trip. No personal details are shared.
                  </p>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 rounded-md bg-brand-sand/50 px-3 py-1.5 text-xs text-brand-carbon/70 truncate font-mono">
                      {typeof window !== 'undefined' ? `${window.location.origin}/t/${briefToken}` : `/t/${briefToken}`}
                    </div>
                    <button
                      onClick={handleCopyLink}
                      className="shrink-0 p-1.5 rounded-md hover:bg-brand-sand/50 transition-colors"
                      title="Copy link"
                    >
                      {copied ? (
                        <Check className="h-4 w-4 text-green-600" />
                      ) : (
                        <Copy className="h-4 w-4 text-brand-carbon/60" />
                      )}
                    </button>
                    {typeof navigator !== 'undefined' && navigator.share && (
                      <button
                        onClick={handleNativeShare}
                        className="shrink-0 p-1.5 rounded-md hover:bg-brand-sand/50 transition-colors"
                        title="Share"
                      >
                        <Share2 className="h-4 w-4 text-brand-blue" />
                      </button>
                    )}
                  </div>
                  <button
                    onClick={handleRevokeBrief}
                    disabled={shareLoading}
                    className="text-xs text-brand-red hover:underline disabled:opacity-50"
                  >
                    {shareLoading ? 'Revoking...' : 'Revoke link'}
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-brand-carbon/70">
                    Create a shareable link so anyone can view a read-only summary of this trip.
                  </p>
                  <button
                    onClick={handleShareBrief}
                    disabled={shareLoading}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-brand-blue text-white text-xs font-medium hover:bg-brand-blue/90 transition-colors disabled:opacity-50"
                  >
                    <Link2 className="h-3.5 w-3.5" />
                    {shareLoading ? 'Creating...' : 'Create shareable link'}
                  </button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Overview Card */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-3">
              <MapPin className="h-4 w-4 text-brand-blue shrink-0" />
              <h3 className="text-sm font-semibold text-brand-carbon">Overview</h3>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-brand-carbon">{overview.name}</p>
              {overview.destinationHint && (
                <p className="text-xs text-brand-carbon/70">{overview.destinationHint}</p>
              )}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-brand-carbon/70">
                {overview.lockedStartDate && overview.lockedEndDate ? (
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {parseLocalDate(overview.lockedStartDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    {' – '}
                    {parseLocalDate(overview.lockedEndDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    {overview.duration !== null && ` (${overview.duration} day${overview.duration !== 1 ? 's' : ''})`}
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-brand-carbon/40 italic">
                    <Calendar className="h-3 w-3" />
                    Dates not locked yet
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {overview.travelerCount} traveler{overview.travelerCount !== 1 ? 's' : ''}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Decisions Card */}
        {decisions.closed.length > 0 && (
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 className="h-4 w-4 text-brand-blue shrink-0" />
                <h3 className="text-sm font-semibold text-brand-carbon">Decisions</h3>
              </div>
              <div className="space-y-2">
                {decisions.closed.map((d, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-brand-carbon/80">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                    <span className="font-medium">{d.type === 'dates_locked' ? 'Dates locked' : d.type}:</span>
                    <span>{d.summary}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Accommodation Card */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-3">
              <Home className="h-4 w-4 text-brand-blue shrink-0" />
              <h3 className="text-sm font-semibold text-brand-carbon">Accommodation</h3>
            </div>
            {accommodation ? (
              <div className="space-y-2">
                {accommodation.chosen ? (
                  <div>
                    <p className="text-sm font-medium text-brand-carbon">{accommodation.chosen.name}</p>
                    {accommodation.chosen.location && (
                      <p className="text-xs text-brand-carbon/70">{accommodation.chosen.location}</p>
                    )}
                    {accommodation.chosen.priceRange && (
                      <p className="text-xs text-brand-carbon/60">{accommodation.chosen.priceRange}</p>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-brand-carbon/60">
                    {accommodation.optionCount} option{accommodation.optionCount !== 1 ? 's' : ''} proposed
                    {accommodation.voteCount > 0 && `, ${accommodation.voteCount} vote${accommodation.voteCount !== 1 ? 's' : ''}`}
                  </p>
                )}
              </div>
            ) : (
              <div className="rounded-md bg-brand-sand/40 px-3 py-2">
                <p className="text-xs text-brand-carbon/60">Not yet chosen</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Day-by-Day Card */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-3">
              <ClipboardList className="h-4 w-4 text-brand-blue shrink-0" />
              <h3 className="text-sm font-semibold text-brand-carbon">Day-by-Day</h3>
            </div>
            {dayByDay && dayByDay.length > 0 ? (
              <div className="space-y-3">
                {dayByDay.map((day, dayIdx) => (
                  <div key={dayIdx}>
                    <p className="text-xs font-semibold text-brand-carbon mb-1">
                      {parseLocalDate(day.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                      {day.title && ` — ${day.title}`}
                    </p>
                    {day.blocks.length > 0 ? (
                      <div className="space-y-1 pl-3 border-l-2 border-brand-sand">
                        {day.blocks.map((block, blockIdx) => (
                          <div key={blockIdx} className="text-xs">
                            <span className="font-medium text-brand-red">{block.timeRange}</span>
                            <span className="text-brand-carbon/80 ml-1.5">{block.activity}</span>
                            {block.notes && (
                              <p className="text-brand-carbon/60 mt-0.5">{block.notes}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-brand-carbon/40 italic pl-3">No activities planned</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-md bg-brand-sand/40 px-3 py-2">
                <p className="text-xs text-brand-carbon/60">Itinerary not yet generated</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Packing Card */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-3">
              <Package className="h-4 w-4 text-brand-blue shrink-0" />
              <h3 className="text-sm font-semibold text-brand-carbon">Group Packing</h3>
            </div>
            {packingReminders.length > 0 ? (
              <ul className="space-y-1">
                {packingReminders.map((item, i) => (
                  <li key={i} className="text-xs text-brand-carbon/80 flex items-start gap-1.5">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-brand-blue mt-1 shrink-0" />
                    <span>
                      {item.name}
                      {item.assignedTo && (
                        <span className="text-brand-carbon/40 ml-1">({item.assignedTo})</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="rounded-md bg-brand-sand/40 px-3 py-2">
                <p className="text-xs text-brand-carbon/60">No packing items yet</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Expenses Card */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-3">
              <DollarSign className="h-4 w-4 text-brand-blue shrink-0" />
              <h3 className="text-sm font-semibold text-brand-carbon">Expenses</h3>
            </div>
            {expensesSummary ? (
              <div className="space-y-1">
                <p className="text-sm font-medium text-brand-carbon">
                  {formatCurrency(expensesSummary.totalAmount, expensesSummary.currency)}
                </p>
                <p className="text-xs text-brand-carbon/60">
                  {expensesSummary.itemCount} expense{expensesSummary.itemCount !== 1 ? 's' : ''} tracked
                </p>
              </div>
            ) : (
              <div className="rounded-md bg-brand-sand/40 px-3 py-2">
                <p className="text-xs text-brand-carbon/60">No expenses tracked yet</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Share Brief Card — leader only */}
        {isLeader && (
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-3">
                <Link2 className="h-4 w-4 text-brand-blue shrink-0" />
                <h3 className="text-sm font-semibold text-brand-carbon">Share Brief</h3>
              </div>

              {briefToken ? (
                <div className="space-y-3">
                  {/* URL display */}
                  <div className="flex items-center gap-2 rounded-md border border-brand-carbon/10 bg-brand-sand/30 px-3 py-2">
                    <span className="text-xs text-brand-carbon/70 truncate flex-1 font-mono">
                      {typeof window !== 'undefined' ? `${window.location.origin}/t/${briefToken}` : `/t/${briefToken}`}
                    </span>
                  </div>

                  <div className="flex gap-2">
                    {/* Copy button */}
                    <button
                      onClick={async () => {
                        const url = `${window.location.origin}/t/${briefToken}`
                        try {
                          await navigator.clipboard.writeText(url)
                          setCopied(true)
                          setTimeout(() => setCopied(false), 2000)
                        } catch {
                          // Fallback: select the text
                        }
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-brand-carbon/10 bg-white text-xs font-medium text-brand-carbon hover:bg-brand-sand/30 transition-colors"
                    >
                      {copied ? (
                        <><Check className="h-3.5 w-3.5 text-green-600" /> Copied</>
                      ) : (
                        <><Copy className="h-3.5 w-3.5" /> Copy link</>
                      )}
                    </button>

                    {/* Share via navigator.share */}
                    {typeof navigator !== 'undefined' && 'share' in navigator && (
                      <button
                        onClick={() => {
                          navigator.share({
                            title: `Trip Brief: ${overview.name}`,
                            url: `${window.location.origin}/t/${briefToken}`
                          }).catch(() => {})
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-brand-carbon/10 bg-white text-xs font-medium text-brand-carbon hover:bg-brand-sand/30 transition-colors"
                      >
                        <Share2 className="h-3.5 w-3.5" /> Share
                      </button>
                    )}

                    {/* Revoke */}
                    <button
                      disabled={shareLoading}
                      onClick={async () => {
                        setShareLoading(true)
                        try {
                          const res = await fetch(`/api/trips/${trip.id}/brief/share`, {
                            method: 'DELETE',
                            headers: { Authorization: `Bearer ${token}` }
                          })
                          if (res.ok) {
                            setBriefToken(null)
                          }
                        } catch {
                          // ignore
                        } finally {
                          setShareLoading(false)
                        }
                      }}
                      className="ml-auto flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium text-brand-carbon/40 hover:text-brand-red hover:bg-red-50 transition-colors disabled:opacity-50"
                    >
                      {shareLoading ? '...' : 'Revoke'}
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <p className="text-xs text-brand-carbon/60 mb-3">
                    Share a read-only link to your trip brief with anyone.
                  </p>
                  <button
                    disabled={shareLoading}
                    onClick={async () => {
                      setShareLoading(true)
                      try {
                        const res = await fetch(`/api/trips/${trip.id}/brief/share`, {
                          method: 'POST',
                          headers: { Authorization: `Bearer ${token}` }
                        })
                        if (res.ok) {
                          const data = await res.json()
                          setBriefToken(data.briefToken)
                        }
                      } catch {
                        // ignore
                      } finally {
                        setShareLoading(false)
                      }
                    }}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-blue text-white text-xs font-semibold hover:bg-brand-blue/90 transition-colors disabled:opacity-50"
                  >
                    {shareLoading ? (
                      'Generating...'
                    ) : (
                      <><Link2 className="h-3.5 w-3.5" /> Share brief link</>
                    )}
                  </button>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </ScrollArea>
  )
}

export default BriefOverlay
