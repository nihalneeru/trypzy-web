import { Suspense } from 'react'
import WelcomePageWrapper from './WelcomePageWrapper'

export default function Page() {
  return (
    <Suspense fallback={null}>
      <WelcomePageWrapper />
    </Suspense>
  )
}
