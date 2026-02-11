'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Calendar,
  Users,
  AlertCircle,
  Plus,
  ArrowRight,
  Clock,
  Star,
  UserCircle,
  X,
  Pencil,
  Trash2,
  ChevronUp,
} from 'lucide-react'
import WorkerProfileModal, { type WorkerProfileData } from '@/components/WorkerProfileModal'
import { CollapsibleSection } from '@/components/ui/CollapsibleSection'
import { getOrganisationIdForCurrentUser, getMyOrganisations, hasTeamMembership } from '@/lib/services/organisations'
import { getVenuesByOrg } from '@/lib/services/venues'
import { getRolesByOrg, createRole, updateRole, deleteRole } from '@/lib/services/roles'
import { getTeamMembers } from '@/lib/services/team'
import { getOrganisationSettings } from '@/lib/services/settings'
import { getPendingApplicationsCount } from '@/lib/services/applications'
import { supabase } from '@/lib/supabase'

type AllocationRow = {
  id: string
  team_member_id: string
  team_member?: {
    id: string
    profile?: { full_name?: string; email?: string } | null
  } | null
}

type ShiftRow = {
  id: string
  shift_date: string
  status: string
  venue_id: string
  start_time?: string
  end_time?: string
  headcount_needed?: number
  venue?: { name?: string } | null
  role?: { name?: string } | null
  allocations?: AllocationRow[]
  invites?: { id: string; status: string }[]
}

const HIERARCHY_LABELS: Record<string, string> = {
  employer: 'Employer',
  gm: 'General Manager',
  agm: 'Assistant GM',
  shift_leader: 'Shift Leader',
  supervisor: 'Supervisor',
  worker: 'Worker',
}

export default function DashboardPage() {
  const router = useRouter()
  const [stats, setStats] = useState({
    totalEmployees: 0,
    gigWorkers: 0,
    shiftsFilled: 0,
    shiftsTotal: 0,
    pendingTimesheets: 0,
    pendingApplications: 0,
    openShifts: 0,
  })
  const [orgSettings, setOrgSettings] = useState<{ show_gig_features?: boolean }>({})
  const [userName, setUserName] = useState<string>('')
  const [currentUserId, setCurrentUserId] = useState<string>('')
  const [userHierarchyLevel, setUserHierarchyLevel] = useState<string>('')
  const [orgName, setOrgName] = useState<string>('')
  const [shiftList, setShiftList] = useState<ShiftRow[]>([])
  const [teamMembers, setTeamMembers] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(true)
  const [orgExists, setOrgExists] = useState<boolean | null>(null)
  const [workerProfileModal, setWorkerProfileModal] = useState<WorkerProfileData | null>(null)
  const [organisationId, setOrganisationId] = useState<string>('')
  const [roles, setRoles] = useState<Record<string, unknown>[]>([])
  const [showAddRoleModal, setShowAddRoleModal] = useState(false)
  const [editingRole, setEditingRole] = useState<Record<string, unknown> | null>(null)
  const [roleToDelete, setRoleToDelete] = useState<Record<string, unknown> | null>(null)
  const [isShiftsOpen, setIsShiftsOpen] = useState(false)
  const [isRolesOpen, setIsRolesOpen] = useState(false)

  useEffect(() => {
    async function checkThenLoad() {
      try {
        let orgId = await getOrganisationIdForCurrentUser()
        if (!orgId) {
          await new Promise((r) => setTimeout(r, 400))
          orgId = await getOrganisationIdForCurrentUser()
        }
        if (orgId) {
          setOrgExists(true)
          setOrganisationId(orgId)
          await loadDashboardData(orgId)
          return
        }
        const isInvitedEmployee = await hasTeamMembership()
        if (isInvitedEmployee) {
          router.replace('/employee/dashboard')
          return
        }
        router.replace('/dashboard/setup')
      } catch (err) {
        console.error('[Dashboard] Error checking org:', err)
        const orgIdRetry = await getOrganisationIdForCurrentUser().catch(() => null)
        if (orgIdRetry) {
          setOrgExists(true)
          setOrganisationId(orgIdRetry)
          await loadDashboardData(orgIdRetry)
          return
        }
        const isInvitedEmployee = await hasTeamMembership().catch(() => false)
        router.replace(isInvitedEmployee ? '/employee/dashboard' : '/dashboard/setup')
      } finally {
        setLoading(false)
      }
    }
    checkThenLoad()
  }, [router])

  async function loadDashboardData(orgId: string) {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setCurrentUserId(user.id)
        const [profileRes, teamMemberRes] = await Promise.all([
          supabase.from('profiles').select('full_name').eq('id', user.id).single(),
          supabase.from('team_members').select('hierarchy_level').eq('user_id', user.id).eq('organisation_id', orgId).maybeSingle(),
        ])
        const profile = profileRes.data as { full_name?: string } | null
        const teamMember = teamMemberRes.data as { hierarchy_level?: string } | null
        const fullName = (profile?.full_name as string)?.trim()
        const displayName = fullName
          ? fullName.split(/\s+/)[0] || fullName
          : (user.email ? user.email.split('@')[0] : '') || 'User'
        setUserName(displayName)
        if (teamMember?.hierarchy_level) {
          setUserHierarchyLevel(teamMember.hierarchy_level)
        } else {
          const { data: org } = await supabase.from('organisations').select('owner_id').eq('id', orgId).single()
          const ownerId = (org as { owner_id?: string } | null)?.owner_id
          setUserHierarchyLevel(ownerId === user.id ? 'employer' : 'worker')
        }
      }

      const orgs = await getMyOrganisations().catch(() => [])
      const org = orgs[0] as { name?: string } | undefined
      setOrgName(org?.name ?? 'Your organisation')

      const today = new Date()
      const day = today.getDay()
      const diff = today.getDate() - day + (day === 0 ? -6 : 1)
      const monday = new Date(today)
      monday.setDate(diff)
      const sunday = new Date(monday)
      sunday.setDate(monday.getDate() + 6)

      const toLocalDateStr = (d: Date) => {
        const y = d.getFullYear()
        const m = String(d.getMonth() + 1).padStart(2, '0')
        const dayNum = String(d.getDate()).padStart(2, '0')
        return `${y}-${m}-${dayNum}`
      }
      const weekStartStr = toLocalDateStr(monday)
      const weekEndStr = toLocalDateStr(sunday)

      const [venueIds, rolesData, settings, pendingAppsCount] = await Promise.all([
        getVenuesByOrg(orgId).catch(() => [] as { id: string }[]),
        getRolesByOrg(orgId).catch(() => []),
        getOrganisationSettings(orgId).catch(() => ({ show_ratings: true, show_gig_features: false })),
        getPendingApplicationsCount(orgId).catch(() => 0),
      ])
      setRoles((rolesData as unknown) as Record<string, unknown>[])
      setOrgSettings({ show_gig_features: settings.show_gig_features })
      const venueIdList = venueIds.map((v) => v.id)

      const { count: employeeCount, error: empErr } = await supabase
        .from('team_members')
        .select('*', { count: 'exact', head: true })
        .eq('organisation_id', orgId)
        .in('status', ['active', 'pending'])
        .eq('member_type', 'employee')
      if (empErr) console.error('[Dashboard] team_members count error:', empErr)

      // Gig workers: not in schema yet; use 0 until we have member_type or separate table
      const gigWorkers = 0

      const { data: shifts, error: shiftsErr } = await supabase
        .from('rota_shifts')
        .select(`
          id,
          shift_date,
          status,
          venue_id,
          start_time,
          end_time,
          headcount_needed,
          venue:venues(id, name),
          role:roles(id, name),
          allocations:shift_allocations(id, team_member_id, team_member:team_members(id, profile:profiles!team_members_user_id_fkey(full_name, email))),
          invites:shift_invites(id, status)
        `)
        .eq('status', 'published')
        .gte('shift_date', weekStartStr)
        .lte('shift_date', weekEndStr)
        .in('venue_id', venueIdList.length ? venueIdList : [''])
        .order('shift_date')
        .order('start_time')

      if (shiftsErr) {
        console.error('[Dashboard] rota_shifts error:', shiftsErr)
        throw shiftsErr
      }
      const shiftsData = (Array.isArray(shifts) ? shifts : []) as unknown as ShiftRow[]
      setShiftList(shiftsData)

      const totalShifts = shiftsData.length
      const filledShifts = shiftsData.filter(
        (s) => (s.allocations?.length ?? 0) >= 1
      ).length
      const openShifts = shiftsData.filter((s) => {
        const hasAllocations = (s.allocations?.length ?? 0) >= 1
        if (hasAllocations) return false
        const invites = s.invites ?? []
        const onlyPendingOrRejected = invites.length === 0 || invites.every(
          (i) => ['pending', 'declined', 'expired'].includes(i.status)
        )
        return onlyPendingOrRejected
      }).length

      const { count: pendingCount } =
        venueIdList.length > 0
          ? await supabase
              .from('timekeeping_records')
              .select('*', { count: 'exact', head: true })
              .eq('status', 'pending')
              .not('clock_out', 'is', null)
              .in('venue_id', venueIdList)
          : { count: 0 }

      const members = await getTeamMembers(orgId).catch(() => [])
      setTeamMembers(members as Record<string, unknown>[])

      setStats({
        totalEmployees: employeeCount ?? 0,
        gigWorkers,
        shiftsFilled: filledShifts,
        shiftsTotal: totalShifts,
        pendingTimesheets: pendingCount ?? 0,
        pendingApplications: pendingAppsCount,
        openShifts,
      })
    } catch (err) {
      console.error('[Dashboard] loadDashboardData error:', err)
    }
  }

  if (loading || orgExists === null) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-gray-600">Loading dashboard...</div>
      </div>
    )
  }

  const fillRate = stats.shiftsTotal > 0
    ? Math.round((stats.shiftsFilled / stats.shiftsTotal) * 100)
    : 0

  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* Hero */}
        <div className="bg-gradient-to-r from-blue-500 to-purple-600 rounded-2xl p-8 text-white shadow-md">
          <h1 className="text-2xl font-bold mb-1">
            Good morning, {userName || 'there'}
            {userHierarchyLevel && (
              <span className="text-purple-200 font-normal ml-1">
                ({HIERARCHY_LABELS[userHierarchyLevel] ?? userHierarchyLevel})
              </span>
            )}
          </h1>
          <p className="text-blue-100 text-sm">
            Your organisation dashboard · {orgName}
          </p>
        </div>

        {/* Stats row - 4 cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard
            icon={<Users className="w-5 h-5" />}
            iconBg="bg-blue-100"
            iconColor="text-blue-600"
            label="Total Workers"
            value={orgSettings?.show_gig_features ? stats.totalEmployees + stats.gigWorkers : stats.totalEmployees}
            subtitle={orgSettings?.show_gig_features ? `${stats.totalEmployees} Employees · ${stats.gigWorkers} Gig Workers` : `${stats.totalEmployees} Employees`}
            trend="+12%"
            trendUp
          />
          <StatCard
            icon={<Calendar className="w-5 h-5" />}
            iconBg="bg-purple-100"
            iconColor="text-purple-600"
            label="Shifts Filled"
            value={`${stats.shiftsFilled}/${stats.shiftsTotal}`}
            subtitle={`${stats.openShifts} unfilled shifts`}
            trend={stats.shiftsTotal > 0 ? `${fillRate}%` : '—'}
            trendUp={fillRate >= 95}
          />
          <StatCard
            icon={<Star className="w-5 h-5" />}
            iconBg="bg-amber-100"
            iconColor="text-amber-600"
            label="Avg Rating"
            value="4.8"
            subtitle="From 892 reviews"
            trend="+0.3"
            trendUp
          />
          <StatCard
            icon={<AlertCircle className="w-5 h-5" />}
            iconBg="bg-red-100"
            iconColor="text-red-600"
            label="No-Show Rate"
            value="2.1%"
            subtitle="Industry avg: 8.5%"
            trend="-8%"
            trendUp={false}
          />
        </div>

        {/* Upcoming Shifts and Manage Organization Roles: same width, roles below shifts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <CollapsibleSection
            title="Upcoming Shifts"
            open={isShiftsOpen}
            onOpenChange={setIsShiftsOpen}
            defaultOpen={false}
            compactHeader
            actionButton={
              <Link
                href="/dashboard/rota"
                className="text-sm font-medium text-purple-600 hover:text-purple-700"
              >
                View All
              </Link>
            }
          >
            <div className="divide-y divide-gray-100">
              {shiftList.length === 0 ? (
                <div className="p-8 text-center text-gray-500 text-sm">
                  No upcoming shifts this week. Create a roster to get started.
                </div>
              ) : (
                shiftList.map((shift) => (
                  <UpcomingShiftCard
                    key={shift.id}
                    shift={shift}
                    teamMembers={teamMembers}
                    onViewWorker={(w) => setWorkerProfileModal(w)}
                    showGigPlatform={orgSettings?.show_gig_features === true}
                  />
                ))
              )}
            </div>
            {isShiftsOpen && (
              <div className="mt-6 pt-4 border-t border-gray-100 flex justify-center">
                <button
                  type="button"
                  onClick={() => setIsShiftsOpen(false)}
                  className="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
                >
                  <ChevronUp className="w-4 h-4 mr-2" />
                  Close section
                </button>
              </div>
            )}
          </CollapsibleSection>

          <CollapsibleSection
            title="Manage Organization Roles"
            open={isRolesOpen}
            onOpenChange={setIsRolesOpen}
            defaultOpen={false}
            compactHeader
            actionButton={
              <button
                type="button"
                onClick={() => setShowAddRoleModal(true)}
                className="px-4 py-2 text-sm font-medium bg-violet-600 text-white rounded-lg hover:bg-violet-700"
              >
                + Add Role
              </button>
            }
          >
            {roles.length === 0 ? (
              <p className="text-gray-500 text-sm">No roles yet. Add a role to use in shifts.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {roles.map((role) => (
                  <li key={String(role.id)} className="flex items-center justify-between py-3 first:pt-0">
                    <div className="flex items-center gap-3">
                      <span
                        className="w-4 h-4 rounded-full shrink-0"
                        style={{ backgroundColor: String(role.colour ?? '#3B82F6') }}
                      />
                      <div>
                        <span className="font-medium text-gray-900">{String(role.name)}</span>
                        {role.description && (
                          <p className="text-xs text-gray-500 mt-0.5">{String(role.description)}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingRole(role)}
                        className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg"
                        title="Edit role"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setRoleToDelete(role)}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                        title="Delete role"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {isRolesOpen && (
              <div className="mt-4 pt-4 border-t border-gray-200 flex justify-center">
                <button
                  type="button"
                  onClick={() => setIsRolesOpen(false)}
                  className="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
                >
                  <ChevronUp className="w-4 h-4 mr-2" />
                  Close section
                </button>
              </div>
            )}
          </CollapsibleSection>
        </div>

        {/* Quick Actions */}
        <div className="mt-6">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Quick Actions</h2>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/dashboard/rota"
                className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-xl font-medium hover:shadow-md transition-all"
              >
                <Plus className="w-5 h-5 shrink-0" />
                Create Roster
              </Link>
              {orgSettings?.show_gig_features && (
                <Link
                  href="/dashboard/gigs/create"
                  className="flex items-center gap-3 px-4 py-3 bg-white border border-gray-200 rounded-xl font-medium text-gray-700 hover:bg-gray-50 transition-all"
                >
                  <ArrowRight className="w-5 h-5 shrink-0" />
                  Post Gig Shift
                </Link>
              )}
              <Link
                href="/dashboard/timekeeping"
                className="flex items-center gap-3 px-4 py-3 bg-white border border-gray-200 rounded-xl font-medium text-gray-700 hover:bg-gray-50 transition-all"
              >
                <Clock className="w-5 h-5 shrink-0" />
                Approve Timesheets
                {stats.pendingTimesheets > 0 && (
                  <span className="ml-auto bg-amber-100 text-amber-800 text-xs font-semibold px-2 py-0.5 rounded-full">
                    {stats.pendingTimesheets}
                  </span>
                )}
              </Link>
              <Link
                href="/dashboard/applications"
                className="flex items-center gap-3 px-4 py-3 bg-white border border-gray-200 rounded-xl font-medium text-gray-700 hover:bg-gray-50 transition-all"
              >
                <UserCircle className="w-5 h-5 shrink-0" />
                View Applications
                {stats.pendingApplications > 0 && (
                  <span className="ml-auto bg-amber-100 text-amber-800 text-xs font-semibold px-2 py-0.5 rounded-full">
                    {stats.pendingApplications}
                  </span>
                )}
              </Link>
            </div>
          </div>
        </div>

        {/* Bottom: My Employees | My Gig Workers (Gig only when feature enabled) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-lg font-bold text-gray-900">My Employees</h2>
              <Link
                href="/dashboard/team"
                className="text-sm font-medium text-purple-600 hover:text-purple-700"
              >
                View All Employees
              </Link>
            </div>
            <div className="p-4 space-y-3">
              {(teamMembers.filter((m) => (m.member_type as string) === 'employee').slice(0, 3) as { profile?: { full_name?: string }; roles?: { role?: { name?: string } }[] }[]).length === 0 ? (
                <p className="text-sm text-gray-500 py-4">No employees yet.</p>
              ) : (
                teamMembers
                  .filter((m) => (m.member_type as string) === 'employee')
                  .slice(0, 3)
                  .map((m, i) => {
                    const profile = m.profile as { full_name?: string } | undefined
                    const roles = m.roles as { role?: { name?: string } }[] | undefined
                    const roleName = roles?.[0]?.role?.name ?? 'Team member'
                    return (
                      <div
                        key={(m.id as string) || i}
                        className="flex items-center gap-3 py-2"
                      >
                        <div className="w-10 h-10 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center text-white text-sm font-bold">
                          {(profile?.full_name || '?').charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 truncate">
                            {profile?.full_name || 'Unknown'}
                          </p>
                          <p className="text-xs text-gray-500">{roleName}</p>
                        </div>
                        <span className="text-sm text-amber-600 font-medium flex items-center gap-0.5">
                          <Star className="w-4 h-4 fill-amber-400" />
                          4.9
                        </span>
                      </div>
                    )
                  })
              )}
            </div>
          </div>

          {orgSettings?.show_gig_features && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="p-4 border-b border-gray-200 flex justify-between items-center">
                <h2 className="text-lg font-bold text-gray-900">My Gig Workers</h2>
                <span className="text-sm text-gray-500">Coming soon</span>
              </div>
              <div className="p-4">
                <p className="text-sm text-gray-500 py-4">No gig workers yet.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {workerProfileModal && (
        <WorkerProfileModal
          worker={workerProfileModal}
          onClose={() => setWorkerProfileModal(null)}
          senderId={currentUserId}
          senderName={userName}
        />
      )}

      {showAddRoleModal && organisationId && (
        <RoleFormModal
          organisationId={organisationId}
          onClose={() => setShowAddRoleModal(false)}
          onSuccess={() => {
            setShowAddRoleModal(false)
            loadDashboardData(organisationId)
          }}
        />
      )}
      {editingRole && organisationId && (
        <RoleFormModal
          organisationId={organisationId}
          role={editingRole}
          onClose={() => setEditingRole(null)}
          onSuccess={() => {
            setEditingRole(null)
            loadDashboardData(organisationId)
          }}
        />
      )}
      {roleToDelete && (
        <DeleteRoleConfirmModal
          role={roleToDelete}
          onClose={() => setRoleToDelete(null)}
          onConfirm={async () => {
            try {
              await deleteRole(String(roleToDelete.id))
              setRoleToDelete(null)
              if (organisationId) loadDashboardData(organisationId)
            } catch (e) {
              alert(e instanceof Error ? e.message : 'Cannot delete role')
            }
          }}
        />
      )}
    </div>
  )
}

const ROLE_COLOURS = [
  { value: '#3B82F6', label: 'Blue' },
  { value: '#8B5CF6', label: 'Violet' },
  { value: '#10B981', label: 'Green' },
  { value: '#F59E0B', label: 'Amber' },
  { value: '#EF4444', label: 'Red' },
]

function RoleFormModal({
  organisationId,
  role,
  onClose,
  onSuccess,
}: {
  organisationId: string
  role?: Record<string, unknown> | null
  onClose: () => void
  onSuccess: () => void
}) {
  const isEdit = !!role
  const [name, setName] = useState(role ? String(role.name) : '')
  const [description, setDescription] = useState(role ? String(role.description ?? '') : '')
  const [colour, setColour] = useState(role ? String(role.colour ?? '#3B82F6') : '#3B82F6')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      alert('Role name is required')
      return
    }
    setLoading(true)
    try {
      if (isEdit) {
        await updateRole(String(role!.id), { name: name.trim(), description: description.trim() || undefined, colour })
      } else {
        await createRole({
          organisation_id: organisationId,
          name: name.trim(),
          description: description.trim() || undefined,
          colour,
        })
      }
      onSuccess()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save role')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-md w-full shadow-xl">
        <div className="p-6 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-xl font-bold">{isEdit ? 'Edit Role' : 'Add Role'}</h2>
          <button type="button" onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg p-3"
              placeholder="e.g. Kitchen Porter"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full border border-gray-300 rounded-lg p-3"
              placeholder="Brief description"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Colour badge</label>
            <div className="flex flex-wrap gap-2">
              {ROLE_COLOURS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setColour(c.value)}
                  className={`w-8 h-8 rounded-full border-2 ${colour === c.value ? 'border-gray-900' : 'border-transparent'}`}
                  style={{ backgroundColor: c.value }}
                  title={c.label}
                />
              ))}
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="flex-1 px-4 py-2 bg-violet-600 text-white rounded-lg font-medium disabled:opacity-50">
              {loading ? 'Saving...' : isEdit ? 'Save' : 'Add Role'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function DeleteRoleConfirmModal({
  role,
  onClose,
  onConfirm,
}: {
  role: Record<string, unknown>
  onClose: () => void
  onConfirm: () => Promise<void>
}) {
  const [deleting, setDeleting] = useState(false)
  async function handleConfirm() {
    setDeleting(true)
    try {
      await onConfirm()
    } catch (_) {
      // already alerted in parent
    } finally {
      setDeleting(false)
    }
  }
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-md w-full shadow-xl p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Delete role?</h2>
          <button type="button" onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-gray-600 text-sm mb-2">
          Are you sure you want to delete <strong>{String(role.name)}</strong>? This cannot be undone.
        </p>
        <p className="text-amber-700 text-xs mb-4">
          If this role is assigned to any active shifts, you must reassign or remove those shifts first.
        </p>
        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={deleting}
            className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-medium disabled:opacity-50"
          >
            {deleting ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}

function StatCard({
  icon,
  iconBg,
  iconColor,
  label,
  value,
  subtitle,
  trend,
  trendUp,
}: {
  icon: React.ReactNode
  iconBg: string
  iconColor: string
  label: string
  value: string | number
  subtitle: string
  trend?: string
  trendUp?: boolean
}) {
  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
      <div className="flex justify-between items-start mb-3">
        <div className={`w-10 h-10 ${iconBg} rounded-lg flex items-center justify-center ${iconColor}`}>
          {icon}
        </div>
        {trend != null && (
          <span
            className={`text-xs font-medium flex items-center gap-0.5 ${
              trendUp === true ? 'text-green-600' : trendUp === false ? 'text-red-600' : 'text-gray-500'
            }`}
          >
            {trendUp === true && trend !== '—' && (
              <span className="text-green-500">↑</span>
            )}
            {trendUp === false && trend !== '—' && (
              <span className="text-red-500">↓</span>
            )}
            {trend}
          </span>
        )}
      </div>
      <p className="text-gray-500 text-sm mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mb-1">{value}</p>
      <p className="text-xs text-gray-400">{subtitle}</p>
    </div>
  )
}

function formatTime(t: string | undefined) {
  if (!t) return '—'
  const [h, m] = t.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${String(m || 0).padStart(2, '0')} ${period}`
}

function formatShiftDate(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00')
  const today = new Date()
  const isToday =
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear()
  if (isToday) return 'Today'
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const isTomorrow =
    d.getDate() === tomorrow.getDate() &&
    d.getMonth() === tomorrow.getMonth() &&
    d.getFullYear() === tomorrow.getFullYear()
  if (isTomorrow) return 'Tomorrow'
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

function UpcomingShiftCard({
  shift,
  teamMembers,
  onViewWorker,
  showGigPlatform = false,
}: {
  shift: ShiftRow
  teamMembers: Record<string, unknown>[]
  onViewWorker: (worker: WorkerProfileData) => void
  showGigPlatform?: boolean
}) {
  const roleName = shift.role?.name ?? 'Shift'
  const venueName = shift.venue?.name ?? ''
  const start = formatTime(shift.start_time)
  const end = formatTime(shift.end_time)
  const headcount = shift.headcount_needed ?? 1
  const allocations = shift.allocations ?? []
  const filled = allocations.length
  const openSlots = Math.max(0, headcount - filled)
  const isFullyFilled = openSlots === 0

  function getWorkerForAllocation(allocation: AllocationRow): WorkerProfileData | null {
    const tmId = allocation.team_member_id
    const tm = allocation.team_member
    const profile = tm?.profile
    const name = profile?.full_name ?? ''
    const fullMember = teamMembers.find((m) => String(m.id) === String(tmId)) as Record<string, unknown> | undefined
    const fullProfile = fullMember?.profile as { full_name?: string; email?: string } | undefined
    const roles = fullMember?.roles as { role?: { name?: string } }[] | undefined
    const userId = fullMember?.user_id as string | undefined
    return {
      id: String(tmId),
      user_id: userId ?? null,
      profile: { full_name: fullProfile?.full_name ?? name, email: fullProfile?.email ?? profile?.email },
      employment_type: fullMember?.employment_type as string | undefined,
      roles,
    }
  }

  return (
    <div className="p-4 hover:bg-gray-50/50 transition-colors">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-gray-900">
            {roleName} · Service
          </h3>
          {venueName && (
            <p className="text-sm text-gray-500 mt-0.5">{venueName}</p>
          )}
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium shrink-0 ${
            isFullyFilled ? 'bg-green-100 text-green-800' : openSlots > 0 ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-700'
          }`}
        >
          {isFullyFilled ? 'Fully Filled' : filled === 0 ? 'Open' : `${openSlots} Slots Open`}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2 mt-3 text-sm text-gray-600">
        <span className="flex items-center gap-1">
          <Clock className="w-4 h-4 text-gray-400" />
          {formatShiftDate(shift.shift_date)}, {start} – {end}
        </span>
        <span className="text-purple-600 font-medium">
          {filled}/{headcount} slots
        </span>
      </div>
      {allocations.length > 0 && (
        <div className="mt-3 space-y-2">
          {allocations.map((alloc) => {
            const tm = alloc.team_member
            const profile = tm?.profile
            const name = String(profile?.full_name ?? 'Worker')
            const workerData = getWorkerForAllocation(alloc)
            return (
              <div
                key={alloc.id}
                className="flex items-center justify-between gap-2 py-2 px-3 bg-gray-50 rounded-lg border border-gray-100"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center text-white text-sm font-bold shrink-0">
                    {name.charAt(0).toUpperCase() || '?'}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 truncate text-sm">{name}</p>
                    <div className="flex items-center gap-1 text-amber-600">
                      <Star className="w-3.5 h-3.5 fill-amber-400" />
                      <span className="text-xs">4.5</span>
                    </div>
                  </div>
                </div>
                {workerData && (
                  <button
                    type="button"
                    onClick={() => onViewWorker(workerData)}
                    className="text-sm font-medium text-purple-600 hover:text-purple-700 shrink-0"
                  >
                    View profile
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
      {openSlots > 0 && filled === 0 && (
        <p className="mt-2 text-sm text-gray-500">No worker allocated yet.</p>
      )}
      {openSlots > 0 && showGigPlatform && (
        <button
          type="button"
          className="mt-3 text-sm font-medium text-purple-600 hover:text-purple-700"
        >
          Send to Gig Platform
        </button>
      )}
    </div>
  )
}
