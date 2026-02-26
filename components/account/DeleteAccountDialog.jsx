'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import { BrandedSpinner } from '@/components/common/BrandedSpinner'
import { toast } from 'sonner'
import { AlertTriangle } from 'lucide-react'

export function DeleteAccountDialog({ open, onOpenChange, token }) {
  const router = useRouter()
  const [step, setStep] = useState(1) // 1 = warning, 2 = confirm
  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)

  const handleClose = () => {
    setStep(1)
    setConfirmText('')
    onOpenChange(false)
  }

  const handleDelete = async () => {
    if (confirmText !== 'DELETE') return
    setDeleting(true)

    try {
      const res = await fetch('/api/account', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ confirm: 'DELETE' }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Could not delete account')
      }

      // Clear all auth state
      localStorage.removeItem('tripti_token')
      localStorage.removeItem('tripti_user')
      document.cookie = 'tripti_auth_mode=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT'

      // Clear Capacitor native state if applicable
      if (typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.()) {
        try {
          const Prefs = window.Capacitor.Plugins?.Preferences
          if (Prefs) {
            await Prefs.remove({ key: 'tripti_token' })
            await Prefs.remove({ key: 'tripti_user' })
          }
        } catch {}
      }

      await signOut({ redirect: false }).catch(() => {})

      toast.success('Account deleted')
      handleClose()
      router.replace('/')
    } catch (err) {
      toast.error(err.message || 'Could not delete account — please try again')
      setDeleting(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={handleClose}>
      <AlertDialogContent className="max-w-md">
        {step === 1 ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-brand-red">
                <AlertTriangle className="h-5 w-5" />
                Delete your account?
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-3 text-sm text-brand-carbon/70">
                  <p>This action is permanent and cannot be undone. Here's what will happen:</p>
                  <ul className="list-disc pl-5 space-y-1.5">
                    <li>Your account access will be <strong>removed immediately</strong></li>
                    <li>Your name, email, and profile will be <strong>permanently erased</strong></li>
                    <li>Your trip and circle contributions will remain but be shown as <strong>"Deleted member"</strong></li>
                    <li>Any trips you lead will be <strong>transferred</strong> to another member</li>
                  </ul>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <Button
                variant="destructive"
                onClick={() => setStep(2)}
              >
                Continue
              </Button>
            </AlertDialogFooter>
          </>
        ) : (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle className="text-brand-red">
                Confirm account deletion
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-3">
                  <p className="text-sm text-brand-carbon/70">
                    Type <strong>DELETE</strong> to confirm.
                  </p>
                  <Input
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder="Type DELETE"
                    autoFocus
                    autoCapitalize="none"
                    autoCorrect="off"
                  />
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={confirmText !== 'DELETE' || deleting}
              >
                {deleting ? (
                  <div className="flex items-center gap-2">
                    <BrandedSpinner size="sm" />
                    Deleting...
                  </div>
                ) : (
                  'Delete my account'
                )}
              </Button>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  )
}
