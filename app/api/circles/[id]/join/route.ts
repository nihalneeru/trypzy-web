import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/auth'
import { prisma } from '@/lib/db/prisma'

// POST /api/circles/[id]/join - Join a circle via invite link
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if circle exists
    const circle = await prisma.circle.findUnique({
      where: { id: params.id },
    })

    if (!circle) {
      return NextResponse.json({ error: 'Circle not found' }, { status: 404 })
    }

    // Check if user is already a member
    const existingMembership = await prisma.membership.findUnique({
      where: {
        userId_circleId: {
          userId: session.user.id,
          circleId: params.id,
        },
      },
    })

    if (existingMembership) {
      return NextResponse.json(
        { error: 'Already a member of this circle' },
        { status: 400 }
      )
    }

    // Create membership
    const membership = await prisma.membership.create({
      data: {
        userId: session.user.id,
        circleId: params.id,
        role: 'member',
      },
      include: {
        circle: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    })

    return NextResponse.json({ membership }, { status: 201 })
  } catch (error) {
    console.error('Error joining circle:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

