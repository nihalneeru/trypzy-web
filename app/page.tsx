import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import Link from 'next/link'

export default async function HomePage() {
  const session = await getServerSession(authOptions)

  if (session) {
    redirect('/circles')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-50 to-gray-100">
      <div className="max-w-2xl text-center px-4">
        <h1 className="text-5xl font-bold text-gray-900 mb-4">Trypzy</h1>
        <p className="text-xl text-gray-600 mb-8">
          Plan trips with friends. Keep shared memories.
        </p>
        <div className="space-x-4">
          <Link
            href="/auth/signup"
            className="inline-block px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium"
          >
            Get Started
          </Link>
          <Link
            href="/auth/signin"
            className="inline-block px-6 py-3 bg-white text-indigo-600 border border-indigo-600 rounded-lg hover:bg-indigo-50 font-medium"
          >
            Sign In
          </Link>
        </div>
      </div>
    </div>
  )
}

