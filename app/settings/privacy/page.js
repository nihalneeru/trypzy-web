'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import { Save, Shield } from 'lucide-react'
import { BrandedSpinner } from '@/components/common/BrandedSpinner'
import { AppHeader } from '@/components/common/AppHeader'
import Link from 'next/link'

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

export default function PrivacySettingsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [userName, setUserName] = useState(null)
  const [privacy, setPrivacy] = useState({
    profileVisibility: 'circle',
    tripsVisibility: 'circle',
    allowTripJoinRequests: true,
    showTripDetailsLevel: 'limited'
  })
  
  useEffect(() => {
    try {
      const storedUser = localStorage.getItem('trypzy_user')
      if (storedUser) setUserName(JSON.parse(storedUser).name)
    } catch {}
    loadPrivacy()
  }, [])
  
  const loadPrivacy = async () => {
    try {
      const token = localStorage.getItem('trypzy_token')
      if (!token) {
        router.push('/')
        return
      }
      
      const data = await api('/users/me/privacy', { method: 'GET' }, token)
      setPrivacy(data.privacy)
    } catch (error) {
      if (error.message?.includes('Unauthorized')) {
        localStorage.removeItem('trypzy_token')
        localStorage.removeItem('trypzy_user')
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
      const token = localStorage.getItem('trypzy_token')
      if (!token) {
        router.push('/')
        return
      }
      
      await api('/users/me/privacy', {
        method: 'PATCH',
        body: JSON.stringify(privacy)
      }, token)
      
      toast.success('Privacy settings saved!')
    } catch (error) {
      toast.error(error.message || 'Failed to save privacy settings')
    } finally {
      setSaving(false)
    }
  }
  
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <BrandedSpinner size="lg" className="mx-auto mb-4" />
          <p className="text-gray-600">Loading privacy settings...</p>
        </div>
      </div>
    )
  }
  
  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader userName={userName} />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <Shield className="h-6 w-6 text-brand-blue" />
            <h1 className="text-3xl font-bold text-brand-carbon">Privacy Settings</h1>
          </div>
          <p className="text-gray-600">
            Control who can see your profile and trip information.
          </p>
        </div>

        {/* Privacy Philosophy */}
        <div className="bg-brand-sand/40 border border-brand-sand rounded-lg p-5 mb-6">
          <h2 className="text-base font-semibold text-brand-carbon mb-2">Our Privacy Philosophy</h2>
          <p className="text-sm text-gray-700 leading-relaxed">
            Trypzy is built for trusted circles, not public audiences. Trips, conversations, and decisions
            are private by default and shared only with the people you invite. Nothing is shared beyond your
            circle unless you explicitly choose. Any smart or automated features are designed to support
            coordination within your group, not to work against your expectations.
          </p>
          <Link
            href="/privacy"
            className="inline-block mt-3 text-sm font-medium text-brand-blue hover:underline"
          >
            Read our full Privacy Policy
          </Link>
        </div>
        
        {/* Privacy Settings Card */}
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
              <p className="text-sm text-gray-600">
                Who can view your profile?
              </p>
              <RadioGroup
                value={privacy.profileVisibility}
                onValueChange={(value) => setPrivacy({ ...privacy, profileVisibility: value })}
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="circle" id="profile-circle" />
                  <Label htmlFor="profile-circle" className="font-normal cursor-pointer">
                    Circle Members Only - Only people in your circles can see your profile
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="public" id="profile-public" />
                  <Label htmlFor="profile-public" className="font-normal cursor-pointer">
                    Public - Anyone can see your profile
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
              <Label className="text-base font-semibold">Upcoming Trips Visibility</Label>
              <p className="text-sm text-gray-600">
                Who can see your upcoming trips on your profile?
              </p>
              <p className="text-xs text-gray-500 italic">
                This only affects your profile view. You and your circle members will always see trips you're traveling on.
              </p>
              <RadioGroup
                value={privacy.tripsVisibility === 'private' ? 'circle' : privacy.tripsVisibility}
                onValueChange={(value) => setPrivacy({ ...privacy, tripsVisibility: value })}
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="circle" id="trips-circle" />
                  <Label htmlFor="trips-circle" className="font-normal cursor-pointer">
                    Circle Members Only - Only people in your circles can see your trips (Default)
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="public" id="trips-public" />
                  <Label htmlFor="trips-public" className="font-normal cursor-pointer">
                    Public - Share your travel experiences with everyone
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
                onValueChange={(value) => setPrivacy({ ...privacy, showTripDetailsLevel: value })}
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="limited" id="details-limited" />
                  <Label htmlFor="details-limited" className="font-normal cursor-pointer">
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
                <Label className="text-base font-semibold">Allow Trip Join Requests</Label>
                <p className="text-sm text-gray-600">
                  Let others request to join your trips
                </p>
              </div>
              <Switch
                checked={privacy.allowTripJoinRequests}
                onCheckedChange={(checked) => setPrivacy({ ...privacy, allowTripJoinRequests: checked })}
              />
            </div>
            
            {/* Save Button */}
            <div className="flex justify-end pt-4">
              <Button onClick={savePrivacy} disabled={saving}>
                <Save className="h-4 w-4 mr-2" />
                {saving ? 'Saving...' : 'Save Settings'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
