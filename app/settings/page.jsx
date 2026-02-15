'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import { Save, ArrowLeft, Shield, User } from 'lucide-react'
import { BrandedSpinner } from '@/components/common/BrandedSpinner'
import { AppHeader } from '@/components/common/AppHeader'
import { DeleteAccountDialog } from '@/components/account/DeleteAccountDialog'

const SECTIONS = [
  { id: 'privacy', label: 'Privacy', icon: Shield },
  { id: 'account', label: 'Account', icon: User },
]

const api = async (endpoint, options = {}, token) => {
  const response = await fetch(`/api${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers,
    },
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Request failed')
  }

  return response.json()
}

export default function SettingsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [userName, setUserName] = useState(null)
  const [userEmail, setUserEmail] = useState(null)
  const [activeSection, setActiveSection] = useState('privacy')
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [privacy, setPrivacy] = useState({
    profileVisibility: 'circle',
    tripsVisibility: 'circle',
    allowTripJoinRequests: true,
    showTripDetailsLevel: 'limited',
  })
  const savedPrivacy = useRef(null)

  const isDirty =
    savedPrivacy.current !== null &&
    JSON.stringify(privacy) !== JSON.stringify(savedPrivacy.current)

  const token =
    typeof window !== 'undefined' ? localStorage.getItem('tripti_token') : null

  // IntersectionObserver for active section highlighting
  useEffect(() => {
    const sectionEls = SECTIONS.map((s) => document.getElementById(s.id)).filter(Boolean)
    if (sectionEls.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id)
          }
        }
      },
      { rootMargin: '-20% 0px -60% 0px', threshold: 0 }
    )

    sectionEls.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [loading])

  // Scroll to hash on initial load
  useEffect(() => {
    if (loading) return
    const hash = window.location.hash.replace('#', '')
    if (hash) {
      const el = document.getElementById(hash)
      if (el) {
        setTimeout(() => el.scrollIntoView({ behavior: 'smooth' }), 100)
      }
    }
  }, [loading])

  useEffect(() => {
    try {
      const storedUser = localStorage.getItem('tripti_user')
      if (storedUser) {
        const user = JSON.parse(storedUser)
        setUserName(user.name)
        setUserEmail(user.email)
      }
    } catch {}
    loadPrivacy()
  }, [])

  const loadPrivacy = async () => {
    try {
      const token = localStorage.getItem('tripti_token')
      if (!token) {
        router.push('/')
        return
      }

      const data = await api('/users/me/privacy', { method: 'GET' }, token)
      setPrivacy(data.privacy)
      savedPrivacy.current = data.privacy
    } catch (error) {
      if (error.message?.includes('Unauthorized')) {
        localStorage.removeItem('tripti_token')
        localStorage.removeItem('tripti_user')
        router.replace('/')
        return
      }
      toast.error(error.message || 'Failed to load privacy settings')
    } finally {
      setLoading(false)
    }
  }

  const savePrivacy = async () => {
    setSaving(true)
    try {
      const token = localStorage.getItem('tripti_token')
      if (!token) {
        router.push('/')
        return
      }

      await api(
        '/users/me/privacy',
        { method: 'PATCH', body: JSON.stringify(privacy) },
        token
      )

      savedPrivacy.current = { ...privacy }
      toast.success('Saved!')
    } catch (error) {
      toast.error(error.message || 'Could not save — please try again')
    } finally {
      setSaving(false)
    }
  }

  const scrollToSection = (id) => {
    const el = document.getElementById(id)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' })
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <BrandedSpinner size="lg" className="mx-auto mb-4" />
          <p className="text-gray-600">Loading settings...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader userName={userName} />

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6">
        {/* Page header */}
        <div className="flex items-center gap-3 mb-4">
          <Button
            variant="ghost"
            size="sm"
            className="h-9 w-9 p-0"
            onClick={() => router.push('/dashboard')}
            aria-label="Back to dashboard"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold text-brand-carbon">Settings</h1>
        </div>

        {/* Sticky mini-nav */}
        <div className="sticky top-14 sm:top-16 z-30 bg-gray-50 pb-3 pt-1 -mx-4 px-4 sm:-mx-6 sm:px-6">
          <div className="flex gap-2">
            {SECTIONS.map((section) => {
              const Icon = section.icon
              const isActive = activeSection === section.id
              return (
                <button
                  key={section.id}
                  onClick={() => scrollToSection(section.id)}
                  className={`
                    flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium
                    transition-colors min-h-[36px]
                    ${
                      isActive
                        ? 'bg-brand-blue text-white'
                        : 'bg-white text-brand-carbon border border-gray-200 hover:border-gray-300'
                    }
                  `}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {section.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Privacy Section ── */}
        <section id="privacy" className="mb-10 scroll-mt-28">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="h-5 w-5 text-brand-blue" />
            <h2 className="text-lg font-semibold text-brand-carbon">Privacy</h2>
          </div>

          {/* Privacy Philosophy */}
          <div className="bg-brand-sand/40 border border-brand-sand rounded-lg p-4 mb-4">
            <p className="text-sm text-gray-700 leading-relaxed">
              Tripti.ai is designed for private group coordination within trusted circles.
              We do not sell personal data to third parties. Trip content is visible only to
              members of your selected group.
            </p>
            <Link
              href="/privacy"
              className="inline-block mt-2 text-sm font-medium text-brand-blue hover:underline"
            >
              Read our full Privacy Policy
            </Link>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Profile & Trip Visibility</CardTitle>
              <CardDescription>
                Choose who can view your profile and upcoming trips.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Profile Visibility */}
              <div className="space-y-3">
                <Label className="text-base font-semibold">Profile Visibility</Label>
                <p className="text-sm text-gray-600">Who can view your profile?</p>
                <RadioGroup
                  value={privacy.profileVisibility}
                  onValueChange={(value) =>
                    setPrivacy({ ...privacy, profileVisibility: value })
                  }
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="circle" id="profile-circle" />
                    <Label htmlFor="profile-circle" className="font-normal cursor-pointer">
                      Circles - Only people in your circles
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="public" id="profile-public" />
                    <Label htmlFor="profile-public" className="font-normal cursor-pointer">
                      Public - Visible beyond your circles
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="private" id="profile-private" />
                    <Label htmlFor="profile-private" className="font-normal cursor-pointer">
                      Private - Only you can see your profile
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              <div className="border-t pt-6"></div>

              {/* Trips Visibility */}
              <div className="space-y-3">
                <Label className="text-base font-semibold">
                  Upcoming Trips Visibility
                </Label>
                <p className="text-sm text-gray-600">
                  Who can see your upcoming trips on your profile?
                </p>
                <p className="text-xs text-gray-600 font-medium">
                  This only affects your profile view. You and your circle members will
                  always see trips you&apos;re traveling on.
                </p>
                <RadioGroup
                  value={
                    privacy.tripsVisibility === 'private'
                      ? 'circle'
                      : privacy.tripsVisibility
                  }
                  onValueChange={(value) =>
                    setPrivacy({ ...privacy, tripsVisibility: value })
                  }
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="circle" id="trips-circle" />
                    <Label htmlFor="trips-circle" className="font-normal cursor-pointer">
                      Circles - Only people in your circles
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="public" id="trips-public" />
                    <Label htmlFor="trips-public" className="font-normal cursor-pointer">
                      Public - Visible beyond your circles
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              <div className="border-t pt-6"></div>

              {/* Trip Details Level */}
              <div className="space-y-3">
                <Label className="text-base font-semibold">Trip Details Level</Label>
                <p className="text-sm text-gray-600">
                  How much detail should others see about your trips?
                </p>
                <RadioGroup
                  value={privacy.showTripDetailsLevel}
                  onValueChange={(value) =>
                    setPrivacy({ ...privacy, showTripDetailsLevel: value })
                  }
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="limited" id="details-limited" />
                    <Label
                      htmlFor="details-limited"
                      className="font-normal cursor-pointer"
                    >
                      Limited - Show basic trip information only
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="full" id="details-full" />
                    <Label htmlFor="details-full" className="font-normal cursor-pointer">
                      Full - Show complete trip details
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              <div className="border-t pt-6"></div>

              {/* Allow Join Requests */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base font-semibold">
                    Allow Trip Join Requests
                  </Label>
                  <p className="text-sm text-gray-600">
                    Let others request to join your trips
                  </p>
                  <p className="text-xs text-gray-500">
                    Requests are visible only to you and trip organizers.
                  </p>
                </div>
                <Switch
                  checked={privacy.allowTripJoinRequests}
                  onCheckedChange={(checked) =>
                    setPrivacy({ ...privacy, allowTripJoinRequests: checked })
                  }
                />
              </div>

              {/* Save Button */}
              <div className="flex justify-end pt-4">
                <Button onClick={savePrivacy} disabled={saving || !isDirty}>
                  <Save className="h-4 w-4 mr-2" />
                  {saving ? 'Saving...' : 'Save privacy settings'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* ── Account Section ── */}
        <section id="account" className="mb-10 scroll-mt-28">
          <div className="flex items-center gap-2 mb-4">
            <User className="h-5 w-5 text-brand-blue" />
            <h2 className="text-lg font-semibold text-brand-carbon">Account</h2>
          </div>

          <Card className="mb-4">
            <CardHeader>
              <CardTitle>Account Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-sm text-gray-500">Name</Label>
                <p className="text-brand-carbon font-medium">{userName || '—'}</p>
              </div>
              <div>
                <Label className="text-sm text-gray-500">Email</Label>
                <p className="text-brand-carbon font-medium">{userEmail || '—'}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-red-200">
            <CardHeader>
              <CardTitle className="text-brand-red">Danger Zone</CardTitle>
              <CardDescription>
                Permanently delete your account and all associated data.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                variant="destructive"
                onClick={() => setShowDeleteDialog(true)}
                className="min-h-[44px]"
              >
                Delete my account
              </Button>
            </CardContent>
          </Card>
        </section>
      </div>

      <DeleteAccountDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        token={token}
      />
    </div>
  )
}
