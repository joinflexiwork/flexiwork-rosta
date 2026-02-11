'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import UniversalHeader from '@/components/UniversalHeader'
import DashboardHeaderActions from '@/components/dashboard/DashboardHeaderActions'
import EmployerNav from '@/components/layout/EmployerNav'
import { getOrganisationIdForCurrentUser, hasTeamMembership } from '@/lib/services/organisations'
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
          router.replace('/auth/login')
          return
        }
        if (pathname === '/dashboard' || pathname === '/dashboard/') {
          let orgId = await getOrganisationIdForCurrentUser()
          if (!orgId) {
            await new Promise((r) => setTimeout(r, 400))
            orgId = await getOrganisationIdForCurrentUser()
          }
          if (orgId) {
            return
          }
          const isInvitedEmployee = await hasTeamMembership()
          if (isInvitedEmployee) {
            router.replace('/employee/dashboard')
            return
          }
          router.replace('/dashboard/setup')
          return
        }
      } catch (err) {
        console.error('[Dashboard layout] auth/org check failed:', err)
      } finally {
        setChecking(false)
      }
    }
    check()
  }, [router, pathname])

  if (checking) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-white">Loading...</div>
      </div>
    )
  }

  return (
    <>
      <UniversalHeader backFallbackHref="/dashboard" rightSlot={<DashboardHeaderActions />} />
      <EmployerNav />
      <main className="min-h-screen pt-24 px-4">
        {children}
      </main>
    </>
  )
}
