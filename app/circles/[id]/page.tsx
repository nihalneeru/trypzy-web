import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db/prisma'
import { Navbar } from '@/components/layout/Navbar'
import { InviteLink } from '@/components/circles/InviteLink'
import Link from 'next/link'

export default async function CircleDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    redirect('/auth/signin')
  }

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
    },
  })

  if (!circle) {
    redirect('/circles')
  }

  const inviteLink = `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/circles/${circle.id}/join`

  return (
    <>
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">{circle.name}</h1>
          <p className="text-gray-600 mt-1">
            Created by {circle.owner.name}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-900">Trips</h2>
              <Link
                href={`/circles/${circle.id}/trips/new`}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm"
              >
                Create Trip
              </Link>
            </div>

            {circle.trips.length === 0 ? (
              <div className="bg-white rounded-lg shadow p-8 text-center">
                <p className="text-gray-500 mb-4">No trips yet.</p>
                <Link
                  href={`/circles/${circle.id}/trips/new`}
                  className="inline-block px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                >
                  Create your first trip
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                {circle.trips.map((trip) => (
                  <Link
                    key={trip.id}
                    href={`/circles/${circle.id}/trips/${trip.id}`}
                    className="block bg-white rounded-lg shadow p-6 hover:shadow-md transition"
                  >
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      {trip.destination}
                    </h3>
                    <div className="flex items-center space-x-4 text-sm text-gray-600">
                      <span className="capitalize">{trip.tripType}</span>
                      <span className="capitalize">{trip.status}</span>
                      {trip.startDate && trip.endDate && (
                        <span>
                          {new Date(trip.startDate).toLocaleDateString()} -{' '}
                          {new Date(trip.endDate).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Members
              </h3>
              <ul className="space-y-2">
                {circle.memberships.map((membership) => (
                  <li key={membership.userId} className="flex items-center justify-between">
                    <span className="text-gray-700">{membership.user.name}</span>
                    <span className="text-xs text-gray-500 capitalize">
                      {membership.role}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <InviteLink inviteLink={inviteLink} />
          </div>
        </div>
      </div>
    </>
  )
}

