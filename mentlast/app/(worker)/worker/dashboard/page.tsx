'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Clock, AlertCircle, MapPin, CheckCircle } from 'lucide-react'
import { getMyAllocatedShifts } from '@/lib/services/allocations'
import { getMyPendingInvites, acceptShiftInvite, declineShiftInvite } from '@/lib/services/invites'
import { clockIn, clockOut } from '@/lib/services/timekeeping'
import { supabase } from '@/lib/supabase'
import { startOfWeek, endOfWeek, format, isWithinInterval, parseISO } from 'date-fns'

type ShiftAlloc = Record<string, unknown>
type ShiftInv = Record<string, unknown>

export default function WorkerDashboardPage() {
  const [upcomingShifts, setUpcomingShifts] = useState<ShiftAlloc[]>([])
  const [pendingInvites, setPendingInvites] = useState<ShiftInv[]>([])
  const [todayShift, setTodayShift] = useState<ShiftAlloc | null>(null)
  const [timekeeping, setTimekeeping] = useState<Record<string, unknown> | null>(null)
  const [teamMemberId, setTeamMemberId] = useState('')
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState<string | null>(null)
  const [location, setLocation] = useState('')

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (p) => setLocation(`${p.coords.latitude},${p.coords.longitude}`),
        () => setLocation('Location unavailable')
      )
    }
  }, [])

  useEffect(() => {
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data: tm } = await supabase
          .from('team_members')
          .select('id')
          .eq('user_id', user.id)
          .single()
        if (!tm) return
        setTeamMemberId(tm.id)

        const [shifts, invites] = await Promise.all([
          getMyAllocatedShifts(user.id),
          getMyPendingInvites(user.id),
        ])
        setUpcomingShifts(shifts)
        setPendingInvites(invites)

        const today = new Date().toISOString().split('T')[0]
        const todayAlloc = shifts.find((s: ShiftAlloc) => {
          const sh = s.shift as Record<string, unknown>
          return sh?.shift_date === today
        })
        setTodayShift(todayAlloc ?? null)

        if (todayAlloc) {
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

  async function handleAcceptInvite(inviteId: string) {
    setProcessing(`accept-${inviteId}`)
    try {
      await acceptShiftInvite(inviteId, teamMemberId)
      const invites = await getMyPendingInvites((await supabase.auth.getUser()).data.user!.id)
      setPendingInvites(invites)
      const shifts = await getMyAllocatedShifts((await supabase.auth.getUser()).data.user!.id)
      setUpcomingShifts(shifts)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : ''
      alert(msg.includes('filled') ? 'Someone else accepted this shift first.' : 'Failed to accept.')
    } finally {
      setProcessing(null)
    }
  }

  async function handleDeclineInvite(inviteId: string) {
    setProcessing(`decline-${inviteId}`)
    try {
      await declineShiftInvite(inviteId)
      setPendingInvites((prev) => prev.filter((i) => i.id !== inviteId))
    } catch (e) {
      alert('Failed to decline.')
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

      {pendingInvites.length > 0 && (
        <div className="bg-amber-50 rounded-xl p-5 border border-amber-200 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-600" />
              <h2 className="font-bold text-lg">Available shifts (other branches)</h2>
            </div>
            <span className="px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-sm font-medium">
              {pendingInvites.length} invite{pendingInvites.length !== 1 ? 's' : ''}
            </span>
          </div>
          <p className="text-sm text-amber-800 mb-4">First-come, first-served. Accept to add to your schedule.</p>
          <div className="space-y-3">
            {pendingInvites.map((inv) => {
              const sh = inv.shift as Record<string, unknown>
              const r = sh?.role as Record<string, unknown>
              const v = sh?.venue as Record<string, unknown>
              const id = String(inv.id)
              const busy = processing !== null
              return (
                <div key={id} className="bg-white rounded-lg p-4 border border-amber-200">
                  <div className="flex flex-wrap justify-between items-start gap-3">
                    <div>
                      <div className="font-semibold text-gray-900">{String(r?.name ?? '')}</div>
                      <div className="text-sm text-gray-600">
                        {sh?.shift_date
                          ? format(new Date(String(sh.shift_date)), 'EEE, d MMM') + ' • ' + String(sh.start_time) + '–' + String(sh.end_time)
                          : ''}
                      </div>
                      <div className="text-sm text-gray-500">{String(v?.name ?? '')}</div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleDeclineInvite(id)}
                        disabled={busy}
                        className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAcceptInvite(id)}
                        disabled={busy}
                        className="px-4 py-2 bg-gradient-primary text-white rounded-lg text-sm font-medium hover:shadow disabled:opacity-50"
                      >
                        {processing === `accept-${id}` ? 'Accepting...' : 'Accept'}
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
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
