import './globals.css'
import { Toaster } from 'sonner'
import { Inter } from 'next/font/google'
import { SessionProvider } from '@/components/providers/SessionProvider'
import * as Sentry from '@sentry/nextjs'

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '600'],
  variable: '--font-inter',
  display: 'swap',
})

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export function generateMetadata() {
  return {
    title: 'Tripti.ai — Nifty plans. Happy circles.',
    description: 'Private, trust-based trip planning for friend groups',
    openGraph: {
      title: 'Tripti.ai — Nifty plans. Happy circles.',
      description: 'Private, trust-based trip planning for friend groups',
      url: 'https://tripti.ai',
      siteName: 'Tripti.ai',
      images: [
        {
          url: 'https://tripti.ai/brand/logomark-png/tripti.ai-lm-primary-white-on-red1024x1024.png',
          width: 1024,
          height: 1024,
          alt: 'Tripti.ai logo',
        },
      ],
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title: 'Tripti.ai — Nifty plans. Happy circles.',
      description: 'Private, trust-based trip planning for friend groups',
      images: ['https://tripti.ai/brand/logomark-png/tripti.ai-lm-primary-white-on-red1024x1024.png'],
    },
    other: {
      ...Sentry.getTraceData()
    }
  }
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={inter.variable}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&family=Georgia&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen bg-background font-sans antialiased">
        <SessionProvider>
          {children}
        </SessionProvider>
        <Toaster position="top-right" />
      </body>
    </html>
  )
}
