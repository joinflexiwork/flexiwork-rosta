'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { UserPlus, Users, ChevronRight } from 'lucide-react'
import { getTeamMembers } from '@/lib/services/team'
import { getOrganisationIdForCurrentUser } from '@/lib/services/organisations'

export default function WorkersPage() {
  const [orgId, setOrgId] = useState<string>('')
  const [members, setMembers] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    getOrganisationIdForCurrentUser()
      .then((id) => {
        if (cancelled || !id) return
        setOrgId(id)
        return getTeamMembers(id)
      })
      .then((data) => {
        if (!cancelled && data) setMembers(data)
      })
      .catch((e) => console.error(e))
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-gray-600">Loading workers...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Worker profiles</h1>
          <Link
            href="/dashboard/team"
            className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg font-medium hover:opacity-90"
          >
            <UserPlus className="w-4 h-4" />
            Add employee
          </Link>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {members.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <Users className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>No team members yet.</p>
              <Link href="/dashboard/team" className="mt-3 inline-block text-blue-600 font-medium hover:underline">
                Invite employees from Team
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Assigned venues</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Roles</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-3 w-10" aria-hidden />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {members.map((m) => {
                    const profile = m.profile as { full_name?: string; email?: string } | undefined
                    const name = profile?.full_name ?? (m.full_name as string) ?? (m.email as string) ?? 'Pending'
                    const email = profile?.email ?? (m.email as string) ?? '—'
                    const rolesList = (m.roles as { role?: { name?: string } }[] | undefined) ?? []
                    const roleNames = rolesList.map((r) => r.role?.name).filter(Boolean).join(', ') || '—'
                    const venuesList = (m.venues as { venue?: { name?: string } }[] | undefined) ?? []
                    const venueNames = venuesList.map((v) => v.venue?.name).filter(Boolean).join(', ') || '—'
                    const status = String(m.status ?? '—')
                    return (
                      <tr key={String(m.id)} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{name}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{email}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{venueNames}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{roleNames}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${
                              status === 'active'
                                ? 'bg-green-100 text-green-800'
                                : status === 'pending'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-gray-100 text-gray-700'
                            }`}
                          >
                            {status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/dashboard/workers/${m.id}`}
                            className="inline-flex items-center gap-0.5 text-blue-600 hover:text-blue-800 text-sm font-medium"
                          >
                            View <ChevronRight className="w-4 h-4" />
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
