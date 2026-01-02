import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/auth'
import { prisma } from '@/lib/db/prisma'

// POST /api/circles/[id]/trips/[tripId]/participants - Join a hosted trip
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; tripId: string } }
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

    // Verify trip exists and is hosted
    const trip = await prisma.trip.findFirst({
      where: {
        id: params.tripId,
        circleId: params.id,
      },
    })

    if (!trip) {
      return NextResponse.json({ error: 'Trip not found' }, { status: 404 })
    }

    if (trip.tripType !== 'hosted') {
      return NextResponse.json(
        { error: 'Only hosted trips can be joined' },
        { status: 400 }
      )
    }

    // Check if already a participant
    const existing = await prisma.tripParticipant.findUnique({
      where: {
        tripId_userId: {
          tripId: params.tripId,
          userId: session.user.id,
        },
      },
    })

    if (existing) {
      return NextResponse.json(
        { error: 'Already a participant' },
        { status: 400 }
      )
    }

    // Create participant
    const participant = await prisma.tripParticipant.create({
      data: {
        tripId: params.tripId,
        userId: session.user.id,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    })

    return NextResponse.json({ participant }, { status: 201 })
  } catch (error) {
    console.error('Error joining trip:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE /api/circles/[id]/trips/[tripId]/participants - Leave a hosted trip
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; tripId: string } }
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

    // Verify trip exists and is hosted
    const trip = await prisma.trip.findFirst({
      where: {
        id: params.tripId,
        circleId: params.id,
      },
    })

    if (!trip) {
      return NextResponse.json({ error: 'Trip not found' }, { status: 404 })
    }

    if (trip.tripType !== 'hosted') {
      return NextResponse.json(
        { error: 'Only hosted trips can be left' },
        { status: 400 }
      )
    }

    // Don't allow trip creator to leave
    if (trip.createdBy === session.user.id) {
      return NextResponse.json(
        { error: 'Trip creator cannot leave the trip' },
        { status: 400 }
      )
    }

    // Delete participant
    await prisma.tripParticipant.delete({
      where: {
        tripId_userId: {
          tripId: params.tripId,
          userId: session.user.id,
        },
      },
    })

    return NextResponse.json({ message: 'Left trip successfully' })
  } catch (error) {
    console.error('Error leaving trip:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

