'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Users, UserPlus, X } from 'lucide-react'
import { getTeamMembers, inviteEmployee, inviteManager } from '@/lib/services/team'
import { getRolesByOrg } from '@/lib/services/roles'
import { getVenuesByOrg } from '@/lib/services/venues'
import { getOrganisationIdForCurrentUser } from '@/lib/services/organisations'

export default function TeamPage() {
  const [organisationId, setOrganisationId] = useState<string>('')
  const [members, setMembers] = useState<Record<string, unknown>[]>([])
  const [roles, setRoles] = useState<Record<string, unknown>[]>([])
  const [venues, setVenues] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(true)
  const [showInviteEmployee, setShowInviteEmployee] = useState(false)
  const [showInviteManager, setShowInviteManager] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      const orgId = await getOrganisationIdForCurrentUser()
      if (!orgId) return
      setOrganisationId(orgId)
      const [membersData, rolesData, venuesData] = await Promise.all([
        getTeamMembers(orgId),
        getRolesByOrg(orgId),
        getVenuesByOrg(orgId),
      ])
      setMembers(membersData)
      setRoles(rolesData as Record<string, unknown>[])
      setVenues(venuesData as Record<string, unknown>[])
    } catch (e) {
      console.error('Team load error:', e)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-gray-600">Loading team...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-16 z-40 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex gap-1 overflow-x-auto">
            <Link href="/dashboard" className="px-4 py-3 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-t-lg shrink-0">
              Employer Dashboard
            </Link>
            <Link href="/dashboard/rota" className="px-4 py-3 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-t-lg shrink-0">
              Create Roster
            </Link>
            <Link href="/dashboard/team" className="px-4 py-3 text-sm font-medium rounded-t-lg bg-gradient-to-r from-blue-500 to-purple-600 text-white shrink-0">
              Team
            </Link>
            <span className="px-4 py-3 text-sm text-gray-400 cursor-not-allowed shrink-0">Gig Platform</span>
            <span className="px-4 py-3 text-sm text-gray-400 cursor-not-allowed shrink-0">Worker Profile</span>
            <Link href="/dashboard/timekeeping" className="px-4 py-3 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-t-lg shrink-0">
              Timesheet Approval
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Manage Team</h1>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setShowInviteEmployee(true)}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium flex items-center gap-2"
            >
              <UserPlus className="w-4 h-4" />
              Invite Employee
            </button>
            <button
              type="button"
              onClick={() => setShowInviteManager(true)}
              className="px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg font-medium flex items-center gap-2"
            >
              <UserPlus className="w-4 h-4" />
              Invite Manager
            </button>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-lg font-bold text-gray-900">Team Members</h2>
          </div>
          <div className="overflow-x-auto">
            {members.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                No team members yet. Invite an employee or manager to get started.
              </div>
            ) : (
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Name</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Type</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Status</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Role</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 w-20">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {members.map((m) => {
                    const profile = m.profile as { full_name?: string; email?: string } | undefined
                    const rolesList = m.roles as { role?: { name?: string } }[] | undefined
                    const roleNames = rolesList?.map((r) => r.role?.name).filter(Boolean).join(', ') ?? '—'
                    const primaryVenue = m.primary_venue as { name?: string } | undefined
                    const name = profile?.full_name ?? (m.email as string) ?? 'Pending'
                    const email = profile?.email ?? (m.email as string) ?? ''
                    function showProfile() {
                      alert(
                        `Employee profile\n\n` +
                        `Name: ${name}\n` +
                        `Email: ${email || '—'}\n` +
                        `Type: ${String(m.member_type)}\n` +
                        `Status: ${String(m.status)}\n` +
                        `Role(s): ${roleNames}\n` +
                        `Primary venue: ${primaryVenue?.name ?? '—'}`
                      )
                    }
                    return (
                      <tr key={String(m.id)} className="hover:bg-gray-50/50">
                        <td className="py-3 px-4">
                          <div className="font-medium text-gray-900">{name}</div>
                          {email && <div className="text-xs text-gray-500">{email}</div>}
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-600">{String(m.member_type)}</td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${m.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
                            {String(m.status)}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-600">{roleNames}</td>
                        <td className="py-3 px-4">
                          <button
                            type="button"
                            onClick={showProfile}
                            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {showInviteManager && (
        <InviteManagerModal
          organisationId={organisationId}
          onClose={() => setShowInviteManager(false)}
          onSuccess={() => {
            setShowInviteManager(false)
            loadData()
          }}
        />
      )}
      {showInviteEmployee && (
        <InviteEmployeeModal
          organisationId={organisationId}
          roles={roles}
          venues={venues}
          onClose={() => setShowInviteEmployee(false)}
          onSuccess={() => {
            setShowInviteEmployee(false)
            loadData()
          }}
        />
      )}
    </div>
  )
}

function InviteManagerModal({
  organisationId,
  onClose,
  onSuccess,
}: {
  organisationId: string
  onClose: () => void
  onSuccess: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!organisationId || !email.trim()) {
      alert('Please enter email.')
      return
    }
    setLoading(true)
    try {
      const result = await inviteManager({
        organisation_id: organisationId,
        email: email.trim(),
        full_name: fullName.trim(),
      })
      if (result.manualLink) {
        const code = (result.teamMember as { invite_code?: string })?.invite_code ?? ''
        alert(
          `${result.message}\n\n` +
            `🔗 Link: ${result.manualLink}\n` +
            (code ? `📝 Manual code: ${code}\n\n` : '') +
            'Send to the manager. They can open the link in a browser or enter the code in the app.'
        )
      } else {
        alert(result.message || 'Invite sent.')
      }
      onSuccess()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to invite manager.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Invite Manager</h2>
          <button type="button" onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Full name</label>
            <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg font-medium disabled:opacity-50">
              {loading ? 'Sending...' : 'Send Invite'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function InviteEmployeeModal({
  organisationId,
  roles,
  venues,
  onClose,
  onSuccess,
}: {
  organisationId: string
  roles: Record<string, unknown>[]
  venues: Record<string, unknown>[]
  onClose: () => void
  onSuccess: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [employmentType, setEmploymentType] = useState<'full_time' | 'part_time'>('part_time')
  const [primaryVenueId, setPrimaryVenueId] = useState('')
  const [roleIds, setRoleIds] = useState<string[]>([])
  const [venueIds, setVenueIds] = useState<string[]>([])

  const venueId = primaryVenueId || (venues[0] as { id?: string } | undefined)?.id || ''

  function toggleRole(id: string) {
    setRoleIds((prev) => (prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]))
  }

  function toggleVenue(id: string) {
    setVenueIds((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!organisationId || !email.trim()) {
      alert('Please enter email.')
      return
    }
    if (!venueId) {
      alert('Please add at least one venue in Settings first.')
      return
    }
    if (roleIds.length === 0) {
      alert('Please select at least one role.')
      return
    }
    setLoading(true)
    try {
      const result = await inviteEmployee({
        organisation_id: organisationId,
        email: email.trim(),
        full_name: fullName.trim(),
        employment_type: employmentType,
        primary_venue_id: venueId,
        role_ids: roleIds,
        venue_ids: venueIds.length > 0 ? venueIds : [venueId],
      })
      if (result.manualLink) {
        const code = (result.teamMember as { invite_code?: string })?.invite_code ?? ''
        alert(
          `${result.message}\n\n` +
            `🔗 Link: ${result.manualLink}\n` +
            (code ? `📝 Manual code: ${code}\n\n` : '') +
            'Send to the worker. They can: 1) Open the link on their phone browser, or 2) In FlexiWork app tap "Have an invite code?" and enter the code.'
        )
      } else {
        alert(result.message || 'Invite sent.')
      }
      onSuccess()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to invite employee.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl my-8">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Invite Employee</h2>
          <button type="button" onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Full name</label>
            <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Employment type</label>
            <select value={employmentType} onChange={(e) => setEmploymentType(e.target.value as 'full_time' | 'part_time')} className="w-full border border-gray-300 rounded-lg px-3 py-2">
              <option value="part_time">Part-time</option>
              <option value="full_time">Full-time</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Primary venue *</label>
            <select value={primaryVenueId || venueId} onChange={(e) => setPrimaryVenueId(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2" required>
              {venues.map((v) => (
                <option key={String((v as { id: string }).id)} value={(v as { id: string }).id}>{(v as { name: string }).name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Roles *</label>
            <div className="flex flex-wrap gap-2">
              {roles.map((r) => (
                <label key={String((r as { id: string }).id)} className="inline-flex items-center gap-1">
                  <input type="checkbox" checked={roleIds.includes((r as { id: string }).id)} onChange={() => toggleRole((r as { id: string }).id)} />
                  <span className="text-sm">{(r as { name: string }).name}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Venues</label>
            <div className="flex flex-wrap gap-2">
              {venues.map((v) => (
                <label key={String((v as { id: string }).id)} className="inline-flex items-center gap-1">
                  <input type="checkbox" checked={venueIds.includes((v as { id: string }).id)} onChange={() => toggleVenue((v as { id: string }).id)} />
                  <span className="text-sm">{(v as { name: string }).name}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg font-medium disabled:opacity-50">
              {loading ? 'Sending...' : 'Send Invite'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
