import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db/prisma'
import { Navbar } from '@/components/layout/Navbar'
import Link from 'next/link'

export default async function CirclesPage() {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    redirect('/auth/signin')
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
        },
      },
      memberships: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
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

  return (
    <>
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Your Circles</h1>
          <Link
            href="/circles/new"
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            Create Circle
          </Link>
        </div>

        {circles.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg shadow">
            <p className="text-gray-500 mb-4">You don't have any circles yet.</p>
            <Link
              href="/circles/new"
              className="inline-block px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              Create your first circle
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {circles.map((circle) => (
              <Link
                key={circle.id}
                href={`/circles/${circle.id}`}
                className="block bg-white rounded-lg shadow p-6 hover:shadow-md transition"
              >
                <h2 className="text-xl font-semibold text-gray-900 mb-2">
                  {circle.name}
                </h2>
                <p className="text-sm text-gray-500 mb-4">
                  Owner: {circle.owner.name}
                </p>
                <div className="flex items-center justify-between text-sm text-gray-600">
                  <span>{circle.memberships.length} members</span>
                  <span>{circle._count.trips} trips</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

