'use client'

import { useRef } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface Traveler {
  id: string
  name: string
  avatarUrl?: string
  status?: 'active' | 'pending' | 'left' | 'removed'
}

interface TravelerStripProps {
  travelers: Traveler[]
  currentUserId: string
  onTravelerClick: (travelerId: string) => void
}

/**
 * Horizontal scrollable strip of traveler avatars
 *
 * Features:
 * - Scroll arrows when overflow
 * - Click avatar to open member profile overlay
 * - Visual distinction for current user
 * - Status indicators (pending, left)
 */
export function TravelerStrip({
  travelers,
  currentUserId,
  onTravelerClick
}: TravelerStripProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // Filter to only show active travelers
  const activeTravelers = travelers.filter(t => t.status === 'active' || !t.status)

  const scroll = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const scrollAmount = 200
      scrollContainerRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      })
    }
  }

  // Get initials from name
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(part => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  // Generate a consistent color based on name (using brand colors)
  const getAvatarColor = (name: string) => {
    const colors = [
      'bg-brand-red/10 text-brand-red',
      'bg-brand-blue/10 text-brand-blue',
      'bg-brand-carbon/10 text-brand-carbon',
      'bg-brand-sand text-brand-carbon',
      'bg-brand-red/20 text-brand-red',
      'bg-brand-blue/20 text-brand-blue',
      'bg-brand-carbon/20 text-brand-carbon',
      'bg-brand-sand/80 text-brand-carbon',
    ]
    const index = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length
    return colors[index]
  }

  if (activeTravelers.length === 0) {
    return null
  }

  return (
    <div className="relative flex items-center bg-gray-50 border-y border-gray-200 py-2 px-1">
      {/* Left scroll button */}
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0 hidden sm:flex"
        onClick={() => scroll('left')}
        aria-label="Scroll left"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      {/* Scrollable container */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-x-auto scrollbar-hide flex items-center gap-2 px-2"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        <TooltipProvider>
          {activeTravelers.map((traveler) => {
            const isCurrentUser = traveler.id === currentUserId

            return (
              <Tooltip key={traveler.id}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => onTravelerClick(traveler.id)}
                    className={cn(
                      'shrink-0 rounded-full transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-brand-blue focus:ring-offset-2',
                      isCurrentUser && 'ring-2 ring-brand-blue'
                    )}
                    aria-label={`View ${traveler.name}'s profile`}
                  >
                    <Avatar className="h-10 w-10">
                      {traveler.avatarUrl ? (
                        <AvatarImage src={traveler.avatarUrl} alt={traveler.name} />
                      ) : null}
                      <AvatarFallback className={getAvatarColor(traveler.name)}>
                        {getInitials(traveler.name)}
                      </AvatarFallback>
                    </Avatar>
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-sm font-medium">
                    {traveler.name}
                    {isCurrentUser && <span className="text-gray-500 ml-1">(you)</span>}
                  </p>
                </TooltipContent>
              </Tooltip>
            )
          })}
        </TooltipProvider>
      </div>

      {/* Right scroll button */}
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0 hidden sm:flex"
        onClick={() => scroll('right')}
        aria-label="Scroll right"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  )
}
