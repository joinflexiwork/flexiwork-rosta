'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Users,
  UserPlus,
  Send,
  Calendar,
} from 'lucide-react'
import {
  format,
  startOfWeek,
  startOfMonth,
  endOfMonth,
  addDays,
  subDays,
  subMonths,
  addMonths,
  isSameDay,
  parseISO,
} from 'date-fns'
import { getWeeklyRotaForVenues, getMonthlyRotaForVenues } from '@/lib/services/rota'
import { getVenuesByOrg } from '@/lib/services/venues'
import { getOrganisationIdForCurrentUser } from '@/lib/services/organisations'
import { getTeamMembers } from '@/lib/services/team'
import { allocateEmployee } from '@/lib/services/allocations'
import { inviteEmployeesToShift, pullAvailableWorkers } from '@/lib/services/invites'
import { getMyAllocatedShifts } from '@/lib/services/allocations'
import { supabase } from '@/lib/supabase'
import PullStaffModal from '@/components/PullStaffModal'
import FillShiftModal, { type ShiftRow } from '@/components/roster/FillShiftModal'

/** Week start = Monday (ISO). Returns YYYY-MM-DD. */
function getMonday(d: Date): string {
  const monday = startOfWeek(d, { weekStartsOn: 1 })
  return format(monday, 'yyyy-MM-dd')
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

type CalendarView = 'weekly' | 'monthly'

export default function ViewRosterPage() {
  const [calendarView, setCalendarView] = useState<CalendarView>('weekly')
  const [weekStart, setWeekStart] = useState(getMonday(new Date()))
  const [monthDate, setMonthDate] = useState(() => startOfMonth(new Date()))
  const [venueIds, setVenueIds] = useState<string[]>([])
  const [venues, setVenues] = useState<Record<string, unknown>[]>([])
  const [shifts, setShifts] = useState<ShiftRow[]>([])
  const [myShifts, setMyShifts] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedShift, setSelectedShift] = useState<ShiftRow | null>(null)
  const [selectedDateForModal, setSelectedDateForModal] = useState<string | null>(null)
  const [actionModal, setActionModal] = useState<'fill' | 'allocate' | 'invite-all' | 'pull' | null>(null)
  const [organisationId, setOrganisationId] = useState('')

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (venueIds.length === 0) return
    if (calendarView === 'weekly') loadShifts()
    else loadMonthShifts()
  }, [venueIds, weekStart, calendarView, monthDate])

  async function loadData() {
    try {
      const orgId = await getOrganisationIdForCurrentUser()
      if (!orgId) return
      setOrganisationId(orgId)
      const venuesData = await getVenuesByOrg(orgId)
      setVenues((venuesData as unknown) as Record<string, unknown>[])
      const ids = (venuesData as { id: string }[]).map((v) => v.id)
      setVenueIds(ids)

      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const my = await getMyAllocatedShifts(user.id)
        setMyShifts(my)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  async function loadShifts() {
    if (venueIds.length === 0) return
    try {
      const data = await getWeeklyRotaForVenues({
        venue_ids: venueIds,
        week_start: weekStart,
      })
      setShifts((data as unknown) as ShiftRow[])
    } catch (e) {
      console.error(e)
    }
  }

  async function loadMonthShifts() {
    if (venueIds.length === 0) return
    try {
      const data = await getMonthlyRotaForVenues({
        venue_ids: venueIds,
        year: monthDate.getFullYear(),
        month: monthDate.getMonth() + 1,
      })
      setShifts((data as unknown) as ShiftRow[])
    } catch (e) {
      console.error(e)
    }
  }

  function prevWeek() {
    setWeekStart(format(subDays(new Date(weekStart + 'T12:00:00'), 7), 'yyyy-MM-dd'))
  }

  function nextWeek() {
    setWeekStart(format(addDays(new Date(weekStart + 'T12:00:00'), 7), 'yyyy-MM-dd'))
  }

  function prevMonth() {
    setMonthDate((d) => startOfMonth(subMonths(d, 1)))
  }

  function nextMonth() {
    setMonthDate((d) => startOfMonth(addMonths(d, 1)))
  }

  function getShiftStatus(shift: ShiftRow) {
    const filled = Number(shift.headcount_filled ?? 0)
    const needed = Number(shift.headcount_needed ?? 1)
    const pendingInvites = Array.isArray(shift.invites)
      ? shift.invites.filter((i) => i.status === 'pending').length
      : 0
    if (filled >= needed) return { label: 'Allocated', className: 'bg-green-100 text-green-800' }
    if (pendingInvites > 0) return { label: 'Pending', className: 'bg-amber-100 text-amber-800' }
    return { label: 'Open', className: 'bg-gray-100 text-gray-700' }
  }

  function openAllocate(shift: ShiftRow) {
    setSelectedShift(shift)
    setActionModal('allocate')
  }

  function openInviteAll(shift: ShiftRow) {
    setSelectedShift(shift)
    setActionModal('invite-all')
  }

  function openPull(shift: ShiftRow) {
    setSelectedShift(shift)
    setActionModal('pull')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-gray-600 flex items-center gap-2">
          <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          Loading roster...
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto py-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900">View Roster</h1>
        <Link
          href="/dashboard/rota"
          className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-600 via-indigo-600 to-blue-600 text-white rounded-lg font-medium hover:shadow-lg"
        >
          <Plus className="w-5 h-5" />
          Create New Roster
        </Link>
      </div>

      {/* Calendar: Weekly | Monthly toggle */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-200 bg-gray-50 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-gray-900">Calendar</h2>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden bg-white">
              <button
                type="button"
                onClick={() => setCalendarView('weekly')}
                className={`px-4 py-2 text-sm font-medium ${calendarView === 'weekly' ? 'bg-violet-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
              >
                Weekly
              </button>
              <button
                type="button"
                onClick={() => setCalendarView('monthly')}
                className={`px-4 py-2 text-sm font-medium ${calendarView === 'monthly' ? 'bg-violet-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
              >
                Monthly
              </button>
            </div>
          </div>
          {calendarView === 'weekly' ? (
            <div className="flex items-center gap-2">
              <button type="button" onClick={prevWeek} className="p-2 hover:bg-white rounded-lg border border-gray-200">
                <ChevronLeft className="w-5 h-5" />
              </button>
              <span className="text-sm font-medium text-gray-700 min-w-[140px] text-center">
                Week of {format(parseISO(weekStart), 'MMM d, yyyy')}
              </span>
              <button type="button" onClick={nextWeek} className="p-2 hover:bg-white rounded-lg border border-gray-200">
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button type="button" onClick={prevMonth} className="p-2 hover:bg-white rounded-lg border border-gray-200 text-sm font-medium">
                &larr; Previous Month
              </button>
              <span className="text-sm font-medium text-gray-700 min-w-[140px] text-center">
                {format(monthDate, 'MMMM yyyy')}
              </span>
              <button type="button" onClick={nextMonth} className="p-2 hover:bg-white rounded-lg border border-gray-200 text-sm font-medium">
                Next Month &rarr;
              </button>
            </div>
          )}
        </div>

        {calendarView === 'weekly' && (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left p-4 font-semibold text-gray-700 border-r border-gray-200 w-32">Date</th>
                {DAYS.map((day, idx) => {
                  const date = addDays(parseISO(weekStart), idx)
                  return (
                    <th
                      key={idx}
                      className="text-center p-4 font-semibold text-gray-700 border-r border-gray-200 last:border-r-0 min-w-[140px]"
                    >
                      <div>{day}</div>
                      <div className="text-xs font-normal text-gray-500">
                        {format(date, 'd MMM')}
                      </div>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-200">
                <td className="p-4 font-medium text-gray-700 border-r border-gray-200 align-top">Shifts</td>
                {DAYS.map((_, dayIdx) => {
                  const date = addDays(parseISO(weekStart), dayIdx)
                  const dateStr = format(date, 'yyyy-MM-dd')
                  const dayShifts = shifts.filter((s) => s.shift_date === dateStr) as ShiftRow[]
                  return (
                    <td key={dayIdx} className="p-2 border-r border-gray-200 last:border-r-0 align-top">
                      <div className="space-y-2 min-h-[100px]">
                        {dayShifts.map((shift) => {
                          const status = getShiftStatus(shift)
                          const role = shift.role as { name?: string } | undefined
                          const venue = shift.venue as { name?: string } | undefined
                          return (
                            <div
                              key={String(shift.id)}
                              className="rounded-lg p-3 border border-gray-200 bg-white shadow-sm"
                            >
                              <div className="flex items-center justify-between gap-1 mb-2">
                                <span className={`text-xs font-medium px-2 py-0.5 rounded ${status.className}`}>
                                  {status.label}
                                </span>
                                <span className="text-xs text-gray-500">
                                  {Number(shift.headcount_filled ?? 0)}/{Number(shift.headcount_needed ?? 1)}
                                </span>
                              </div>
                              <div className="text-xs text-gray-600 truncate">{String(role?.name ?? '')}</div>
                              <div className="text-xs text-gray-500">
                                {String(shift.start_time)}–{String(shift.end_time)}
                              </div>
                              {venue?.name && (
                                <div className="text-xs text-gray-400 truncate mt-0.5">{String(venue.name)}</div>
                              )}
                              <div className="flex flex-wrap gap-1 mt-2">
                                <button
                                  type="button"
                                  onClick={() => { setSelectedShift(shift); setActionModal('fill') }}
                                  className="flex items-center gap-1 px-2 py-1 text-xs font-medium bg-violet-100 text-violet-700 rounded hover:bg-violet-200"
                                >
                                  Fill Shift
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openAllocate(shift)}
                                  className="flex items-center gap-1 px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                                >
                                  <Users className="w-3 h-3" />
                                  Allocate
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openInviteAll(shift)}
                                  className="flex items-center gap-1 px-2 py-1 text-xs font-medium bg-purple-100 text-purple-700 rounded hover:bg-purple-200"
                                >
                                  <Send className="w-3 h-3" />
                                  Invite All
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openPull(shift)}
                                  className="flex items-center gap-1 px-2 py-1 text-xs font-medium bg-amber-100 text-amber-700 rounded hover:bg-amber-200"
                                >
                                  <UserPlus className="w-3 h-3" />
                                  Pull Staff
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </td>
                  )
                })}
              </tr>
            </tbody>
          </table>
        </div>
        )}

        {calendarView === 'monthly' && (
          <MonthlyCalendar
            monthDate={monthDate}
            shifts={shifts}
            getShiftStatus={getShiftStatus}
            onDayClick={(dateStr) => setSelectedDateForModal(dateStr)}
            onAllocate={openAllocate}
            onInviteAll={openInviteAll}
            onPull={openPull}
          />
        )}
      </div>

      {/* Day detail modal (monthly view) */}
      {selectedDateForModal && (
        <DayShiftsModal
          dateStr={selectedDateForModal}
          shifts={shifts.filter((s) => s.shift_date === selectedDateForModal) as ShiftRow[]}
          getShiftStatus={getShiftStatus}
          onClose={() => setSelectedDateForModal(null)}
          onFillShift={(s) => { setSelectedShift(s); setActionModal('fill'); setSelectedDateForModal(null) }}
          onAllocate={openAllocate}
          onInviteAll={openInviteAll}
          onPull={openPull}
        />
      )}

      {/* My Shifts */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
          <Calendar className="w-5 h-5 text-indigo-600" />
          My Shifts
        </h2>
        {myShifts.length === 0 ? (
          <p className="text-gray-500 text-sm">You have no assigned shifts.</p>
        ) : (
          <ul className="space-y-3">
            {myShifts.slice(0, 10).map((allocation) => {
              const shift = allocation.shift as Record<string, unknown> | undefined
              const venue = shift?.venue as { name?: string } | undefined
              const role = shift?.role as { name?: string } | undefined
              return (
                <li
                  key={String(allocation.id)}
                  className="flex items-center justify-between p-3 rounded-lg border border-gray-200 bg-gray-50"
                >
                  <div>
                    <span className="font-medium text-gray-900">{String(role?.name ?? 'Shift')}</span>
                    <span className="text-gray-500 text-sm ml-2">
                      {String(shift?.shift_date)} · {String(shift?.start_time)}–{String(shift?.end_time)}
                    </span>
                    {venue?.name && (
                      <div className="text-xs text-gray-500 mt-0.5">{String(venue.name)}</div>
                    )}
                  </div>
                  <span className="text-xs font-medium px-2 py-1 rounded bg-green-100 text-green-800">
                    {String(allocation.status ?? 'allocated')}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Fill Shift modal (edit, replace worker, delete, allocate) */}
      {actionModal === 'fill' && selectedShift && (
        <FillShiftModal
          shift={shifts.find((s) => String(s.id) === String(selectedShift?.id)) ?? selectedShift}
          organisationId={organisationId}
          onClose={() => {
            setActionModal(null)
            setSelectedShift(null)
          }}
          onSuccess={() => {
            loadShifts()
            if (calendarView === 'monthly') loadMonthShifts()
          }}
        />
      )}

      {/* Allocate modal */}
      {actionModal === 'allocate' && selectedShift && (
        <AllocateModal
          shift={selectedShift}
          organisationId={organisationId}
          onClose={() => {
            setActionModal(null)
            setSelectedShift(null)
          }}
          onSuccess={() => {
            setActionModal(null)
            setSelectedShift(null)
            loadShifts()
            loadMonthShifts()
          }}
        />
      )}

      {/* Invite All modal */}
      {actionModal === 'invite-all' && selectedShift && (
        <InviteAllModal
          shift={selectedShift}
          onClose={() => {
            setActionModal(null)
            setSelectedShift(null)
          }}
          onSuccess={() => {
            setActionModal(null)
            setSelectedShift(null)
            loadShifts()
            loadMonthShifts()
          }}
        />
      )}

      {/* Pull Staff modal */}
      {actionModal === 'pull' && selectedShift && (
        <PullStaffModal
          shift={selectedShift}
          venueId={String(selectedShift.venue_id ?? (selectedShift.venue as { id?: string })?.id ?? '')}
          roleId={String(selectedShift.role_id ?? (selectedShift.role as { id?: string })?.id ?? '')}
          onClose={() => {
            setActionModal(null)
            setSelectedShift(null)
          }}
          onSuccess={() => {
            setActionModal(null)
            setSelectedShift(null)
            loadShifts()
            loadMonthShifts()
          }}
        />
      )}
    </div>
  )
}

/** Monthly calendar grid: Sun–Sat, each day shows date + up to 3 shifts, "+N more". Uses date-fns. */
function MonthlyCalendar({
  monthDate,
  shifts,
  getShiftStatus,
  onDayClick,
  onAllocate,
  onInviteAll,
  onPull,
}: {
  monthDate: Date
  shifts: ShiftRow[]
  getShiftStatus: (s: ShiftRow) => { label: string; className: string }
  onDayClick: (dateStr: string) => void
  onAllocate: (s: ShiftRow) => void
  onInviteAll: (s: ShiftRow) => void
  onPull: (s: ShiftRow) => void
}) {
  const first = startOfMonth(monthDate)
  const last = endOfMonth(monthDate)
  const startPad = first.getDay()
  const daysInMonth = last.getDate()
  const totalCells = startPad + daysInMonth
  const rows = Math.ceil(totalCells / 7)
  const today = new Date()

  const dayCells: { dateStr: string; dayNum: number; isCurrentMonth: boolean }[] = []
  for (let i = 0; i < startPad; i++) {
    const d = subDays(first, startPad - i)
    dayCells.push({
      dateStr: format(d, 'yyyy-MM-dd'),
      dayNum: d.getDate(),
      isCurrentMonth: false,
    })
  }
  for (let i = 0; i < daysInMonth; i++) {
    const d = addDays(first, i)
    dayCells.push({
      dateStr: format(d, 'yyyy-MM-dd'),
      dayNum: d.getDate(),
      isCurrentMonth: true,
    })
  }
  const remainder = rows * 7 - dayCells.length
  for (let i = 0; i < remainder; i++) {
    const d = addDays(last, i + 1)
    dayCells.push({
      dateStr: format(d, 'yyyy-MM-dd'),
      dayNum: d.getDate(),
      isCurrentMonth: false,
    })
  }

  return (
    <div className="p-4 overflow-x-auto">
      <div className="grid grid-cols-7 min-w-[280px]">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
          <div key={day} className="text-center text-xs font-semibold text-gray-600 py-2 border-b border-gray-200">
            {day}
          </div>
        ))}
        {dayCells.map((cell) => {
          const dayShifts = shifts.filter((s) => s.shift_date === cell.dateStr) as ShiftRow[]
          const cellDate = parseISO(cell.dateStr)
          const isToday = isSameDay(cellDate, today)
          const dayStatus =
            dayShifts.length === 0
              ? 'gray'
              : dayShifts.every((s) => getShiftStatus(s).label === 'Allocated')
                ? 'green'
                : dayShifts.some((s) => getShiftStatus(s).label === 'Pending')
                  ? 'amber'
                  : 'gray'
          return (
            <button
              key={cell.dateStr}
              type="button"
              onClick={() => cell.isCurrentMonth && onDayClick(cell.dateStr)}
              className={`min-h-[80px] p-2 text-left border border-gray-100 rounded-lg flex flex-col gap-0.5 ${
                !cell.isCurrentMonth ? 'bg-gray-50 text-gray-400' : 'bg-white hover:bg-violet-50'
              } ${isToday ? 'ring-2 ring-violet-500 ring-inset' : ''}`}
            >
              <span className="text-sm font-medium">{cell.dayNum}</span>
              {dayShifts.length > 0 && (
                <>
                  {dayShifts.slice(0, 3).map((s) => {
                    const st = getShiftStatus(s)
                    const role = s.role as { name?: string } | undefined
                    return (
                      <div
                        key={String(s.id)}
                        className={`text-[10px] truncate px-1 py-0.5 rounded ${st.className}`}
                        title={`${role?.name ?? ''} ${s.start_time}–${s.end_time}`}
                      >
                        {String(role?.name ?? '')} {String(s.start_time)}
                      </div>
                    )
                  })}
                  {dayShifts.length > 3 && (
                    <span className="text-[10px] text-gray-500">+{dayShifts.length - 3} more</span>
                  )}
                </>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Modal listing all shifts for a single day with Fill Shift / Allocate / Invite All / Pull Staff. */
function DayShiftsModal({
  dateStr,
  shifts,
  getShiftStatus,
  onClose,
  onFillShift,
  onAllocate,
  onInviteAll,
  onPull,
}: {
  dateStr: string
  shifts: ShiftRow[]
  getShiftStatus: (s: ShiftRow) => { label: string; className: string }
  onClose: () => void
  onFillShift?: (s: ShiftRow) => void
  onAllocate: (s: ShiftRow) => void
  onInviteAll: (s: ShiftRow) => void
  onPull: (s: ShiftRow) => void
}) {
  const dateFormatted = format(parseISO(dateStr), 'EEEE, d MMM yyyy')
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-lg w-full max-h-[85vh] overflow-hidden flex flex-col">
        <div className="p-4 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-lg font-bold">Shifts for {dateFormatted}</h2>
          <button type="button" onClick={onClose} className="text-gray-500 hover:text-gray-700 text-2xl leading-none">
            ×
          </button>
        </div>
        <div className="overflow-y-auto p-4 space-y-3">
          {shifts.length === 0 ? (
            <p className="text-gray-500 text-sm">No shifts on this day.</p>
          ) : (
            shifts.map((shift) => {
              const status = getShiftStatus(shift)
              const role = shift.role as { name?: string } | undefined
              const venue = shift.venue as { name?: string } | undefined
              return (
                <div
                  key={String(shift.id)}
                  className="rounded-lg p-3 border border-gray-200 bg-gray-50"
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded ${status.className}`}>
                      {status.label}
                    </span>
                    <span className="text-xs text-gray-500">
                      {Number(shift.headcount_filled ?? 0)}/{Number(shift.headcount_needed ?? 1)}
                    </span>
                  </div>
                  <div className="text-sm font-medium text-gray-900">{String(role?.name ?? '')}</div>
                  <div className="text-xs text-gray-500">
                    {String(shift.start_time)}–{String(shift.end_time)}
                    {venue?.name ? ` · ${venue.name}` : ''}
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <button
                      type="button"
                      onClick={() => onFillShift?.(shift)}
                      className="flex items-center gap-1 px-2 py-1 text-xs font-medium bg-violet-100 text-violet-700 rounded hover:bg-violet-200"
                    >
                      Fill Shift
                    </button>
                    <button
                      type="button"
                      onClick={() => onAllocate(shift)}
                      className="flex items-center gap-1 px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                    >
                      <Users className="w-3 h-3" />
                      Allocate
                    </button>
                    <button
                      type="button"
                      onClick={() => onInviteAll(shift)}
                      className="flex items-center gap-1 px-2 py-1 text-xs font-medium bg-purple-100 text-purple-700 rounded hover:bg-purple-200"
                    >
                      <Send className="w-3 h-3" />
                      Invite All
                    </button>
                    <button
                      type="button"
                      onClick={() => onPull(shift)}
                      className="flex items-center gap-1 px-2 py-1 text-xs font-medium bg-amber-100 text-amber-700 rounded hover:bg-amber-200"
                    >
                      <UserPlus className="w-3 h-3" />
                      Pull Staff
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

function AllocateModal({
  shift,
  organisationId,
  onClose,
  onSuccess,
}: {
  shift: ShiftRow
  organisationId: string
  onClose: () => void
  onSuccess: () => void
}) {
  const [employees, setEmployees] = useState<Record<string, unknown>[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    getTeamMembers(organisationId).then((data) => {
      setEmployees((data || []).filter((e: Record<string, unknown>) => e.status === 'active'))
      setLoading(false)
    })
  }, [organisationId])

  async function handleAllocate() {
    if (!selectedId) return
    setSending(true)
    try {
      await allocateEmployee({
        rota_shift_id: String(shift.id),
        team_member_id: selectedId,
      })
      alert('Staff allocated successfully')
      onSuccess()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to allocate')
    } finally {
      setSending(false)
    }
  }

  const role = shift.role as { name?: string } | undefined
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-md w-full">
        <div className="p-6 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-xl font-bold">Allocate Staff</h2>
          <button type="button" onClick={onClose} className="text-gray-500 hover:text-gray-700 text-2xl leading-none">
            ×
          </button>
        </div>
        <div className="p-6">
          <p className="text-sm text-gray-600 mb-4">
            {String(role?.name ?? 'Shift')} · {String(shift.shift_date)} · {String(shift.start_time)}–{String(shift.end_time)}
          </p>
          {loading ? (
            <p className="text-gray-500">Loading team...</p>
          ) : (
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg p-3 mb-4"
            >
              <option value="">Select team member</option>
              {employees.map((emp) => {
                const profile = emp.profile as { full_name?: string } | undefined
                return (
                  <option key={String(emp.id)} value={String(emp.id)}>
                    {String(profile?.full_name ?? emp.email ?? emp.id)}
                  </option>
                )
              })}
            </select>
          )}
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg">
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAllocate}
              disabled={!selectedId || sending}
              className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg font-medium disabled:opacity-50"
            >
              {sending ? 'Allocating...' : 'Allocate'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function InviteAllModal({
  shift,
  onClose,
  onSuccess,
}: {
  shift: ShiftRow
  onClose: () => void
  onSuccess: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ sent: number; message: string } | null>(null)

  async function handleInviteAll() {
    setLoading(true)
    setResult(null)
    try {
      const venueId = String(shift.venue_id ?? (shift.venue as { id?: string })?.id ?? '')
      const roleId = String(shift.role_id ?? (shift.role as { id?: string })?.id ?? '')
      const list = await pullAvailableWorkers({
        venueId,
        roleId: roleId || undefined,
        shiftDate: shift.shift_date as string,
        shiftId: String(shift.id),
      })
      if (list.length === 0) {
        setResult({ sent: 0, message: 'No available workers to invite for this shift.' })
        setLoading(false)
        return
      }
      const ids = list.map((w) => (w as { team_member_id: string }).team_member_id)
      await inviteEmployeesToShift({
        rota_shift_id: String(shift.id),
        team_member_ids: ids,
      })
      setResult({ sent: ids.length, message: `Invites sent to ${ids.length} available worker(s).` })
      setTimeout(() => onSuccess(), 2000)
    } catch (e) {
      setResult({
        sent: 0,
        message: e instanceof Error ? e.message : 'Failed to send invites',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-md w-full">
        <div className="p-6 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-xl font-bold">Invite All Available</h2>
          <button type="button" onClick={onClose} className="text-gray-500 hover:text-gray-700 text-2xl leading-none">
            ×
          </button>
        </div>
        <div className="p-6">
          <p className="text-sm text-gray-600 mb-4">
            Send shift invite to all workers currently available for this shift (from pull list).
          </p>
          {result ? (
            <p className={`text-sm mb-4 ${result.sent > 0 ? 'text-green-700' : 'text-amber-700'}`}>{result.message}</p>
          ) : null}
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg">
              {result ? 'Close' : 'Cancel'}
            </button>
            {!result && (
              <button
                type="button"
                onClick={handleInviteAll}
                disabled={loading}
                className="flex-1 px-4 py-2 bg-gradient-to-r from-purple-500 to-indigo-600 text-white rounded-lg font-medium disabled:opacity-50"
              >
                {loading ? 'Sending...' : 'Invite All'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
