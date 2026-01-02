import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const availabilitySchema = z.object({
  availabilities: z.array(
    z.object({
      day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Day must be in YYYY-MM-DD format'),
      status: z.enum(['available', 'maybe', 'unavailable']),
    })
  ),
})

// POST /api/circles/[id]/trips/[tripId]/availability - Submit availability
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; tripId: string } }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify user is a member and trip exists
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

    if (!membership) {
      return NextResponse.json(
        { error: 'Not a member of this circle' },
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
    const { availabilities } = availabilitySchema.parse(body)

    // Delete existing availabilities for this user and trip
    await prisma.availability.deleteMany({
      where: {
        tripId: params.tripId,
        userId: session.user.id,
      },
    })

    // Create new availabilities
    const created = await prisma.availability.createMany({
      data: availabilities.map((a) => ({
        tripId: params.tripId,
        userId: session.user.id,
        day: a.day,
        status: a.status as 'available' | 'maybe' | 'unavailable',
      })),
    })

    return NextResponse.json({ count: created.count }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      )
    }

    console.error('Error submitting availability:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// GET /api/circles/[id]/trips/[tripId]/availability - Get user's availability
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; tripId: string } }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const availabilities = await prisma.availability.findMany({
      where: {
        tripId: params.tripId,
        userId: session.user.id,
      },
      orderBy: {
        day: 'asc',
      },
    })

    return NextResponse.json({ availabilities })
  } catch (error) {
    console.error('Error fetching availability:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

