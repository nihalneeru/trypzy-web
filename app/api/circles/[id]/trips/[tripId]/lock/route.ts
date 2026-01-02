import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/auth'
import { prisma } from '@/lib/db/prisma'
import { z } from 'zod'

const lockSchema = z.object({
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
})

// POST /api/circles/[id]/trips/[tripId]/lock - Lock trip dates
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; tripId: string } }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify user is the circle owner or trip creator
    const [membership, trip] = await Promise.all([
      prisma.membership.findUnique({
        where: {
          userId_circleId: {
            userId: session.user.id,
            circleId: params.id,
          },
        },
      }),
      prisma.trip.findFirst({
        where: {
          id: params.tripId,
          circleId: params.id,
        },
      }),
    ])

    if (!membership || (membership.role !== 'owner' && trip?.createdBy !== session.user.id)) {
      return NextResponse.json(
        { error: 'Only circle owner or trip creator can lock dates' },
        { status: 403 }
      )
    }

    if (!trip) {
      return NextResponse.json({ error: 'Trip not found' }, { status: 404 })
    }

    if (trip.status === 'locked') {
      return NextResponse.json(
        { error: 'Trip dates are already locked' },
        { status: 400 }
      )
    }

    const body = await request.json()
    const { startDate, endDate } = lockSchema.parse(body)

    const updatedTrip = await prisma.trip.update({
      where: { id: params.tripId },
      data: {
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        status: 'locked',
      },
    })

    return NextResponse.json({ trip: updatedTrip })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      )
    }

    console.error('Error locking trip:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

