'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TriptiLogo } from '@/components/brand/TriptiLogo'
import { DeleteAccountDialog } from '@/components/account/DeleteAccountDialog'
import { AlertTriangle } from 'lucide-react'

export default function DeleteAccountPage() {
  const router = useRouter()
  const [token, setToken] = useState(null)
  const [isLoggedIn, setIsLoggedIn] = useState(null) // null = checking
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  useEffect(() => {
    const storedToken = localStorage.getItem('tripti_token')
    setToken(storedToken)
    setIsLoggedIn(!!storedToken)
  }, [])

  // Still checking auth state
  if (isLoggedIn === null) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <TriptiLogo variant="full" className="h-8 w-auto opacity-50" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Simple header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <Link href="/">
            <TriptiLogo variant="full" className="h-7 w-auto" />
          </Link>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 py-12">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-brand-carbon">
              <AlertTriangle className="h-5 w-5 text-brand-red" />
              Delete your tripti.ai account
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-gray-600 space-y-3">
              <p>
                Deleting your account will permanently remove your personal information
                (name, email, profile). Your contributions to trips and circles will remain
                but be attributed to &ldquo;Deleted member.&rdquo;
              </p>
              <p>This action cannot be undone.</p>
            </div>

            {isLoggedIn ? (
              <Button
                variant="destructive"
                className="w-full"
                onClick={() => setShowDeleteDialog(true)}
              >
                Delete my account
              </Button>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-gray-500">
                  You need to be logged in to delete your account.
                </p>
                <Button
                  className="w-full"
                  onClick={() => router.push('/login?returnTo=/delete-account')}
                >
                  Log in to continue
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <DeleteAccountDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        token={token}
      />
    </div>
  )
}
