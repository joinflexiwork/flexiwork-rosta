'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { Users, UserPlus, X, Trash2, Star } from 'lucide-react'
import { getTeamMembers, deleteTeamMember, getTeamMemberWithRoles, updateTeamMemberProfile } from '@/lib/services/team'
import { getRolesByOrg } from '@/lib/services/roles'
import { getVenuesByOrg } from '@/lib/services/venues'
import { getOrganisationIdForCurrentUser } from '@/lib/services/organisations'
import { getOrganisationSettings } from '@/lib/services/settings'
import { getTeamHierarchy } from '@/app/actions/hierarchy'
import { supabase } from '@/lib/supabase'
import type { HierarchyLevel } from '@/lib/types/hierarchy'
import { HIERARCHY_RULES } from '@/lib/types/hierarchy'
import HierarchyTree from './_components/HierarchyTree'
import InviteModal from './_components/InviteModal'

export default function TeamPage() {
  const [organisationId, setOrganisationId] = useState<string>('')
  const [showRatings, setShowRatings] = useState(true)
  const [members, setMembers] = useState<Record<string, unknown>[]>([])
  const [roles, setRoles] = useState<Record<string, unknown>[]>([])
  const [venues, setVenues] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(true)
  const [inviteModalType, setInviteModalType] = useState<HierarchyLevel | null>(null)
  const [filterRoleIds, setFilterRoleIds] = useState<string[]>([])
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterSearch, setFilterSearch] = useState<string>('')
  const [memberToDelete, setMemberToDelete] = useState<Record<string, unknown> | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [profileMember, setProfileMember] = useState<Record<string, unknown> | null>(null)
  const [hierarchyData, setHierarchyData] = useState<{ members: Record<string, unknown>[]; chain: { manager_id: string; subordinate_id: string }[] } | null>(null)
  const [myHierarchyLevel, setMyHierarchyLevel] = useState<HierarchyLevel>('employer')
  const [currentUserId, setCurrentUserId] = useState<string>('')

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      const orgId = await getOrganisationIdForCurrentUser()
      if (!orgId) return
      setOrganisationId(orgId)
      const [membersData, rolesData, venuesData, settings, hierarchy] = await Promise.all([
        getTeamMembers(orgId),
        getRolesByOrg(orgId),
        getVenuesByOrg(orgId),
        getOrganisationSettings(orgId),
        getTeamHierarchy(orgId).catch(() => ({ members: [], chain: [] })),
      ])
      setMembers(membersData)
      setRoles((rolesData as unknown) as Record<string, unknown>[])
      setVenues((venuesData as unknown) as Record<string, unknown>[])
      setShowRatings(settings.show_ratings !== false)
      setHierarchyData({ members: hierarchy.members, chain: hierarchy.chain })
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setCurrentUserId(user.id)
        const myMember = hierarchy.members.find((m) => (m as { user_id?: string }).user_id === user.id) as { hierarchy_level?: HierarchyLevel } | undefined
        setMyHierarchyLevel(myMember?.hierarchy_level ?? 'employer')
      }
    } catch (e) {
      console.error('Team load error:', e)
    } finally {
      setLoading(false)
    }
  }

  const filteredMembers = useMemo(() => {
    let list = members
    if (filterRoleIds.length > 0) {
      list = list.filter((m) => {
        const rolesList = m.roles as { role?: { id?: string } }[] | undefined
        const memberRoleIds = rolesList?.map((r) => r.role?.id).filter(Boolean) ?? []
        return filterRoleIds.some((rid) => memberRoleIds.includes(rid))
      })
    }
    if (filterStatus !== 'all') {
      list = list.filter((m) => String(m.status) === filterStatus)
    }
    if (filterSearch.trim()) {
      const q = filterSearch.trim().toLowerCase()
      list = list.filter((m) => {
        const profile = m.profile as { full_name?: string; email?: string } | undefined
        const name = profile?.full_name ?? (m.email as string) ?? ''
        const email = profile?.email ?? (m.email as string) ?? ''
        return name.toLowerCase().includes(q) || email.toLowerCase().includes(q)
      })
    }
    // When a role filter is applied, sort by rating descending (null/undefined = 0)
    if (filterRoleIds.length > 0) {
      list = [...list].sort((a, b) => (Number(b.rating) ?? 0) - (Number(a.rating) ?? 0))
    }
    return list
  }, [members, filterRoleIds, filterStatus, filterSearch])

  const sortedByRating = showRatings && filterRoleIds.length > 0

  const hasActiveFilters = filterRoleIds.length > 0 || filterStatus !== 'all' || filterSearch.trim() !== ''

  async function handleConfirmDelete() {
    if (!memberToDelete) return
    setDeleting(true)
    try {
      await deleteTeamMember(String(memberToDelete.id))
      setMemberToDelete(null)
      loadData()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to delete member')
    } finally {
      setDeleting(false)
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
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Manage Team</h1>
          <div className="flex gap-2 flex-wrap">
            {(() => {
              const rules = HIERARCHY_RULES[myHierarchyLevel]
              const canInvite = rules?.canInvite ?? []
              if (canInvite.length === 0) {
                return (
                  <span className="px-4 py-2 text-sm text-gray-500 border border-gray-200 rounded-lg bg-gray-50">
                    You cannot invite members
                  </span>
                )
              }
              const labels: Record<HierarchyLevel, string> = {
                employer: 'Invite Employer',
                gm: 'Invite General Manager',
                agm: 'Invite Assistant GM',
                shift_leader: 'Invite Shift Leader',
                worker: 'Invite Worker',
              }
              return canInvite.map((level, idx) => {
                const isPrimary = idx === 0
                const isOutline = idx === canInvite.length - 1 && canInvite.length > 1
                return (
                  <button
                    key={level}
                    type="button"
                    onClick={() => setInviteModalType(level)}
                    className={`px-4 py-2 rounded-lg font-medium flex items-center gap-2 ${
                      isPrimary
                        ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white hover:opacity-90'
                        : isOutline
                          ? 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                          : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                    }`}
                  >
                    <UserPlus className="w-4 h-4" />
                    {labels[level] ?? `Invite ${level}`}
                  </button>
                )
              })
            })()}
          </div>
        </div>

        {hierarchyData && (hierarchyData.members.length > 0 || hierarchyData.chain.length > 0) && (
          <div className="mb-6">
            <HierarchyTree members={hierarchyData.members as { id: string; user_id: string | null; organisation_id: string; hierarchy_level?: HierarchyLevel; profile?: { full_name?: string; email?: string } }[]} chain={hierarchyData.chain} />
          </div>
        )}

        {/* Filter bar: roles from getRolesByOrg (roles table where organisation_id = current user's org) */}
        <div className="flex flex-wrap items-center gap-4 mb-6 p-4 bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center gap-2 flex-wrap">
            <label className="text-sm font-medium text-gray-700">Role</label>
            <div className="flex flex-wrap gap-2">
              {roles.map((r) => (
                <label key={String(r.id)} className="inline-flex items-center gap-1.5 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filterRoleIds.includes(String(r.id))}
                    onChange={(e) => {
                      if (e.target.checked) setFilterRoleIds((prev) => [...prev, String(r.id)])
                      else setFilterRoleIds((prev) => prev.filter((id) => id !== r.id))
                    }}
                    className="rounded border-gray-300"
                  />
                  {String(r.name)}
                </label>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">Status</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="border border-gray-300 rounded-lg p-2 text-sm"
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="pending">Pending</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">Search</label>
            <input
              type="text"
              placeholder="Name or email..."
              value={filterSearch}
              onChange={(e) => setFilterSearch(e.target.value)}
              className="border border-gray-300 rounded-lg p-2 text-sm w-48"
            />
          </div>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => {
                setFilterRoleIds([])
                setFilterStatus('all')
                setFilterSearch('')
              }}
              className="px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg border border-gray-200"
            >
              Clear filters
            </button>
          )}
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-200 flex justify-between items-center flex-wrap gap-2">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Team Members</h2>
              {showRatings && sortedByRating && (
                <p className="text-xs text-gray-500 mt-0.5">Sorted by rating: High to Low</p>
              )}
            </div>
            <span className="text-sm text-gray-500">
              Showing {filteredMembers.length} of {members.length} members
            </span>
          </div>
          <div className="overflow-x-auto">
            {members.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                No team members yet. Invite an employee or manager to get started.
              </div>
            ) : filteredMembers.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                No members match the current filters.
              </div>
            ) : (
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Name</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Type</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Status</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Role</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Shifts</th>
                    {showRatings && (
                      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Rating{sortedByRating ? ' ↓' : ''}</th>
                    )}
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 w-28">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredMembers.map((m) => {
                    const profile = m.profile as { full_name?: string; email?: string } | undefined
                    const rolesList = m.roles as { role?: { name?: string } }[] | undefined
                    const roleNames = rolesList?.map((r) => r.role?.name).filter(Boolean).join(', ') ?? '—'
                    const primaryVenue = m.primary_venue as { name?: string } | undefined
                    const name = profile?.full_name ?? (m.email as string) ?? 'Pending'
                    const email = profile?.email ?? (m.email as string) ?? ''
                    const memberRating = typeof m.rating === 'number' ? m.rating : null
                    return (
                      <tr key={String(m.id)} className="hover:bg-gray-50/50">
                        <td className="py-3 px-4">
                          <div className="font-medium text-gray-900">{name}</div>
                          {email && <div className="text-xs text-gray-500">{email}</div>}
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-600">{String(m.member_type)}</td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${m.status === 'active' ? 'bg-green-100 text-green-800' : m.status === 'inactive' ? 'bg-gray-100 text-gray-700' : 'bg-amber-100 text-amber-800'}`}>
                            {String(m.status)}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-600">{roleNames}</td>
                        <td className="py-3 px-4 text-sm text-gray-600">
                          <Link href={`/dashboard/workers/${m.id}`} className="text-blue-600 hover:underline">
                            View
                          </Link>
                        </td>
                        {showRatings && (
                          <td className="py-3 px-4">
                            {memberRating != null ? (
                              <span className="inline-flex items-center gap-0.5" title={`${memberRating}/5`}>
                                {[1, 2, 3, 4, 5].map((v) => (
                                  <Star
                                    key={v}
                                    className="w-4 h-4"
                                    fill={v <= memberRating ? '#eab308' : 'none'}
                                    stroke={v <= memberRating ? '#eab308' : '#d1d5db'}
                                    strokeWidth={1.5}
                                  />
                                ))}
                              </span>
                            ) : (
                              <span className="text-gray-400 text-sm">—</span>
                            )}
                          </td>
                        )}
                        <td className="py-3 px-4 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setProfileMember(m)}
                            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                          >
                            View
                          </button>
                          <button
                            type="button"
                            onClick={() => setMemberToDelete(m)}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"
                            title="Delete member"
                          >
                            <Trash2 className="w-4 h-4" />
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

      {/* Delete confirmation modal */}
      {memberToDelete && (
        <DeleteMemberModal
          member={memberToDelete}
          onClose={() => setMemberToDelete(null)}
          onConfirm={handleConfirmDelete}
          deleting={deleting}
        />
      )}

      {profileMember && (
        <TeamMemberProfileModal
          member={profileMember}
          organisationId={organisationId}
          roles={roles}
          venues={venues}
          currentUserHierarchyLevel={myHierarchyLevel}
          currentUserId={currentUserId}
          onClose={() => setProfileMember(null)}
          onSave={() => {
            setProfileMember(null)
            loadData()
          }}
        />
      )}

      {inviteModalType && organisationId && (
        <InviteModal
          isOpen={true}
          onClose={() => setInviteModalType(null)}
          inviteType={inviteModalType as 'gm' | 'agm' | 'shift_leader' | 'worker'}
          inviterId={currentUserId}
          organisationId={organisationId}
          venues={venues.map((v) => ({ id: String(v.id), name: String((v as { name?: string }).name ?? v.id) }))}
          onSuccess={() => loadData()}
        />
      )}
    </div>
  )
}

const POSITION_OPTIONS = [
  { value: 'gm', label: 'General Manager', level: 1 },
  { value: 'agm', label: 'Assistant General Manager', level: 2 },
  { value: 'shift_leader', label: 'Shift Leader', level: 3 },
  { value: 'worker', label: 'Worker', level: 4 },
] as const

const HIERARCHY_LEVEL_INDEX: Record<string, number> = {
  employer: 0,
  gm: 1,
  agm: 2,
  shift_leader: 3,
  worker: 4,
}

function TeamMemberProfileModal({
  member,
  organisationId,
  roles: orgRoles,
  venues,
  currentUserHierarchyLevel,
  currentUserId,
  onClose,
  onSave,
}: {
  member: Record<string, unknown>
  organisationId: string
  roles: Record<string, unknown>[]
  venues: Record<string, unknown>[]
  currentUserHierarchyLevel: HierarchyLevel
  currentUserId: string
  onClose: () => void
  onSave: () => void
}) {
  const [fullMember, setFullMember] = useState<Record<string, unknown> | null>(null)
  const [settings, setSettings] = useState<{ show_ratings: boolean } | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([])
  const [rating, setRating] = useState<number | null>(null)
  const [primaryVenueId, setPrimaryVenueId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedPosition, setSelectedPosition] = useState<string>('worker')
  const [availablePositions, setAvailablePositions] = useState<typeof POSITION_OPTIONS>([])
  const [canEditPosition, setCanEditPosition] = useState(true)
  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!member?.id) return
      setLoading(true)
      setError(null)
      try {
        const [data, orgSettings] = await Promise.all([
          getTeamMemberWithRoles(String(member.id)),
          organisationId ? getOrganisationSettings(organisationId) : Promise.resolve({ show_ratings: true }),
        ])
        if (cancelled) return
        setFullMember(data ?? null)
        setSettings(orgSettings ?? { show_ratings: true })
        if (data) {
          const rolesList = (data.roles as { role_id?: string }[] | undefined) ?? []
          setSelectedRoleIds(rolesList.map((r) => r.role_id).filter(Boolean) as string[])
          setRating(typeof data.rating === 'number' ? data.rating : null)
          const pv = data.primary_venue_id ?? (data.primary_venue as { id?: string } | undefined)?.id
          setPrimaryVenueId(pv ? String(pv) : null)
          const hl = (data.hierarchy_level as string) || 'worker'
          setSelectedPosition(['gm', 'agm', 'shift_leader', 'worker'].includes(hl) ? hl : 'worker')
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load member')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [member?.id, organisationId])

  useEffect(() => {
    if (!fullMember) return
    const currentLevelIndex = HIERARCHY_LEVEL_INDEX[currentUserHierarchyLevel] ?? 4
    const memberLevel = (fullMember.hierarchy_level as string) || 'worker'
    const targetLevelIndex = HIERARCHY_LEVEL_INDEX[memberLevel] ?? 4
    const filtered = POSITION_OPTIONS.filter((opt) => opt.level > currentLevelIndex)
    setAvailablePositions(filtered)
    setCanEditPosition(targetLevelIndex > currentLevelIndex)
  }, [fullMember, currentUserHierarchyLevel])

  function toggleRole(roleId: string) {
    setSelectedRoleIds((prev) => {
      if (prev.includes(roleId)) return prev.filter((id) => id !== roleId)
      if (prev.length >= 5) return prev
      return [...prev, roleId]
    })
  }

  function removeRole(roleId: string) {
    setSelectedRoleIds((prev) => prev.filter((id) => id !== roleId))
  }

  async function handleSave() {
    if (!fullMember?.id) return
    if (selectedRoleIds.length === 0) {
      setError('Select at least one role.')
      return
    }
    setSaving(true)
    setError(null)
    const previousPosition = (fullMember.hierarchy_level as string) || 'worker'
    const positionChanged = selectedPosition !== previousPosition
    try {
      await updateTeamMemberProfile(String(fullMember.id), {
        role_ids: selectedRoleIds,
        primary_venue_id: primaryVenueId || undefined,
        hierarchy_level: selectedPosition,
      })
      if (positionChanged && currentUserId && fullMember.user_id) {
        const newLabel = POSITION_OPTIONS.find((p) => p.value === selectedPosition)?.label ?? selectedPosition
        try {
          const { error: notifErr } = await supabase.from('notifications').insert({
            user_id: fullMember.user_id,
            type: 'hierarchy_change',
            title: 'Position updated',
            message: `Your position has been changed to ${newLabel}.`,
            data: {
              old_position: previousPosition,
              new_position: selectedPosition,
              changed_by: currentUserId,
            },
          })
          if (notifErr) console.warn('[Team] Notification insert failed (non-blocking):', notifErr.message, notifErr.code)
        } catch (_) {
          // non-blocking: position was still saved
        }
      }
      onSave()
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to save'
      setError(message)
      console.error('[Team] updateTeamMemberProfile error:', e)
    } finally {
      setSaving(false)
    }
  }

  const profile = fullMember?.profile as { full_name?: string; email?: string } | undefined
  const name = profile?.full_name ?? (fullMember?.email as string) ?? 'Pending'
  const email = profile?.email ?? (fullMember?.email as string) ?? ''
  const joinDate = fullMember?.joined_at
    ? new Date(String(fullMember.joined_at)).toLocaleDateString()
    : '—'
  const primaryVenue = fullMember?.primary_venue as { id?: string; name?: string } | undefined

  const roleIdToRole = (id: string) =>
    orgRoles.find((r) => String(r.id) === id) as { id: string; name?: string; colour?: string } | undefined
  const selectedRoles = selectedRoleIds.map((id) => ({ id, ...roleIdToRole(id) }))

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-[600px] max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center p-6 border-b border-gray-200 shrink-0">
          <h2 className="text-xl font-bold text-gray-900">Team member profile</h2>
          <button type="button" onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 min-h-0 p-6 space-y-6">
          {loading ? (
            <div className="text-gray-500 py-8 text-center">Loading...</div>
          ) : error && !fullMember ? (
            <div className="text-red-600 py-4">{error}</div>
          ) : fullMember ? (
            <>
              {/* Profile (read-only) */}
              <section>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Profile</h3>
                <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
                  <div><span className="text-gray-500">Name:</span> {name}</div>
                  <div><span className="text-gray-500">Email:</span> {email || '—'}</div>
                  <div><span className="text-gray-500">Type:</span> {String(fullMember.member_type ?? '—')}</div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-gray-700">Position</label>
                    <select
                      value={selectedPosition}
                      onChange={(e) => setSelectedPosition(e.target.value)}
                      disabled={!canEditPosition}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white disabled:bg-gray-100 disabled:cursor-not-allowed"
                    >
                      {availablePositions.map((pos) => (
                        <option key={pos.value} value={pos.value}>
                          {pos.label}
                        </option>
                      ))}
                      {availablePositions.length === 0 && (
                        <option value={selectedPosition}>
                          {POSITION_OPTIONS.find((p) => p.value === selectedPosition)?.label ?? selectedPosition}
                        </option>
                      )}
                    </select>
                    {!canEditPosition && (
                      <p className="text-xs text-gray-500">You cannot modify users at your level or above.</p>
                    )}
                  </div>
                  <div><span className="text-gray-500">Join date:</span> {joinDate}</div>
                </div>
              </section>

              {/* Roles */}
              <section>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Roles</h3>
                <div className="flex flex-wrap gap-2 mb-2">
                  {selectedRoles.map((r) => (
                    <span
                      key={r.id}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium text-white"
                      style={{ backgroundColor: (r as { colour?: string }).colour || '#6b7280' }}
                    >
                      {r.name ?? r.id}
                      <button type="button" onClick={() => removeRole(r.id)} className="ml-0.5 hover:opacity-80" aria-label="Remove role">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mb-2">Select 1–5 roles. Click a role below to add.</p>
                <div className="flex flex-wrap gap-2">
                  {orgRoles
                    .filter((r) => !selectedRoleIds.includes(String(r.id)))
                    .map((r) => (
                      <button
                        key={String(r.id)}
                        type="button"
                        onClick={() => toggleRole(String(r.id))}
                        className="px-3 py-1.5 rounded-full text-xs font-medium border border-gray-300 text-gray-700 hover:bg-gray-100"
                      >
                        {(r as { name?: string }).name ?? String(r.id)}
                      </button>
                    ))}
                </div>
              </section>

              {/* Assignments (Primary venue) */}
              <section>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Assignments</h3>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Primary venue</label>
                  <select
                    value={primaryVenueId ?? ''}
                    onChange={(e) => setPrimaryVenueId(e.target.value || null)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="">— Select —</option>
                    {venues.map((v) => (
                      <option key={String(v.id)} value={String(v.id)}>
                        {(v as { name?: string }).name ?? String(v.id)}
                      </option>
                    ))}
                  </select>
                </div>
              </section>

              {error && <p className="text-red-600 text-sm">{error}</p>}
            </>
          ) : null}
        </div>
        {fullMember && (
          <div className="flex gap-3 p-6 border-t border-gray-200 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg font-medium hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || selectedRoleIds.length === 0}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function DeleteMemberModal({
  member,
  onClose,
  onConfirm,
  deleting,
}: {
  member: Record<string, unknown>
  onClose: () => void
  onConfirm: () => void
  deleting: boolean
}) {
  const name =
    (member.profile as { full_name?: string })?.full_name ?? (member.email as string) ?? 'this member'
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-md w-full shadow-xl">
        <div className="flex justify-between items-center p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">Delete team member?</h2>
          <button type="button" onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-gray-600 text-sm">
            Are you sure? This will remove <strong>{name}</strong> from the team. Pending invites will be cancelled.
          </p>
          <p className="text-amber-700 text-xs">
            If the member has assigned shifts, you will need to reassign or delete those shifts first.
          </p>
        </div>
        <div className="flex gap-3 p-6 border-t border-gray-200">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg font-medium hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50"
          >
            {deleting ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
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
