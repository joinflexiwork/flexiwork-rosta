'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { getMyOrganisations } from '@/lib/services/organisations'
import { getOrganisationSettings } from '@/lib/services/settings'

const TABS = [
  { href: '/dashboard', label: 'Employer Dashboard' },
  { href: '/dashboard/rota', label: 'Create Roster' },
  { href: '/dashboard/roster/view', label: 'View Roster' },
  { href: '/dashboard/team', label: 'Team' },
  { href: '/dashboard/workers', label: 'Worker Profile' },
  { href: '/dashboard/timekeeping', label: 'Timekeeping' },
] as const

export default function EmployerNav() {
  const pathname = usePathname()
  const [showGigFeatures, setShowGigFeatures] = useState(false)

  useEffect(() => {
    let cancelled = false
    getMyOrganisations()
      .then((orgs) => {
        if (cancelled || !orgs?.length) return
        const orgId = (orgs[0] as { id?: string })?.id
        if (!orgId) return
        return getOrganisationSettings(orgId)
      })
      .then((settings) => {
        if (cancelled || !settings) return
        setShowGigFeatures(settings.show_gig_features === true)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  return (
    <div className="sticky top-20 z-40 bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map(({ href, label }) => {
            const isActive = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
            return (
              <Link
                key={href}
                href={href}
                className={`px-4 py-3 text-sm font-medium rounded-t-lg shrink-0 ${
                  isActive
                    ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {label}
              </Link>
            )
          })}
          {showGigFeatures && (
            <Link
              href="/dashboard/gig"
              className={`px-4 py-3 text-sm font-medium rounded-t-lg shrink-0 ${
                pathname === '/dashboard/gig' || pathname.startsWith('/dashboard/gig')
                  ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              Gig Platform
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
