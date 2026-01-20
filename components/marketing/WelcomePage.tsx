'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { TrypzyLogo } from '@/components/brand/TrypzyLogo'
import { 
  Users, 
  XCircle,
  ArrowRight,
  Lightbulb,
  Calendar as CalendarIcon,
  ListTodo,
  Home,
  Luggage,
  Rocket,
  Camera,
  DollarSign
} from 'lucide-react'

export function WelcomePage() {
  // Trip progress milestones in order
  const milestones = [
    { icon: Lightbulb, label: 'Proposed' },
    { icon: CalendarIcon, label: 'Dates' },
    { icon: ListTodo, label: 'Itinerary' },
    { icon: Home, label: 'Stay' },
    { icon: Luggage, label: 'Prep' },
    { icon: Rocket, label: 'On Trip' },
    { icon: Camera, label: 'Memories' },
    { icon: DollarSign, label: 'Expenses' }
  ]

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/" className="flex items-center">
              <TrypzyLogo variant="full" className="h-8 w-auto" />
              <span className="sr-only">Trypzy</span>
            </Link>
            <div className="flex items-center gap-3">
              <Button variant="ghost" asChild>
                <Link href="/login">Log in</Link>
              </Button>
              <Button asChild>
                <Link href="/signup">Get started</Link>
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-32">
        <div className="text-center">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 mb-16 sm:mb-20">
            Plan trips together — without the chaos.
          </h1>
          
          {/* Visual Flow Graphic - All 8 milestones */}
          <div className="mb-20">
            <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 max-w-4xl mx-auto">
              {milestones.map((milestone, index) => {
                const Icon = milestone.icon
                return (
                  <div key={milestone.label} className="flex items-center">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-primary/10 flex items-center justify-center">
                        <Icon className="h-6 w-6 sm:h-7 sm:w-7 text-primary" />
                      </div>
                      <span className="text-xs sm:text-sm font-medium text-gray-700">
                        {milestone.label}
                      </span>
                    </div>
                    {index < milestones.length - 1 && (
                      <ArrowRight className="h-4 w-4 sm:h-5 sm:w-5 text-gray-400 mx-2 sm:mx-3 hidden sm:block" />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Great for / Not for Section */}
      <section className="py-12 sm:py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="border border-primary/20">
              <CardContent className="py-4 px-5">
                <h3 className="text-base font-semibold text-gray-900 mb-3">Great for</h3>
                <ul className="space-y-1.5 text-sm text-gray-600">
                  <li>• Couples and small groups</li>
                  <li>• Groups up to ~15 people</li>
                  <li>• When 1–2 people organize</li>
                </ul>
              </CardContent>
            </Card>

            <Card className="border border-gray-200">
              <CardContent className="py-4 px-5">
                <h3 className="text-base font-semibold text-gray-900 mb-3">Not for (yet)</h3>
                <ul className="space-y-1.5 text-sm text-gray-600">
                  <li>• Booking sites</li>
                  <li>• Rigid checklists</li>
                  <li>• Solo planning</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="bg-primary/5 py-20 sm:py-24">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-12">
            Ready to plan your next trip?
          </h2>
          <div className="flex flex-col sm:flex-row gap-4 justify-center mt-8">
            <Button size="lg" asChild className="text-lg px-10">
              <Link href="/signup">Create an account</Link>
            </Button>
            <Button size="lg" variant="outline" asChild className="text-lg px-10">
              <Link href="/login">Log in</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-center">
            <TrypzyLogo variant="full" className="h-6 w-auto" />
          </div>
        </div>
      </footer>
    </div>
  )
}
