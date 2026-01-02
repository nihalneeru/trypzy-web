import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/auth'
import { prisma } from '@/lib/db/prisma'
import { calculateConsensus } from '@/lib/trips/trip-consensus'

// GET /api/circles/[id]/trips/[tripId]/options - Get top date options
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; tripId: string } }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Authorization check: Only circle members can view date options
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

    // Only collaborative trips have date options
    if (trip.tripType !== 'collaborative') {
      return NextResponse.json(
        { error: 'Date options are only available for collaborative trips' },
        { status: 400 }
      )
    }

    // Get all availabilities for this trip
    const availabilities = await prisma.availability.findMany({
      where: {
        tripId: params.tripId,
      },
      include: {
        user: {
          select: {
            id: true,
          },
        },
      },
    })

    // Use trip's date range if available, otherwise calculate from availabilities
    let earliestStart: Date
    let latestEnd: Date

    if (trip.earliestStart && trip.latestEnd) {
      earliestStart = trip.earliestStart
      latestEnd = trip.latestEnd
    } else {
      const allDays = availabilities.map(a => a.day).filter((day, index, self) => self.indexOf(day) === index)
      if (allDays.length === 0) {
        return NextResponse.json({ options: [] })
      }
      const sortedDays = allDays.sort()
      earliestStart = new Date(sortedDays[0] + 'T00:00:00.000Z')
      latestEnd = new Date(sortedDays[sortedDays.length - 1] + 'T00:00:00.000Z')
    }

    const options = calculateConsensus(
      availabilities.map(a => ({
        day: a.day,
        status: a.status as 'available' | 'maybe' | 'unavailable',
        userId: a.userId,
      })),
      earliestStart,
      latestEnd,
      1, // minDays: allow single-day trips
      14 // maxDays: up to 2 weeks
    )

    return NextResponse.json({ options })
  } catch (error) {
    console.error('Error calculating options:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

