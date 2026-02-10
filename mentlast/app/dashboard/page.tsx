'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Calendar,
  Users,
  CheckCircle,
  AlertCircle,
  Plus,
  ArrowRight,
  Clock,
  Star,
  UserCircle,
} from 'lucide-react'
import { getOrganisationIdForCurrentUser, getMyOrganisations } from '@/lib/services/organisations'
import { getVenuesByOrg } from '@/lib/services/venues'
import { getTeamMembers } from '@/lib/services/team'
import { supabase } from '@/lib/supabase'

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
  allocations?: { id: string }[]
  invites?: { id: string; status: string }[]
}

export default function DashboardPage() {
  const router = useRouter()
  const [stats, setStats] = useState({
    totalEmployees: 0,
    gigWorkers: 0,
    shiftsFilled: 0,
    shiftsTotal: 0,
    pendingTimesheets: 0,
    openShifts: 0,
  })
  const [userName, setUserName] = useState<string>('')
  const [orgName, setOrgName] = useState<string>('')
  const [shiftList, setShiftList] = useState<ShiftRow[]>([])
  const [teamMembers, setTeamMembers] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(true)
  const [orgExists, setOrgExists] = useState<boolean | null>(null)

  useEffect(() => {
    async function checkThenLoad() {
      try {
        const orgId = await getOrganisationIdForCurrentUser()
        if (!orgId) {
          router.replace('/dashboard/setup')
          return
        }
        setOrgExists(true)
        await loadDashboardData(orgId)
      } catch (err) {
        console.error('[Dashboard] Error checking org:', err)
        router.replace('/dashboard/setup')
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
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', user.id)
          .single()
        setUserName((profile?.full_name as string) || user.email || 'there')
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

      const venueIds = await getVenuesByOrg(orgId).catch(() => [] as { id: string }[])
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
          allocations:shift_allocations(id),
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
      const shiftsData = (Array.isArray(shifts) ? shifts : []) as ShiftRow[]
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

      const { count: pendingCount } = await supabase
        .from('timekeeping_records')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending')
        .not('clock_out', 'is', null)

      const members = await getTeamMembers(orgId).catch(() => [])
      setTeamMembers(members as Record<string, unknown>[])

      setStats({
        totalEmployees: employeeCount ?? 0,
        gigWorkers,
        shiftsFilled: filledShifts,
        shiftsTotal: totalShifts,
        pendingTimesheets: pendingCount ?? 0,
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
    <div className="min-h-screen bg-gray-50">
      {/* Top navigation tabs - sticky below header */}
      <div className="sticky top-16 z-40 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex gap-1 overflow-x-auto">
            <Link
              href="/dashboard"
              className="px-4 py-3 text-sm font-medium rounded-t-lg bg-gradient-to-r from-blue-500 to-purple-600 text-white shrink-0"
            >
              Employer Dashboard
            </Link>
            <Link
              href="/dashboard/rota"
              className="px-4 py-3 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-t-lg shrink-0"
            >
              Create Roster
            </Link>
            <span className="px-4 py-3 text-sm text-gray-400 cursor-not-allowed shrink-0">
              Gig Platform
            </span>
            <span className="px-4 py-3 text-sm text-gray-400 cursor-not-allowed shrink-0">
              Worker Profile
            </span>
            <Link
              href="/dashboard/timekeeping"
              className="px-4 py-3 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-t-lg shrink-0"
            >
              Timesheet Approval
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* Hero */}
        <div className="bg-gradient-to-r from-blue-500 to-purple-600 rounded-2xl p-8 text-white shadow-md">
          <h1 className="text-2xl font-bold mb-1">
            Good morning, {userName || 'there'}
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
            value={stats.totalEmployees + stats.gigWorkers}
            subtitle={`${stats.totalEmployees} Employees · ${stats.gigWorkers} Gig Workers`}
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

        {/* Two columns: Upcoming Shifts (70%) | Quick Actions (30%) */}
        <div className="grid grid-cols-1 lg:grid-cols-10 gap-6">
          <div className="lg:col-span-7">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="p-4 border-b border-gray-200 flex justify-between items-center">
                <h2 className="text-lg font-bold text-gray-900">Upcoming Shifts</h2>
                <Link
                  href="/dashboard/rota"
                  className="text-sm font-medium text-purple-600 hover:text-purple-700"
                >
                  View All
                </Link>
              </div>
              <div className="divide-y divide-gray-100">
                {shiftList.length === 0 ? (
                  <div className="p-8 text-center text-gray-500 text-sm">
                    No upcoming shifts this week. Create a roster to get started.
                  </div>
                ) : (
                  shiftList.map((shift) => (
                    <UpcomingShiftCard key={shift.id} shift={shift} />
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="lg:col-span-3">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Quick Actions</h2>
              <div className="space-y-3">
                <Link
                  href="/dashboard/rota"
                  className="flex items-center gap-3 w-full px-4 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-xl font-medium hover:shadow-md transition-all"
                >
                  <Plus className="w-5 h-5 shrink-0" />
                  Create Roster
                </Link>
                <button
                  type="button"
                  className="flex items-center gap-3 w-full px-4 py-3 bg-white border border-gray-200 rounded-xl font-medium text-gray-700 hover:bg-gray-50 transition-all"
                >
                  <ArrowRight className="w-5 h-5 shrink-0" />
                  Post Gig Shift
                </button>
                <Link
                  href="/dashboard/timekeeping"
                  className="flex items-center gap-3 w-full px-4 py-3 bg-white border border-gray-200 rounded-xl font-medium text-gray-700 hover:bg-gray-50 transition-all"
                >
                  <Clock className="w-5 h-5 shrink-0" />
                  Approve Timesheets
                  {stats.pendingTimesheets > 0 && (
                    <span className="ml-auto bg-amber-100 text-amber-800 text-xs font-semibold px-2 py-0.5 rounded-full">
                      {stats.pendingTimesheets}
                    </span>
                  )}
                </Link>
                <button
                  type="button"
                  className="flex items-center gap-3 w-full px-4 py-3 bg-white border border-gray-200 rounded-xl font-medium text-gray-700 hover:bg-gray-50 transition-all"
                >
                  <UserCircle className="w-5 h-5 shrink-0" />
                  View Applications
                  <span className="ml-auto bg-gray-200 text-gray-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                    12
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom: My Employees | My Gig Workers */}
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

          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-lg font-bold text-gray-900">My Gig Workers</h2>
              <span className="text-sm text-gray-500">Coming soon</span>
            </div>
            <div className="p-4">
              <p className="text-sm text-gray-500 py-4">No gig workers yet.</p>
            </div>
          </div>
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

function UpcomingShiftCard({ shift }: { shift: ShiftRow }) {
  const roleName = shift.role?.name ?? 'Shift'
  const venueName = shift.venue?.name ?? ''
  const start = formatTime(shift.start_time)
  const end = formatTime(shift.end_time)
  const headcount = shift.headcount_needed ?? 1
  const filled = shift.allocations?.length ?? 0
  const openSlots = Math.max(0, headcount - filled)
  const isFullyFilled = openSlots === 0

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
            isFullyFilled ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
          }`}
        >
          {isFullyFilled ? 'Fully Filled' : `${openSlots} Slots Open`}
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
      {openSlots > 0 && (
        <button
          type="button"
          className="mt-3 text-sm font-medium text-purple-600 hover:text-purple-700"
        >
          Send to Gig Platform
        </button>
      )}
      <div className="flex items-center gap-1 mt-2">
        {Array.from({ length: Math.min(filled, 5) }).map((_, i) => (
          <div
            key={i}
            className="w-6 h-6 rounded-full bg-gray-200 border-2 border-white"
            title="Allocated"
          />
        ))}
      </div>
    </div>
  )
}
