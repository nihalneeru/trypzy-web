import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const createTripSchema = z.object({
  destination: z.string().min(1, 'Destination is required'),
  earliestStart: z.string().datetime().optional(),
  latestEnd: z.string().datetime().optional(),
  tripType: z.enum(['collaborative', 'hosted']),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  notes: z.string().optional(),
})

// POST /api/circles/[id]/trips - Create a new trip
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify user is a member of the circle
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

    const body = await request.json()
    const data = createTripSchema.parse(body)

    const trip = await prisma.trip.create({
      data: {
        circleId: params.id,
        createdBy: session.user.id,
        destination: data.destination,
        tripType: data.tripType as 'collaborative' | 'hosted',
        notes: data.notes,
        status: data.tripType === 'hosted' ? 'locked' : 'scheduling',
        startDate: data.startDate ? new Date(data.startDate) : null,
        endDate: data.endDate ? new Date(data.endDate) : null,
        earliestStart: data.earliestStart ? new Date(data.earliestStart) : null,
        latestEnd: data.latestEnd ? new Date(data.latestEnd) : null,
      },
    })

    return NextResponse.json({ trip }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      )
    }

    console.error('Error creating trip:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

