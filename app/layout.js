import './globals.css'
import { Toaster } from 'sonner'

export const metadata = {
  title: 'Trypzy - Trips made easy',
  description: 'Private, trust-based trip planning for friend groups',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background font-sans antialiased">
        {children}
        <Toaster position="top-right" />
      </body>
    </html>
  )
}
