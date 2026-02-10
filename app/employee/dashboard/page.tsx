'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { Clock, Star, Calendar, Briefcase } from 'lucide-react'
import { getWorkerShifts } from '@/lib/services/allocations'
import { getMyTeamMemberWithRoles } from '@/lib/services/team'
import { getOrganisationSettings } from '@/lib/services/settings'
import { supabase } from '@/lib/supabase'
import ShiftInvitationsList from '@/components/ShiftInvitationsList'
import WorkerShiftCard, { type WorkerShiftAllocation } from '@/components/WorkerShiftCard'
import WorkerShiftDetailModal from '@/components/WorkerShiftDetailModal'

function getFirstName(fullName: string | null | undefined, metadata?: { first_name?: string } | null): string {
  if (metadata?.first_name && String(metadata.first_name).trim()) return String(metadata.first_name).trim()
  if (fullName && String(fullName).trim()) {
    const first = String(fullName).trim().split(/\s+/)[0]
    if (first) return first
  }
  return ''
}

export default function EmployeeDashboard() {
  const [upcomingShifts, setUpcomingShifts] = useState<Record<string, unknown>[]>([])
  const [todayShift, setTodayShift] = useState<Record<string, unknown> | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [firstName, setFirstName] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [detailAllocationId, setDetailAllocationId] = useState<string | null>(null)
  const [invitesRefreshTrigger, setInvitesRefreshTrigger] = useState(0)
  const [myProfile, setMyProfile] = useState<Record<string, unknown> | null>(null)
  const [orgSettings, setOrgSettings] = useState<{ show_ratings: boolean; show_gig_features?: boolean } | null>(null)

  const refetchShifts = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const shifts = await getWorkerShifts(user.id)
    setUpcomingShifts(shifts.slice(0, 5))
    const today = new Date().toISOString().split('T')[0]
    const todayAllocation = shifts.find((s: Record<string, unknown>) => {
      const shift = s.shift as Record<string, unknown>
      return shift?.shift_date === today
    })
    setTodayShift(todayAllocation ?? null)
  }, [])

  useEffect(() => {
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        setUserId(user.id)

        const meta = user.user_metadata as { first_name?: string } | undefined
        const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).single()
        const name = getFirstName(
          (profile?.full_name as string) ?? undefined,
          meta
        )
        if (name) setFirstName(name)

        const [shifts, teamProfileData] = await Promise.all([
          getWorkerShifts(user.id),
          getMyTeamMemberWithRoles(user.id),
        ])
        setUpcomingShifts(shifts.slice(0, 5))
        setMyProfile(teamProfileData ?? null)
        const orgId = (teamProfileData as { organisation_id?: string } | null)?.organisation_id
        if (orgId) {
          getOrganisationSettings(orgId).then((s) => setOrgSettings(s)).catch(() => setOrgSettings({ show_ratings: true, show_gig_features: false }))
        } else {
          setOrgSettings({ show_ratings: true, show_gig_features: false })
        }
        const today = new Date().toISOString().split('T')[0]
        const todayAllocation = shifts.find((s: Record<string, unknown>) => {
          const shift = s.shift as Record<string, unknown>
          return shift?.shift_date === today
        })
        setTodayShift(todayAllocation ?? null)
      } catch (error) {
        console.error('Error loading dashboard:', error)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  useEffect(() => {
    let sub: { unsubscribe: () => void } | null = null
    async function setupRealtime() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: tmList } = await supabase.from('team_members').select('id').eq('user_id', user.id)
      const teamMemberIds = (tmList ?? []).map((t) => t.id)
      if (teamMemberIds.length === 0) return
      sub = supabase
        .channel('shift_invites_worker')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'shift_invites',
            filter: `team_member_id=in.(${teamMemberIds.join(',')})`,
          },
          () => {
            setInvitesRefreshTrigger((t) => t + 1)
            refetchShifts()
          }
        )
        .subscribe()
    }
    setupRealtime()
    return () => {
      sub?.unsubscribe()
    }
  }, [refetchShifts])

  const weekCount = upcomingShifts.filter((s) => {
    const shift = s.shift as Record<string, unknown>
    const shiftDate = shift?.shift_date ? new Date(String(shift.shift_date)) : new Date(0)
    const weekFromNow = new Date()
    weekFromNow.setDate(weekFromNow.getDate() + 7)
    return shiftDate <= weekFromNow
  }).length

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-gray-600">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen pb-6">
      <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-b-3xl px-6 pt-6 pb-12 text-white shadow-lg">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold mb-1">{firstName ? `Hi ${firstName}!` : 'Hi there!'}</h1>
          <p className="text-indigo-100 text-sm">Here&apos;s your schedule</p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 -mt-6 space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
                <Calendar className="w-5 h-5 text-indigo-600" />
              </div>
              <span className="text-sm font-medium text-gray-600">Upcoming Shifts</span>
            </div>
            <div className="text-3xl font-bold text-gray-900">{upcomingShifts.length}</div>
          </div>
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
                <Briefcase className="w-5 h-5 text-purple-600" />
              </div>
              <span className="text-sm font-medium text-gray-600">This Week</span>
            </div>
            <div className="text-3xl font-bold text-gray-900">{weekCount}</div>
          </div>
        </div>

        {orgSettings?.show_ratings !== false && myProfile && (
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                <Star className="w-5 h-5 text-amber-600" />
              </div>
              <h2 className="font-bold text-lg text-gray-900">My Performance</h2>
            </div>
            <div className="flex items-center gap-1 mb-2">
              {[1, 2, 3, 4, 5].map((value) => {
                const rating = typeof myProfile.rating === 'number' ? myProfile.rating : 0
                const filled = value <= rating
                return (
                  <Star
                    key={value}
                    className="w-7 h-7"
                    fill={filled ? '#eab308' : 'none'}
                    stroke={filled ? '#eab308' : '#d1d5db'}
                    strokeWidth={1.5}
                  />
                )
              })}
            </div>
            <p className="text-sm text-gray-600 mb-2">
              Your manager rated you: {typeof myProfile.rating === 'number' ? `${myProfile.rating}/5` : '—'}
            </p>
            {(() => {
              const rolesList = (myProfile.roles as { role?: { name?: string; colour?: string } }[] | undefined) ?? []
              const roleNames = rolesList.map((r) => r.role?.name).filter(Boolean)
              if (roleNames.length === 0) return null
              return (
                <p className="text-sm text-gray-600">
                  Qualified as: {roleNames.join(', ')}
                </p>
              )
            })()}
          </div>
        )}

        {todayShift && (
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex items-center gap-2 bg-gradient-to-r from-indigo-50 to-purple-50">
              <Clock className="w-5 h-5 text-indigo-600 shrink-0" />
              <h2 className="font-bold text-lg text-gray-900">Today&apos;s Shift</h2>
            </div>
            <div className="p-6">
              <WorkerShiftCard
                allocation={todayShift as WorkerShiftAllocation}
                showViewDetails
                onViewDetails={setDetailAllocationId}
              />
              <div className="mt-4 flex justify-end">
                <Link
                  href={`/employee/clock?shift=${todayShift.rota_shift_id}`}
                  className="px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-lg font-medium hover:shadow-lg transition-all"
                >
                  Clock In
                </Link>
              </div>
            </div>
          </div>
        )}

        {userId && (
          <ShiftInvitationsList
            userId={userId}
            onInvitesChange={refetchShifts}
            refreshTrigger={invitesRefreshTrigger}
          />
        )}

        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
          <div className="p-4 border-b border-gray-100 flex justify-between items-center">
            <h2 className="font-bold text-lg text-gray-900">Upcoming Shifts</h2>
            <Link
              href="/employee/schedule"
              className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
            >
              View calendar
            </Link>
          </div>
          <div className="p-6 space-y-4">
            {upcomingShifts.length === 0 ? (
              <p className="text-sm text-gray-500 py-6 text-center">
                No upcoming shifts. Check your invitations or ask your manager.
              </p>
            ) : (
              upcomingShifts.map((allocation) => (
                <WorkerShiftCard
                  key={String(allocation.id)}
                  allocation={allocation as WorkerShiftAllocation}
                  showViewDetails
                  onViewDetails={setDetailAllocationId}
                />
              ))
            )}
          </div>
        </div>

        {orgSettings?.show_gig_features === true && (
          <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl p-6 text-white shadow-lg">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
                <Star className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-lg mb-2">Unlock More Opportunities</h3>
                <p className="text-indigo-100 text-sm mb-4">
                  Become a FlexiWork Gig Worker and work at ANY participating business
                </p>
                <button
                  type="button"
                  disabled
                  className="px-6 py-2 bg-white/20 text-white rounded-lg font-medium opacity-50 cursor-not-allowed"
                >
                  Coming Soon - Phase 2
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <WorkerShiftDetailModal
        allocationId={detailAllocationId}
        onClose={() => setDetailAllocationId(null)}
      />
    </div>
  )
}
