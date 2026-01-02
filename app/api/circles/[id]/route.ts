import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/auth'
import { prisma } from '@/lib/db/prisma'

// GET /api/circles/[id] - Get circle details
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)

    // Authentication check: Only authenticated users can access
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Authorization check: Only circle members can view circle details
    // Using findFirst with membership filter ensures users can only see circles they belong to
    const circle = await prisma.circle.findFirst({
      where: {
        id: params.id,
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
        trips: {
          orderBy: {
            createdAt: 'desc',
          },
        },
        _count: {
          select: {
            trips: true,
            posts: true,
          },
        },
      },
    })

    if (!circle) {
      return NextResponse.json({ error: 'Circle not found' }, { status: 404 })
    }

    return NextResponse.json({ circle })
  } catch (error) {
    console.error('Error fetching circle:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

