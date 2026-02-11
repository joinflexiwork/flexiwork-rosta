'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Clock, MapPin, CheckCircle, LogOut, UserPlus } from 'lucide-react'
import { getMyAllocatedShifts } from '@/lib/services/allocations'
import { clockIn, clockOut } from '@/lib/services/timekeeping'
import { supabase } from '@/lib/supabase'
import { startOfWeek, endOfWeek, format, isWithinInterval, parseISO } from 'date-fns'
import ShiftInvitationsList from '@/components/ShiftInvitationsList'

type ShiftAlloc = Record<string, unknown>

export default function WorkerDashboardPage() {
  const router = useRouter()
  const [upcomingShifts, setUpcomingShifts] = useState<ShiftAlloc[]>([])
  const [todayShift, setTodayShift] = useState<ShiftAlloc | null>(null)
  const [timekeeping, setTimekeeping] = useState<Record<string, unknown> | null>(null)
  const [teamMemberId, setTeamMemberId] = useState('')
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState<string | null>(null)
  const [location, setLocation] = useState('')
  const [incompleteProfile, setIncompleteProfile] = useState(false)

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (p) => setLocation(`${p.coords.latitude},${p.coords.longitude}`),
        () => setLocation('Location unavailable')
      )
    }
  }, [])

  const refetchShifts = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const shifts = await getMyAllocatedShifts(user.id)
    setUpcomingShifts(shifts)
    const today = new Date().toISOString().split('T')[0]
    const todayAlloc = shifts.find((s: ShiftAlloc) => {
      const sh = s.shift as Record<string, unknown>
      return sh?.shift_date === today
    })
    setTodayShift(todayAlloc ?? null)
    if (todayAlloc && teamMemberId) {
      const { data: tk } = await supabase
        .from('timekeeping_records')
        .select('*')
        .eq('rota_shift_id', (todayAlloc.shift as Record<string, unknown>)?.id ?? '')
        .eq('team_member_id', teamMemberId)
        .maybeSingle()
      setTimekeeping(tk as Record<string, unknown> | null)
    }
  }, [teamMemberId])

  useEffect(() => {
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          setLoading(false)
          return
        }
        setUserId(user.id)

        const { data: tm } = await supabase
          .from('team_members')
          .select('id')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (tm) {
          setTeamMemberId(tm.id)
        } else {
          setIncompleteProfile(true)
        }

        const shifts = await getMyAllocatedShifts(user.id)
        setUpcomingShifts(shifts)

        const today = new Date().toISOString().split('T')[0]
        const todayAlloc = shifts.find((s: ShiftAlloc) => {
          const sh = s.shift as Record<string, unknown>
          return sh?.shift_date === today
        })
        setTodayShift(todayAlloc ?? null)

        if (todayAlloc && tm) {
          const { data: tk } = await supabase
            .from('timekeeping_records')
            .select('*')
            .eq('rota_shift_id', (todayAlloc.shift as Record<string, unknown>)?.id ?? '')
            .eq('team_member_id', tm.id)
            .maybeSingle()
          setTimekeeping(tk as Record<string, unknown> | null)
        }
      } catch (e) {
        console.error('Error loading dashboard:', e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  async function handleClockIn() {
    if (!todayShift) return
    const shift = todayShift.shift as Record<string, unknown>
    setProcessing('clockin')
    try {
      await clockIn({
        rota_shift_id: String(shift?.id),
        team_member_id: teamMemberId,
        venue_id: String(shift?.venue_id),
        location,
      })
      const { data: tk } = await supabase
        .from('timekeeping_records')
        .select('*')
        .eq('rota_shift_id', shift?.id)
        .eq('team_member_id', teamMemberId)
        .maybeSingle()
      setTimekeeping(tk as Record<string, unknown> | null)
    } catch (e) {
      console.error(e)
      alert('Failed to clock in.')
    } finally {
      setProcessing(null)
    }
  }

  async function handleClockOut() {
    if (!timekeeping?.id) return
    setProcessing('clockout')
    try {
      await clockOut({
        timekeeping_record_id: String(timekeeping.id),
        location,
      })
      setTimekeeping(null)
      setTodayShift(null)
      const { data: shifts } = await supabase
        .from('shift_allocations')
        .select(`
          *,
          shift:rota_shifts(*, venue:venues(id,name), role:roles(id,name,colour))
        `)
        .in('team_member_id', [teamMemberId])
        .in('status', ['allocated', 'confirmed', 'in_progress'])
      const today = new Date().toISOString().split('T')[0]
      const todayAlloc = (shifts || []).find((s: ShiftAlloc) => (s.shift as Record<string, unknown>)?.shift_date === today)
      setUpcomingShifts(shifts || [])
      setTodayShift(todayAlloc ?? null)
    } catch (e) {
      console.error(e)
      alert('Failed to clock out.')
    } finally {
      setProcessing(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-gray-600">Loading...</div>
      </div>
    )
  }

  if (incompleteProfile && !teamMemberId) {
    return (
      <div className="max-w-md mx-auto p-6">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
          <h2 className="text-lg font-bold text-amber-900 mb-2">Profile incomplete</h2>
          <p className="text-amber-800 text-sm mb-6">
            You are not yet assigned to an organisation. Please contact your employer or continue registration.
          </p>
          <div className="flex flex-col gap-3">
            <Link
              href="/onboarding"
              className="flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
            >
              <UserPlus className="w-5 h-5" />
              Continue registration
            </Link>
            <button
              type="button"
              onClick={async () => {
                await supabase.auth.signOut()
                router.push('/auth/login')
              }}
              className="flex items-center justify-center gap-2 px-4 py-3 border border-red-300 text-red-700 rounded-lg font-medium hover:bg-red-50"
            >
              <LogOut className="w-5 h-5" />
              Logout
            </button>
          </div>
        </div>
      </div>
    )
  }

  const shift = todayShift?.shift as Record<string, unknown> | undefined
  const role = shift?.role as Record<string, unknown> | undefined
  const venue = shift?.venue as Record<string, unknown> | undefined
  const isClockedIn = timekeeping?.clock_in && !timekeeping?.clock_out
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 })
  const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 })
  const weekShifts = upcomingShifts.filter((a) => {
    const sh = a.shift as Record<string, unknown>
    const d = sh?.shift_date ? parseISO(String(sh.shift_date)) : new Date(0)
    return isWithinInterval(d, { start: weekStart, end: weekEnd })
  })

  return (
    <div className="max-w-4xl mx-auto p-4">
      <div className="bg-gradient-primary text-white p-6 rounded-xl mb-6">
        <h1 className="text-2xl font-bold mb-1">My shifts</h1>
        <p className="text-blue-100 text-sm">Upcoming and invites</p>
      </div>

      {todayShift && shift && (
        <div className="bg-white rounded-xl p-5 shadow-sm border-2 border-blue-500 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-5 h-5 text-blue-600" />
            <h2 className="font-bold text-lg">Today</h2>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xl font-bold text-gray-900">
                {String(shift.start_time)} – {String(shift.end_time)}
              </div>
              <div className="text-sm text-gray-600">
                {String(role?.name ?? '')} • {String(venue?.name ?? '')}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isClockedIn ? (
                <button
                  type="button"
                  onClick={handleClockOut}
                  disabled={!!processing}
                  className="px-5 py-2.5 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
                >
                  <MapPin className="w-4 h-4" />
                  {processing === 'clockout' ? 'Processing...' : 'Clock out'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleClockIn}
                  disabled={!!processing}
                  className="px-5 py-2.5 bg-gradient-primary text-white rounded-lg font-medium hover:shadow-lg disabled:opacity-50 flex items-center gap-2"
                >
                  <MapPin className="w-4 h-4" />
                  {processing === 'clockin' ? 'Processing...' : 'Clock in'}
                </button>
              )}
              <Link
                href={`/employee/clock?shift=${shift.id}`}
                className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 text-sm"
              >
                Details
              </Link>
            </div>
          </div>
          {isClockedIn && timekeeping?.clock_in ? (
            <div className="mt-3 flex items-center gap-2 text-green-700 text-sm">
              <CheckCircle className="w-4 h-4" />
              Clocked in at {new Date(String(timekeeping.clock_in)).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
            </div>
          ) : null}
        </div>
      )}

      {userId && (
        <div className="mb-6">
          <ShiftInvitationsList userId={userId} onInvitesChange={refetchShifts} />
        </div>
      )}

      <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200 mb-6">
        <h2 className="font-bold text-lg mb-4">This week</h2>
        <div className="space-y-3">
          {weekShifts.length === 0 ? (
            <p className="text-gray-500 text-sm">No shifts this week.</p>
          ) : (
            weekShifts.map((a) => {
              const sh = a.shift as Record<string, unknown>
              const r = sh?.role as Record<string, unknown>
              const v = sh?.venue as Record<string, unknown>
              const dateStr = sh?.shift_date as string
              return (
                <div
                  key={String(a.id)}
                  className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg"
                >
                  <div className="w-12 h-12 bg-gradient-primary rounded-lg flex flex-col items-center justify-center text-white text-center">
                    <span className="text-xs font-medium">{dateStr ? format(new Date(dateStr), 'MMM') : ''}</span>
                    <span className="text-lg font-bold leading-tight">{dateStr ? format(new Date(dateStr), 'd') : ''}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-gray-900 truncate">{String(r?.name ?? '')}</div>
                    <div className="text-sm text-gray-600">{String(sh?.start_time ?? '')} – {String(sh?.end_time ?? '')}</div>
                    <div className="text-sm text-gray-500 truncate">{String(v?.name ?? '')}</div>
                  </div>
                  <Link
                    href={`/employee/clock?shift=${sh?.id}`}
                    className="text-sm text-blue-600 font-medium whitespace-nowrap"
                  >
                    Clock
                  </Link>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
