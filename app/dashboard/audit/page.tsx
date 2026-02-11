'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { getProfilePageData } from '@/lib/services/profilePage'
import { getOrganisationIdForCurrentUser } from '@/lib/services/organisations'
import { getTeamMembers } from '@/lib/services/team'
import { supabase } from '@/lib/supabase'
import AuditLogViewer from '@/components/audit/AuditLogViewer'

const ALLOWED_LEVELS = ['employer', 'gm', 'agm'] as const

export default function AuditPage() {
  const [organisationId, setOrganisationId] = useState<string | null>(null)
  const [canView, setCanView] = useState(false)
  const [userFilterOptions, setUserFilterOptions] = useState<{ id: string; label: string }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (cancelled || !user) {
          setLoading(false)
          return
        }

        let orgId: string | null = null
        let allowed = false

        const { data: teamData, error: teamError } = await supabase
          .from('team_members')
          .select('organisation_id, hierarchy_level')
          .eq('user_id', user.id)
          .in('status', ['active', 'pending'])
          .limit(1)
          .maybeSingle()

        if (!teamError && teamData?.organisation_id) {
          orgId = (teamData as { organisation_id: string }).organisation_id
          const level = (teamData as { hierarchy_level?: string }).hierarchy_level
          allowed = level ? ALLOWED_LEVELS.includes(level as (typeof ALLOWED_LEVELS)[number]) : false
        }

        if (!orgId) {
          try {
            const profileData = await getProfilePageData()
            if (profileData) {
              orgId = profileData.organisationId
              allowed = ALLOWED_LEVELS.includes(profileData.hierarchyLevel as (typeof ALLOWED_LEVELS)[number])
            }
          } catch (e) {
            console.warn('Audit page getProfilePageData failed:', e)
          }
        }

        if (!orgId) {
          orgId = await getOrganisationIdForCurrentUser()
        }

        // If we have org but not allowed yet, user may be owner-only (not in team_members)
        if (orgId && !allowed) {
          const level = (teamData as { hierarchy_level?: string } | null)?.hierarchy_level
          if (level && ALLOWED_LEVELS.includes(level as (typeof ALLOWED_LEVELS)[number])) {
            allowed = true
          } else {
            const { data: orgRow } = await supabase
              .from('organisations')
              .select('owner_id')
              .eq('id', orgId)
              .maybeSingle()
            if ((orgRow as { owner_id?: string } | null)?.owner_id === user?.id) {
              allowed = true
            }
          }
        }

        if (cancelled) return
        setOrganisationId(orgId)
        setCanView(allowed ?? false)

        if (allowed && orgId) {
          const members = await getTeamMembers(orgId)
          const options = (members ?? []).map((m) => {
            const uid = (m as { user_id?: string }).user_id
            const profile = (m as { profile?: { full_name?: string; email?: string } }).profile
            const label =
              profile?.full_name?.trim() || profile?.email || (uid ? '—' : '—')
            return { id: uid ?? '', label }
          }).filter((o) => o.id)
          setUserFilterOptions(options)
        }
      } catch (e) {
        console.error('Audit page load:', e)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-6rem)] bg-gradient-to-br from-purple-700 via-purple-800 to-purple-900 flex items-center justify-center">
        <p className="text-white text-lg">Loading...</p>
      </div>
    )
  }

  if (!organisationId) {
    return (
      <div className="min-h-[calc(100vh-6rem)] bg-gradient-to-br from-purple-600 via-purple-700 to-blue-600">
        <div className="max-w-3xl mx-auto p-6">
          <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-lg p-6 text-gray-900">
            <p className="mb-4">No organisation selected.</p>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1 text-purple-600 hover:text-purple-700 font-medium"
            >
              <ChevronLeft className="w-4 h-4" />
              Back to dashboard
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 to-blue-500 p-4">
      <div className="max-w-6xl mx-auto pb-12">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 text-white hover:text-white/90 mb-6"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to dashboard
        </Link>
        <div className="bg-white rounded-lg shadow-lg p-6 text-gray-900">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Audit Log</h1>
          <p className="text-gray-600 mb-6">
            Track changes in your organisation.
          </p>
          <AuditLogViewer
            organisationId={organisationId}
            teamMembersForFilter={userFilterOptions}
            canView={canView}
          />
        </div>
      </div>
    </div>
  )
}
