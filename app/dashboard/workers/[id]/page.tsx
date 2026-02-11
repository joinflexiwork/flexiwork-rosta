'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Trash2,
  History,
  KeyRound,
} from 'lucide-react'
import {
  ProfileHeader,
  StatsCards,
  HierarchySection,
  RolesList,
  DetailsCard,
} from '@/components/profile'
import { getTeamMemberWithRoles, deleteTeamMember } from '@/lib/services/team'
import { getWorkerStats } from '@/lib/services/profile'
import { updateTeamMemberComplete } from '@/app/actions/team-member-actions'
import { getVenuesByOrg } from '@/lib/services/venues'
import { getRolesByOrg } from '@/lib/services/roles'
import { getOrganisationSettings } from '@/lib/services/settings'
import { getTeamHierarchy } from '@/app/actions/hierarchy'
import { supabase } from '@/lib/supabase'
import { canEditWorker, canPromoteTo, getAllowedPositionLevels } from '@/lib/permissions/hierarchy'
import type { HierarchyLevel } from '@/lib/types/hierarchy'
import { getAuditLogs } from '@/lib/services/auditService'
import type { AuditLogEntry } from '@/lib/services/auditService'
import { generatePasswordResetLink } from '@/app/actions/auth-actions'

export default function WorkerDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params?.id as string
  const [member, setMember] = useState<Record<string, unknown> | null>(null)
  const [stats, setStats] = useState<{ attendanceRatePercent: number; averageRating: number | null; averageResponseTimeMinutes: number | null; hoursWorked: number } | null>(null)
  const [venues, setVenues] = useState<Record<string, unknown>[]>([])
  const [roles, setRoles] = useState<Record<string, unknown>[]>([])
  const [showRatings, setShowRatings] = useState(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const [fullName, setFullName] = useState('')
  const [selectedVenueIds, setSelectedVenueIds] = useState<string[]>([])
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([])
  const [primaryVenueId, setPrimaryVenueId] = useState<string | null>(null)
  const [currentUserLevel, setCurrentUserLevel] = useState<HierarchyLevel>('worker')
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([])
  const [selectedPosition, setSelectedPosition] = useState<string>('worker')
  const [status, setStatus] = useState<string>('active')
  const [isEditing, setIsEditing] = useState(false)
  const [resetPasswordLoading, setResetPasswordLoading] = useState(false)
  const [resetPasswordLink, setResetPasswordLink] = useState<string | null>(null)
  const [resetPasswordError, setResetPasswordError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const [memberData, statsData] = await Promise.all([
        getTeamMemberWithRoles(id),
        getWorkerStats(id),
      ])
      if (!memberData) {
        setMember(null)
        setLoading(false)
        return
      }
      const orgId = String(memberData.organisation_id ?? '')
      const [venuesList, rolesList, orgSettings] = await Promise.all([
        orgId ? getVenuesByOrg(orgId) : [],
        orgId ? getRolesByOrg(orgId) : [],
        orgId ? getOrganisationSettings(orgId) : Promise.resolve({ show_ratings: true }),
      ])
      setMember(memberData)
      setStats(statsData ?? null)
      setVenues((venuesList ?? []) as Record<string, unknown>[])
      setRoles((rolesList ?? []) as Record<string, unknown>[])
      setShowRatings((orgSettings as { show_ratings?: boolean })?.show_ratings !== false)

      const profile = memberData.profile as { full_name?: string } | undefined
      setFullName(profile?.full_name ?? (memberData.full_name as string) ?? (memberData.email as string) ?? '')
      const rolesArr = (memberData.roles as { role_id?: string }[] | undefined) ?? []
      setSelectedRoleIds(rolesArr.map((r) => r.role_id).filter(Boolean) as string[])
      const venuesArr = (memberData.venues as { venue_id?: string; venue?: { id?: string } }[] | undefined) ?? []
      const vIds = venuesArr.map((v) => v.venue_id ?? v.venue?.id).filter(Boolean) as string[]
      setSelectedVenueIds(vIds)
      const pv = memberData.primary_venue_id ?? (memberData.primary_venue as { id?: string } | undefined)?.id
      setPrimaryVenueId(pv ? String(pv) : vIds[0] ?? null)
      const hl = (memberData.hierarchy_level as string) || 'worker'
      setSelectedPosition(['gm', 'agm', 'shift_leader', 'worker'].includes(hl) ? hl : 'worker')
      setStatus(String(memberData.status ?? 'active'))

      const { data: { user } } = await supabase.auth.getUser()
      if (user && orgId) {
        // Organization Owner: check organisations.owner_id (owner may not be in team_members)
        const { data: org } = await supabase.from('organisations').select('owner_id').eq('id', orgId).single()
        const ownerId = (org as { owner_id?: string } | null)?.owner_id
        if (ownerId === user.id) {
          setCurrentUserLevel('employer')
        } else {
          const hierarchy = await getTeamHierarchy(orgId).catch(() => ({ members: [], chain: [] }))
          const myMember = hierarchy.members.find((m) => (m as { user_id?: string }).user_id === user.id) as { hierarchy_level?: HierarchyLevel } | undefined
          setCurrentUserLevel(myMember?.hierarchy_level ?? 'worker')
        }
      }

      const auditResult = await getAuditLogs(orgId, { tableName: 'team_members', recordId: String(memberData.id) }, { page: 1, limit: 5 })
      setAuditLogs(auditResult.logs)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
      setMember(null)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  async function handleSave() {
    if (!member?.id || !member?.organisation_id) return
    setSaving(true)
    setError(null)
    setToast(null)
    try {
      const changes: Parameters<typeof updateTeamMemberComplete>[3] = {
        full_name: fullName.trim() || undefined,
        role_ids: selectedRoleIds,
        venue_ids: selectedVenueIds,
        primary_venue_id: primaryVenueId ?? selectedVenueIds[0] ?? null,
      }
      if (canEdit) {
        changes.status = status
        if (canPromoteTo(currentUserLevel, selectedPosition as HierarchyLevel)) {
          changes.hierarchy_level = selectedPosition
        }
      }
      const result = await updateTeamMemberComplete(
        String(member.id),
        String(member.user_id ?? ''),
        String(member.organisation_id),
        changes
      )
      if (!result.success) {
        throw new Error(result.error ?? 'Update failed')
      }
      setToast({ type: 'success', message: result.message ?? 'Profile updated successfully' })
      setIsEditing(false)
      await load()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to save'
      setError(msg)
      setToast({ type: 'error', message: msg })
      console.error('[handleSave] Save failed:', e)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!member?.id) return
    setDeleting(true)
    setError(null)
    try {
      await deleteTeamMember(String(member.id))
      router.push('/dashboard/team')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete')
    } finally {
      setDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  function toggleVenue(venueId: string) {
    setSelectedVenueIds((prev) =>
      prev.includes(venueId) ? prev.filter((x) => x !== venueId) : [...prev, venueId]
    )
  }

  function toggleRole(roleId: string) {
    setSelectedRoleIds((prev) => {
      if (prev.includes(roleId)) return prev.filter((x) => x !== roleId)
      if (prev.length >= 5) return prev
      return [...prev, roleId]
    })
  }

  if (loading && !member) {
    return (
      <div className="max-w-4xl mx-auto flex flex-col items-center justify-center min-h-[40vh]">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-500 mt-4">Loading profile...</p>
      </div>
    )
  }

  if (!member) {
    return (
      <div className="max-w-4xl mx-auto py-8">
        <p className="text-gray-600 mb-6">Worker not found.</p>
        <Link
          href="/dashboard/workers"
          className="inline-flex items-center gap-2 px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Workers
        </Link>
      </div>
    )
  }

  const memberLevel = ((member.hierarchy_level as string) || 'worker') as HierarchyLevel
  const canEdit = canEditWorker(currentUserLevel, memberLevel)
  const canDelete = (currentUserLevel === 'employer' || currentUserLevel === 'gm') && canEdit
  const allowedPositions = getAllowedPositionLevels(currentUserLevel).filter((l) => l !== 'employer')
  const editing = canEdit && isEditing

  const profile = member.profile as { full_name?: string; email?: string; avatar_url?: string } | undefined
  const email = profile?.email ?? (member.email as string) ?? '—'
  const memberType = String(member.member_type ?? 'employee')
  const employeeId = String(member.id).slice(0, 8).toUpperCase()
  const joinedDate = member.joined_at
    ? new Date(String(member.joined_at)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—'

  async function handleResetPassword() {
    const workerEmail = profile?.email ?? (member.email as string)
    const orgId = String(member.organisation_id ?? '')
    if (!workerEmail || workerEmail === '—' || !orgId) return
    setResetPasswordLoading(true)
    setResetPasswordLink(null)
    setResetPasswordError(null)
    try {
      const result = await generatePasswordResetLink(workerEmail, orgId)
      if (result.success && result.resetLink) {
        setResetPasswordLink(result.resetLink)
      } else {
        setResetPasswordError(result.error ?? 'Failed to generate reset link')
      }
    } catch {
      setResetPasswordError('Failed to generate reset link')
    } finally {
      setResetPasswordLoading(false)
    }
  }

  function handleCancelEdit() {
    setIsEditing(false)
    const profile = member.profile as { full_name?: string } | undefined
    setFullName(profile?.full_name ?? (member.full_name as string) ?? (member.email as string) ?? '')
    const rolesArr = (member.roles as { role_id?: string }[] | undefined) ?? []
    setSelectedRoleIds(rolesArr.map((r) => r.role_id).filter(Boolean) as string[])
    const venuesArr = (member.venues as { venue_id?: string; venue?: { id?: string } }[] | undefined) ?? []
    const vIds = venuesArr.map((v) => v.venue_id ?? v.venue?.id).filter(Boolean) as string[]
    setSelectedVenueIds(vIds)
    const pv = member.primary_venue_id ?? (member.primary_venue as { id?: string } | undefined)?.id
    setPrimaryVenueId(pv ? String(pv) : vIds[0] ?? null)
    const hl = (member.hierarchy_level as string) || 'worker'
    setSelectedPosition(['gm', 'agm', 'shift_leader', 'worker'].includes(hl) ? hl : 'worker')
    setStatus(String(member.status ?? 'active'))
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-6">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard/workers"
            className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 font-medium"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Workers
          </Link>
          <Link
            href={`/dashboard/workers/${id}/shifts`}
            className="text-blue-600 hover:underline font-medium text-sm"
          >
            View shifts
          </Link>
        </div>
        {canEdit ? (
          <div className="flex items-center gap-2">
            {!isEditing ? (
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
              >
                Edit Profile
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="px-4 py-2 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleSave()}
                  disabled={saving || selectedRoleIds.length === 0}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </>
            )}
          </div>
        ) : (
          <span className="px-3 py-1.5 text-xs font-medium rounded-full bg-gray-100 text-gray-600">View Only</span>
        )}
      </div>

      {/* Section A - Header */}
      <ProfileHeader
        fullName={fullName}
        email={email}
        memberType={memberType}
        avatarUrl={profile?.avatar_url}
        hierarchyLevel={memberLevel}
        isEditing={editing}
        onNameChange={editing ? setFullName : undefined}
      />

      {/* Section B - Hierarchy */}
      <HierarchySection
        hierarchyLevel={memberLevel}
        status={status}
        editable={editing}
        selectedPosition={selectedPosition}
        selectedStatus={status}
        allowedPositions={allowedPositions}
        onPositionChange={editing ? setSelectedPosition : undefined}
        onStatusChange={editing ? setStatus : undefined}
        resetPasswordButton={
          canEdit ? (
            <button
              type="button"
              onClick={handleResetPassword}
              disabled={resetPasswordLoading || !email || email === '—'}
              className="px-4 py-2 bg-amber-100 text-amber-800 rounded-lg font-medium hover:bg-amber-200 flex items-center gap-2 text-sm disabled:opacity-50"
            >
              <KeyRound className="w-4 h-4" /> {resetPasswordLoading ? 'Generating...' : 'Reset Password'}
            </button>
          ) : undefined
        }
        deleteButton={
          canDelete ? (
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="px-4 py-2 bg-red-100 text-red-700 rounded-lg font-medium hover:bg-red-200 flex items-center gap-2 text-sm"
            >
              <Trash2 className="w-4 h-4" /> Delete Worker
            </button>
          ) : undefined
        }
      />

      {/* Reset Password modal */}
      {(resetPasswordLink || resetPasswordError) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-lg w-full shadow-xl p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-2">Reset Password</h2>
            {resetPasswordLink ? (
              <>
                <p className="text-gray-600 text-sm mb-4">Share this link with the worker. It expires in 1 hour.</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={resetPasswordLink}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono bg-gray-50"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(resetPasswordLink)
                      setToast({ type: 'success', message: 'Link copied to clipboard' })
                    }}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
                  >
                    Copy
                  </button>
                </div>
              </>
            ) : (
              <p className="text-red-600 text-sm">{resetPasswordError}</p>
            )}
            <button
              type="button"
              onClick={() => { setResetPasswordLink(null); setResetPasswordError(null) }}
              className="mt-4 px-4 py-2 border border-gray-300 rounded-lg font-medium hover:bg-gray-50"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Stats */}
      <StatsCards
        attendanceRatePercent={stats?.attendanceRatePercent ?? 0}
        averageRating={stats?.averageRating ?? null}
        averageResponseTimeMinutes={stats?.averageResponseTimeMinutes ?? null}
        hoursWorked={stats?.hoursWorked ?? 0}
        showRatings={showRatings}
      />

      {/* Details */}
      <DetailsCard employeeId={employeeId} joinedDate={joinedDate} />

      {/* Roles */}
      <RolesList
        roles={roles.filter((r) => selectedRoleIds.includes(String(r.id))) as { id: string; name: string; colour?: string }[]}
        allRoles={roles as { id: string; name: string; colour?: string }[]}
        editable={editing}
        selectedRoleIds={selectedRoleIds}
        onAddRole={toggleRole}
        onRemoveRole={(rid) => setSelectedRoleIds((prev) => prev.filter((id) => id !== rid))}
      />

      {/* Section E - Venue assignments */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Venue assignments</h2>
        <div className="flex flex-wrap gap-2 mb-4">
          {venues.map((v) => {
            const vid = String(v.id)
            const checked = selectedVenueIds.includes(vid)
            return (
              <label
                key={vid}
                className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer ${editing ? 'border-gray-200 hover:bg-gray-50' : 'border-gray-100 bg-gray-50'}`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => editing && toggleVenue(vid)}
                  disabled={!editing}
                  className="rounded border-gray-300"
                />
                <span className="text-sm font-medium text-gray-800">{(v as { name?: string }).name ?? vid}</span>
              </label>
            )
          })}
          {venues.length === 0 && <p className="text-sm text-gray-500">No venues in organisation.</p>}
        </div>
        {selectedVenueIds.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Primary venue</label>
            <select
              value={primaryVenueId ?? ''}
              onChange={(e) => setPrimaryVenueId(e.target.value || null)}
              disabled={!editing}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full max-w-xs bg-white disabled:bg-gray-50"
            >
              {selectedVenueIds.map((vid) => {
                const v = venues.find((x) => String(x.id) === vid) as { id: string; name?: string } | undefined
                return (
                  <option key={vid} value={vid}>
                    {v?.name ?? vid}
                  </option>
                )
              })}
            </select>
          </div>
        )}
      </div>

      {/* Section F - Audit trail */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
          <History className="w-5 h-5 text-indigo-600" />
          Recent changes (last 5)
        </h2>
        {auditLogs.length === 0 ? (
          <p className="text-sm text-gray-500">No changes recorded yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {auditLogs.map((log) => (
              <li key={log.id} className="flex flex-wrap gap-x-2 gap-y-0.5 text-gray-700 border-b border-gray-100 pb-2 last:border-0">
                <span className="font-medium text-gray-900">
                  {(log.user?.full_name) || log.user_id?.slice(0, 8) || 'Someone'}
                </span>
                <span>{log.action}</span>
                <span className="text-gray-500">
                  {new Date(log.created_at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}
                </span>
                {log.new_data && Object.keys(log.new_data).length > 0 && (
                  <span className="text-gray-500 text-xs w-full mt-0.5">
                    {JSON.stringify(log.new_data)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {toast && (
        <p
          className={`text-sm ${
            toast.type === 'success' ? 'text-green-600 font-medium' : 'text-red-600'
          }`}
        >
          {toast.message}
        </p>
      )}
      {error && !toast && <p className="text-red-600 text-sm">{error}</p>}

      <div className="flex flex-wrap gap-3">
        <Link
          href="/dashboard/workers"
          className="px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200"
        >
          Back to Workers
        </Link>
      </div>

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full shadow-xl p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-2">Delete worker?</h2>
            <p className="text-gray-600 text-sm mb-4">
              Are you sure? This will permanently delete <strong>{fullName || email}</strong> from the organization.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg font-medium hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
