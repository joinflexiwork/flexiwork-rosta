'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import {
  CheckCircle2,
  Star,
  Clock,
  Zap,
  Lock,
  Mail,
  Calendar,
  Hash,
  ArrowLeft,
  Trash2,
} from 'lucide-react'
import { getTeamMemberWithRoles, updateTeamMemberProfile, deleteTeamMember } from '@/lib/services/team'
import { getWorkerStats } from '@/lib/services/profile'
import { updateProfileFullName } from '@/lib/services/profile'
import { getVenuesByOrg } from '@/lib/services/venues'
import { getRolesByOrg } from '@/lib/services/roles'
import { getOrganisationSettings } from '@/lib/services/settings'

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  if (parts.length === 1 && parts[0].length >= 1) return parts[0].slice(0, 2).toUpperCase()
  return '?'
}

function formatHours(hours: number): string {
  return hours.toLocaleString('en-GB', { maximumFractionDigits: 0, minimumFractionDigits: 0 })
}

function formatResponseTime(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

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

  const [fullName, setFullName] = useState('')
  const [selectedVenueIds, setSelectedVenueIds] = useState<string[]>([])
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([])
  const [primaryVenueId, setPrimaryVenueId] = useState<string | null>(null)

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
    if (!member?.id) return
    setSaving(true)
    setError(null)
    try {
      const userId = member.user_id as string | null
      if (userId) {
        await updateProfileFullName(userId, fullName.trim())
      }
      await updateTeamMemberProfile(String(member.id), {
        full_name: fullName.trim() || null,
        role_ids: selectedRoleIds,
        venue_ids: selectedVenueIds,
        primary_venue_id: primaryVenueId || (selectedVenueIds[0] ?? null),
      })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
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
      router.push('/dashboard/workers')
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

  const profile = member.profile as { full_name?: string; email?: string } | undefined
  const email = profile?.email ?? (member.email as string) ?? '—'
  const employeeId = String(member.id).slice(0, 8).toUpperCase()
  const joinedDate = member.joined_at
    ? new Date(String(member.joined_at)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—'
  const initials = getInitials(fullName || '?')

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-6">
      <div className="flex items-center gap-4 mb-4">
        <Link
          href="/dashboard/workers"
          className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 font-medium"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Workers
        </Link>
      </div>

      {/* Header card: purple area with name, white area with email */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="bg-gradient-to-br from-indigo-500 to-purple-600 h-32 flex flex-col justify-end">
          <div className="flex flex-col sm:flex-row items-center sm:items-end gap-4 px-6 pb-4">
            <div className="flex-shrink-0 w-24 h-24 rounded-2xl border-4 border-white shadow-lg bg-indigo-100 flex items-center justify-center text-2xl font-bold text-indigo-700">
              {initials}
            </div>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Full name"
              className="flex-1 w-full min-w-0 bg-transparent border-b-2 border-white/40 text-white text-2xl sm:text-3xl font-bold placeholder-white/70 focus:outline-none focus:border-white pb-1"
            />
          </div>
        </div>
        <div className="px-6 pb-6 -mt-12 relative pt-14">
          <p className="text-gray-700 flex items-center gap-2">
            <Mail className="w-5 h-5 text-gray-400 shrink-0" />
            <span className="font-medium text-gray-900">{email}</span>
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center mb-3">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
          </div>
          <p className="text-2xl font-bold text-gray-900">{stats?.attendanceRatePercent ?? 0}%</p>
          <p className="text-sm text-gray-500">Attendance rate</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center mb-3">
            {showRatings ? <Star className="w-5 h-5 text-amber-600" /> : <Lock className="w-5 h-5 text-gray-500" />}
          </div>
          {showRatings && stats?.averageRating != null ? (
            <>
              <p className="text-2xl font-bold text-gray-900">{stats.averageRating.toFixed(1)}</p>
              <p className="text-sm text-gray-500">Average rating</p>
            </>
          ) : (
            <p className="text-sm text-gray-600">Ratings hidden</p>
          )}
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center mb-3">
            <Clock className="w-5 h-5 text-blue-600" />
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {stats?.averageResponseTimeMinutes != null ? formatResponseTime(stats.averageResponseTimeMinutes) : 'N/A'}
          </p>
          <p className="text-sm text-gray-500">Avg response time</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center mb-3">
            <Zap className="w-5 h-5 text-purple-600" />
          </div>
          <p className="text-2xl font-bold text-gray-900">{formatHours(stats?.hoursWorked ?? 0)}</p>
          <p className="text-sm text-gray-500">Hours worked</p>
        </div>
      </div>

      {/* Details card */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Details</h2>
        <ul className="space-y-3 mb-6">
          <li className="flex items-center gap-3 text-gray-700">
            <Hash className="w-5 h-5 text-gray-400" />
            Employee ID: {employeeId}
          </li>
          <li className="flex items-center gap-3 text-gray-700">
            <Calendar className="w-5 h-5 text-gray-400" />
            Joined {joinedDate}
          </li>
        </ul>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Assigned venues</label>
            <div className="flex flex-wrap gap-2">
              {venues.map((v) => {
                const vid = String(v.id)
                const checked = selectedVenueIds.includes(vid)
                return (
                  <label key={vid} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleVenue(vid)}
                      className="rounded border-gray-300"
                    />
                    <span className="text-sm font-medium text-gray-800">{(v as { name?: string }).name ?? vid}</span>
                  </label>
                )
              })}
              {venues.length === 0 && <p className="text-sm text-gray-500">No venues in organisation.</p>}
            </div>
            {selectedVenueIds.length > 0 && (
              <div className="mt-2">
                <label className="block text-xs text-gray-500 mb-1">Primary venue</label>
                <select
                  value={primaryVenueId ?? ''}
                  onChange={(e) => setPrimaryVenueId(e.target.value || null)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full max-w-xs"
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

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Roles (1–5)</label>
            <div className="flex flex-wrap gap-2">
              {roles.map((r) => {
                const rid = String(r.id)
                const selected = selectedRoleIds.includes(rid)
                return (
                  <button
                    key={rid}
                    type="button"
                    onClick={() => toggleRole(rid)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium border ${
                      selected
                        ? 'bg-indigo-100 text-indigo-800 border-indigo-200'
                        : 'border-gray-300 text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    {(r as { name?: string }).name ?? rid}
                  </button>
                )
              })}
              {roles.length === 0 && <p className="text-sm text-gray-500">No roles in organisation.</p>}
            </div>
          </div>
        </div>
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || selectedRoleIds.length === 0}
          className="px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl font-medium hover:opacity-90 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save changes'}
        </button>
        <Link
          href="/dashboard/workers"
          className="px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200"
        >
          Back to Workers
        </Link>
        <button
          type="button"
          onClick={() => setShowDeleteConfirm(true)}
          className="px-6 py-3 bg-red-100 text-red-700 rounded-xl font-medium hover:bg-red-200 flex items-center gap-2"
        >
          <Trash2 className="w-4 h-4" /> Delete employee
        </button>
      </div>

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full shadow-xl p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-2">Delete employee?</h2>
            <p className="text-gray-600 text-sm mb-4">
              This will remove <strong>{fullName || email}</strong> from the team. Pending invites will be cancelled.
              If they have assigned shifts, reassign or delete those first.
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
