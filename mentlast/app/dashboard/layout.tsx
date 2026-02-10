'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Navigation from '@/components/navigation'
import { getOrganisationIdForCurrentUser } from '@/lib/services/organisations'
import { supabase } from '@/lib/supabase'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    async function check() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          router.replace('/login')
          return
        }
        if (pathname === '/dashboard' || pathname === '/dashboard/') {
          const orgId = await getOrganisationIdForCurrentUser()
          if (!orgId) {
            router.replace('/dashboard/setup')
            return
          }
        }
      } catch (err) {
        // Don't redirect to setup on error (e.g. 500 from Supabase) — user may have existing data
        console.error('[Dashboard layout] auth/org check failed:', err)
      } finally {
        setChecking(false)
      }
    }
    check()
  }, [router, pathname])

  if (checking) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-gray-600">Loading...</div>
      </div>
    )
  }

  return (
    <>
      <Navigation />
      <main className="pt-16">
        {children}
      </main>
    </>
  )
}
