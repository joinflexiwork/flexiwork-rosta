'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Worker profiles are now managed from the Team tab (View button per member).
 * Redirect /dashboard/workers to /dashboard/team.
 */
export default function WorkersPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/dashboard/team')
  }, [router])
  return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <p className="text-gray-600">Redirecting to Team...</p>
    </div>
  )
}
