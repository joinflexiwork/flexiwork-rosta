'use client'

import { useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

function LoginRedirectContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const redirect = searchParams.get('redirect')
    const url = redirect ? `/auth/login?redirect=${encodeURIComponent(redirect)}` : '/auth/login'
    router.replace(url)
  }, [router, searchParams])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <p className="text-gray-600">Redirecting...</p>
    </div>
  )
}

/** Redirect /login to /auth/login for backward compatibility */
export default function LoginRedirectPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <p className="text-gray-600">Redirecting...</p>
      </div>
    }>
      <LoginRedirectContent />
    </Suspense>
  )
}
