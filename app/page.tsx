import { redirect } from 'next/navigation'

/** Root: ALWAYS go to login first, never directly to onboarding or dashboard. No auth checks. */
export default function HomePage() {
  redirect('/auth/login')
}
