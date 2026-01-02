import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const createCircleSchema = z.object({
  name: z.string().min(1, 'Circle name is required'),
})

// GET /api/circles - List user's circles
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const circles = await prisma.circle.findMany({
      where: {
        memberships: {
          some: {
            userId: session.user.id,
          },
        },
      },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        memberships: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        _count: {
          select: {
            trips: true,
            posts: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    return NextResponse.json({ circles })
  } catch (error) {
    console.error('Error fetching circles:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST /api/circles - Create a new circle
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { name } = createCircleSchema.parse(body)

    // Create circle and membership in a transaction
    const circle = await prisma.$transaction(async (tx) => {
      const newCircle = await tx.circle.create({
        data: {
          name,
          ownerId: session.user.id,
        },
      })

      await tx.membership.create({
        data: {
          userId: session.user.id,
          circleId: newCircle.id,
          role: 'owner',
        },
      })

      return newCircle
    })

    return NextResponse.json(
      { circle, inviteLink: `/circles/${circle.id}/join` },
      { status: 201 }
    )
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      )
    }

    console.error('Error creating circle:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

