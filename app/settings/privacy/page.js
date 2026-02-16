import { redirect } from 'next/navigation'

export default function PrivacySettingsRedirect() {
  redirect('/settings#privacy')
}
