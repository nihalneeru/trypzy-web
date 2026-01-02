import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/auth'
import { prisma } from '@/lib/db/prisma'
import { calculateConsensus } from '@/lib/trips/trip-consensus'
import { z } from 'zod'

const voteSchema = z.object({
  optionKey: z.string().regex(/^\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}$/, 'OptionKey must be in YYYY-MM-DD_YYYY-MM-DD format'),
})

// POST /api/circles/[id]/trips/[tripId]/vote - Vote on a date option
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; tripId: string } }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify user is a member
    const membership = await prisma.membership.findUnique({
      where: {
        userId_circleId: {
          userId: session.user.id,
          circleId: params.id,
        },
      },
    })

    if (!membership) {
      return NextResponse.json(
        { error: 'Not a member of this circle' },
        { status: 403 }
      )
    }

    const trip = await prisma.trip.findFirst({
      where: {
        id: params.tripId,
        circleId: params.id,
      },
    })

    if (!trip) {
      return NextResponse.json({ error: 'Trip not found' }, { status: 404 })
    }

    if (trip.status === 'locked') {
      return NextResponse.json(
        { error: 'Trip dates are already locked. Voting is no longer available.' },
        { status: 400 }
      )
    }

    const body = await request.json()
    const { optionKey } = voteSchema.parse(body)

    // Validate that optionKey exists in current top 3 options
    if (trip.earliestStart && trip.latestEnd) {
      const availabilities = await prisma.availability.findMany({
        where: { tripId: params.tripId },
      })
      
      const options = calculateConsensus(
        availabilities.map(a => ({ 
          day: a.day, 
          status: a.status as 'available' | 'maybe' | 'unavailable', 
          userId: a.userId 
        })),
        trip.earliestStart,
        trip.latestEnd
      )
      const validOptionKeys = options.map(opt => opt.optionKey)
      if (!validOptionKeys.includes(optionKey)) {
        return NextResponse.json(
          { error: 'Invalid optionKey - must be one of the top 3 options' },
          { status: 400 }
        )
      }
    }

    // Upsert vote (user can change their vote)
    const vote = await prisma.vote.upsert({
      where: {
        tripId_userId: {
          tripId: params.tripId,
          userId: session.user.id,
        },
      },
      update: {
        optionKey,
      },
      create: {
        tripId: params.tripId,
        userId: session.user.id,
        optionKey,
      },
    })

    return NextResponse.json({ vote }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      )
    }

    console.error('Error voting:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

