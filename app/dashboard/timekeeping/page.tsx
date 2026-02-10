'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  CheckCircle,
  FileText,
  Clock,
  Download,
  Filter,
  Loader2,
  BarChart3,
  ClipboardCheck,
} from 'lucide-react'
import {
  getPendingTimesheets,
  approveTimesheet,
  requestTimesheetEdit,
  getPendingManualSubmissions,
  getPendingTimeApprovals,
  processTimeApproval,
  reviewTimeProposal,
  getTimekeepingByDateRange,
} from '@/lib/services/timekeeping'
import { getVenuesByOrg } from '@/lib/services/venues'
import { getOrganisationIdForCurrentUser } from '@/lib/services/organisations'
import { getTeamMembers } from '@/lib/services/team'
import { supabase } from '@/lib/supabase'

type TabId = 'overview' | 'approvals' | 'reports'
type Row = Record<string, unknown>

function formatTime(val: unknown): string {
  if (val == null) return '–'
  const d = typeof val === 'string' ? new Date(val) : val
  if (Number.isNaN((d as Date).getTime())) return '–'
  return (d as Date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}
function formatDate(val: unknown): string {
  if (val == null) return '–'
  const d = typeof val === 'string' ? new Date(val) : val
  if (Number.isNaN((d as Date).getTime())) return String(val)
  return (d as Date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
function formatDateShort(d: string): string {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
function diffLabel(proposed: string | undefined, scheduled: string | undefined): string {
  if (!proposed || !scheduled) return '–'
  const p = new Date(proposed).getTime()
  const s = new Date(scheduled).getTime()
  if (Number.isNaN(p) || Number.isNaN(s)) return '–'
  const diff = Math.round((p - s) / 60000)
  if (diff === 0) return 'On time'
  if (diff > 0) return `+${diff} min`
  return `${diff} min`
}

export default function TimekeepingPage() {
  const searchParams = useSearchParams()
  const tabFromUrl = (searchParams.get('tab') as TabId) || 'overview'
  const [tab, setTab] = useState<TabId>(tabFromUrl)

  useEffect(() => {
    const t = (searchParams.get('tab') as TabId) || 'overview'
    if (t === 'overview' || t === 'approvals' || t === 'reports') setTab(t)
  }, [searchParams])

  const [orgId, setOrgId] = useState<string | null>(null)
  const [venues, setVenues] = useState<Record<string, unknown>[]>([])
  const [selectedVenue, setSelectedVenue] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [timesheets, setTimesheets] = useState<Record<string, unknown>[]>([])
  const [pendingManual, setPendingManual] = useState<Row[]>([])
  const [pendingTimeApprovals, setPendingTimeApprovals] = useState<Row[]>([])
  const [stats, setStats] = useState({ hoursThisWeek: 0, approvedThisMonth: 0 })
  const [actioningId, setActioningId] = useState<string | null>(null)
  const [modifyModal, setModifyModal] = useState<Row | null>(null)
  const [rejectModal, setRejectModal] = useState<Row | null>(null)
  const [rejectNotes, setRejectNotes] = useState('')
  const [modifyStart, setModifyStart] = useState('')
  const [modifyEnd, setModifyEnd] = useState('')
  const [modifyNotes, setModifyNotes] = useState('')
  const [manualModifyModal, setManualModifyModal] = useState<Row | null>(null)
  const [manualRejectModal, setManualRejectModal] = useState<Row | null>(null)
  const [manualRejectNotes, setManualRejectNotes] = useState('')
  const [modifyClockIn, setModifyClockIn] = useState('')
  const [modifyClockOut, setModifyClockOut] = useState('')
  const [modifyNotesManual, setModifyNotesManual] = useState('')
  const [view, setView] = useState<'daily' | 'weekly' | 'monthly'>('weekly')
  const [records, setRecords] = useState<Record<string, unknown>[]>([])
  const [venueId, setVenueId] = useState('')
  const [workerId, setWorkerId] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [teamMembers, setTeamMembers] = useState<Record<string, unknown>[]>([])
  const [dailyDate, setDailyDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date()
    const day = d.getDay()
    const diff = d.getDate() - (day === 0 ? 6 : day - 1)
    const mon = new Date(d)
    mon.setDate(diff)
    return mon.toISOString().slice(0, 10)
  })
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7))

  const loadData = useCallback(async () => {
    const id = await getOrganisationIdForCurrentUser()
    if (!id) {
      setLoading(false)
      return
    }
    setOrgId(id)
    try {
      // Fetch venues first and set immediately (same as Roster page) so dropdown always populates
      // even if other calls fail (e.g. different RLS on manual/approvals).
      const venuesData = await getVenuesByOrg(id)
      const venuesList = venuesData as unknown as Record<string, unknown>[]
      setVenues(venuesList)

      const [manualData, approvalsData, membersData] = await Promise.all([
        getPendingManualSubmissions(id),
        getPendingTimeApprovals(id),
        getTeamMembers(id),
      ])
      setPendingManual(manualData as Row[])
      setPendingTimeApprovals(approvalsData as Row[])
      const active = (membersData ?? []).filter((m: Record<string, unknown>) => m.status === 'active') as Record<string, unknown>[]
      setTeamMembers(active)
      if (venuesList.length > 0) {
        const vId = (venuesList[0] as { id: string }).id
        setVenueId(vId)
        setSelectedVenue('')
        const allPending = await Promise.all(
          (venuesList as { id: string }[]).map((v) => getPendingTimesheets(v.id))
        )
        setTimesheets(allPending.flat())
      }
      if (active.length > 0) setWorkerId(String((active[0] as { id: string }).id))
      const now = new Date()
      const day = now.getDay()
      const diff = now.getDate() - (day === 0 ? 6 : day - 1)
      const thisMonday = new Date(now)
      thisMonday.setDate(diff)
      const thisWeekStart = thisMonday.toISOString().slice(0, 10)
      const thisWeekEnd = new Date(thisMonday)
      thisWeekEnd.setDate(thisWeekEnd.getDate() + 6)
      const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)
      const [weekRecords, monthRecords] = await Promise.all([
        getTimekeepingByDateRange({ organisationId: id, startDate: thisWeekStart, endDate: thisWeekEnd.toISOString().slice(0, 10) }),
        getTimekeepingByDateRange({ organisationId: id, startDate: monthStart, endDate: monthEnd, status: 'approved' }),
      ])
      const hoursWeek = (weekRecords ?? []).reduce((s: number, r: Record<string, unknown>) => s + Number(r.total_hours ?? 0), 0)
      setStats({ hoursThisWeek: hoursWeek, approvedThisMonth: monthRecords?.length ?? 0 })
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [weekStart])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    if (tab !== 'approvals') return
    if (selectedVenue) {
      getPendingTimesheets(selectedVenue).then(setTimesheets).catch(console.error)
    } else if (venues.length > 0) {
      Promise.all(venues.map((v) => getPendingTimesheets(String((v as { id: string }).id))))
        .then((arr) => setTimesheets(arr.flat()))
        .catch(console.error)
    } else {
      setTimesheets([])
    }
  }, [selectedVenue, tab, venues])

  useEffect(() => {
    if (!orgId) return
    let start: string
    let end: string
    if (view === 'daily') {
      start = dailyDate
      end = dailyDate
    } else if (view === 'weekly') {
      start = weekStart
      const endDate = new Date(weekStart)
      endDate.setDate(endDate.getDate() + 6)
      end = endDate.toISOString().slice(0, 10)
    } else {
      start = `${month}-01`
      const lastDay = new Date(parseInt(month.slice(0, 4), 10), parseInt(month.slice(5, 7), 10), 0)
      end = lastDay.toISOString().slice(0, 10)
    }
    getTimekeepingByDateRange({
      organisationId: orgId,
      startDate: start,
      endDate: end,
      venueId: venueId || undefined,
      teamMemberId: workerId || undefined,
      status: statusFilter || undefined,
    })
      .then(setRecords)
      .catch(console.error)
  }, [orgId, view, dailyDate, weekStart, month, venueId, workerId, statusFilter])

  useEffect(() => {
    if (tab !== 'approvals') return
    const refetch = () => {
      if (selectedVenue) {
        getPendingTimesheets(selectedVenue).then(setTimesheets).catch(console.error)
      } else if (venues.length > 0) {
        Promise.all(venues.map((v) => getPendingTimesheets(String((v as { id: string }).id))))
          .then((arr) => setTimesheets(arr.flat()))
          .catch(console.error)
      }
    }
    const ch = supabase
      .channel('timekeeping_hub')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'timekeeping_records',
          ...(selectedVenue ? { filter: `venue_id=eq.${selectedVenue}` } : {}),
        },
        refetch
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shift_time_approvals' }, loadData)
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [selectedVenue, loadData, tab, venues])

  async function handleApproveTimesheet(id: string) {
    try {
      await approveTimesheet(id)
      alert('Timesheet approved.')
      if (selectedVenue) {
        getPendingTimesheets(selectedVenue).then(setTimesheets)
      } else if (venues.length > 0) {
        Promise.all(venues.map((v) => getPendingTimesheets(String((v as { id: string }).id))))
          .then((arr) => setTimesheets(arr.flat()))
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to approve')
    }
  }
  async function handleRequestEdit(id: string) {
    const notes = prompt('Enter reason for requesting edit:')
    if (!notes) return
    try {
      await requestTimesheetEdit(id, notes)
      alert('Edit request sent to employee')
      if (selectedVenue) getPendingTimesheets(selectedVenue).then(setTimesheets)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to send edit request')
    }
  }

  async function handleApproveTimeApproval(row: Row) {
    const approvalId = row.id as string
    if (!approvalId) return
    setActioningId(approvalId)
    try {
      const result = await processTimeApproval({
        approval_id: approvalId,
        action: 'approve',
        actual_start: row.requested_start as string,
        actual_end: row.requested_end as string,
      })
      if (result.success) await loadData()
      else alert(result.error ?? 'Failed to approve')
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to approve')
    } finally {
      setActioningId(null)
    }
  }
  async function handleRejectTimeApproval(row: Row) {
    const approvalId = row.id as string
    if (!approvalId || !rejectNotes.trim()) {
      alert('Manager notes are required when rejecting.')
      return
    }
    setActioningId(approvalId)
    try {
      const result = await processTimeApproval({
        approval_id: approvalId,
        action: 'reject',
        manager_notes: rejectNotes.trim(),
      })
      if (result.success) {
        setRejectModal(null)
        setRejectNotes('')
        await loadData()
      } else alert(result.error ?? 'Failed to reject')
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to reject')
    } finally {
      setActioningId(null)
    }
  }
  async function handleModifyTimeApproval() {
    const row = modifyModal
    if (!row?.id || !modifyStart || !modifyEnd) {
      alert('Please enter both start and end time.')
      return
    }
    const startISO = new Date(modifyStart).toISOString()
    const endISO = new Date(modifyEnd).toISOString()
    if (startISO >= endISO) {
      alert('Start time must be before end time.')
      return
    }
    setActioningId(row.id as string)
    try {
      const result = await processTimeApproval({
        approval_id: row.id as string,
        action: 'modify',
        actual_start: startISO,
        actual_end: endISO,
        manager_notes: modifyNotes.trim() || undefined,
      })
      if (result.success) {
        setModifyModal(null)
        setModifyStart('')
        setModifyEnd('')
        setModifyNotes('')
        await loadData()
      } else alert(result.error ?? 'Failed to update')
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to update')
    } finally {
      setActioningId(null)
    }
  }

  async function handleApproveManual(row: Row) {
    const id = row.id as string
    if (!id) return
    setActioningId(id)
    try {
      const result = await reviewTimeProposal({
        timekeeping_id: id,
        action: 'approve',
        actual_clock_in: row.proposed_clock_in as string,
        actual_clock_out: row.proposed_clock_out as string,
      })
      if (result.success) await loadData()
      else alert(result.error ?? 'Failed to approve')
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to approve')
    } finally {
      setActioningId(null)
    }
  }
  async function handleRejectManual(row: Row) {
    const id = row.id as string
    if (!id) return
    setActioningId(id)
    try {
      const result = await reviewTimeProposal({
        timekeeping_id: id,
        action: 'reject',
        notes: manualRejectNotes.trim() || undefined,
      })
      if (result.success) {
        setManualRejectModal(null)
        setManualRejectNotes('')
        await loadData()
      } else alert(result.error ?? 'Failed to reject')
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to reject')
    } finally {
      setActioningId(null)
    }
  }
  async function handleModifyManual() {
    const row = manualModifyModal
    if (!row?.id || !modifyClockIn || !modifyClockOut) {
      alert('Please enter both clock-in and clock-out.')
      return
    }
    const clockInISO = new Date(modifyClockIn).toISOString()
    const clockOutISO = new Date(modifyClockOut).toISOString()
    if (clockInISO >= clockOutISO) {
      alert('Clock-in must be before clock-out.')
      return
    }
    setActioningId(row.id as string)
    try {
      const result = await reviewTimeProposal({
        timekeeping_id: row.id as string,
        action: 'modify',
        actual_clock_in: clockInISO,
        actual_clock_out: clockOutISO,
        notes: modifyNotesManual.trim() || undefined,
      })
      if (result.success) {
        setManualModifyModal(null)
        setModifyClockIn('')
        setModifyClockOut('')
        setModifyNotesManual('')
        await loadData()
      } else alert(result.error ?? 'Failed to update')
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to update')
    } finally {
      setActioningId(null)
    }
  }

  const totalHoursReports = records.reduce((sum, r) => sum + Number(r.total_hours ?? 0), 0)
  const totalPending = timesheets.length + pendingManual.length + pendingTimeApprovals.length

  if (loading && tab === 'overview') {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Timekeeping & Timesheets</h1>
        <Link
          href="/dashboard/timekeeping/generate"
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700"
        >
          <FileText className="w-4 h-4" />
          Generate timesheet
        </Link>
      </div>

      <div className="flex gap-2 mb-6 border-b border-gray-200">
        {(['overview', 'approvals', 'reports'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-t-lg font-medium ${
              tab === t
                ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {t === 'overview' ? 'Overview' : t === 'approvals' ? 'Approvals' : 'Reports'}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
                <Clock className="w-5 h-5 text-indigo-600" />
              </div>
              <span className="text-sm font-medium text-gray-600">Total Hours This Week</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{stats.hoursThisWeek.toFixed(1)}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
                <ClipboardCheck className="w-5 h-5 text-amber-600" />
              </div>
              <span className="text-sm font-medium text-gray-600">Pending Approvals</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{totalPending}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
              <span className="text-sm font-medium text-gray-600">Approved This Month</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{stats.approvedThisMonth}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                <BarChart3 className="w-5 h-5 text-purple-600" />
              </div>
              <span className="text-sm font-medium text-gray-600">Timesheet records</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{timesheets.length} pending</p>
          </div>
        </div>
      )}

      {tab === 'approvals' && (
        <div className="space-y-8">
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl p-4 mb-6">
            <h2 className="text-lg font-bold text-white mb-1">Pending timesheet approvals</h2>
            <p className="text-sm text-white/95 mb-3">Review and approve employee clock-in/out. Select venue:</p>
            <select
              value={selectedVenue}
              onChange={(e) => setSelectedVenue(e.target.value)}
              className="w-full md:w-64 border border-gray-300 rounded-lg p-2 mb-1 bg-white text-gray-900"
              aria-label="Select venue"
            >
              <option value="">{loading ? 'Loading venues…' : 'All Venues'}</option>
              {venues.map((v) => (
                <option key={String(v.id)} value={String(v.id)}>{String(v.name)}</option>
              ))}
            </select>
            {!loading && venues.length === 0 && (
              <p className="text-sm text-white/90 mt-2">No venues found. Add venues in Settings or Team.</p>
            )}
          </div>
          {timesheets.length === 0 ? (
              <div className="bg-white rounded-xl p-8 text-center border border-gray-200">
                <CheckCircle className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                <p className="text-gray-500">All caught up! No pending timesheets.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {timesheets.map((ts) => {
                  const teamMember = ts.team_member as Record<string, unknown> | undefined
                  const profile = teamMember?.profile as Record<string, unknown> | undefined
                  const shift = ts.shift as Record<string, unknown> | undefined
                  const shiftRole = shift?.role as Record<string, unknown> | undefined
                  const venue = ts.venue as Record<string, unknown> | undefined
                  return (
                    <div key={String(ts.id)} className="bg-white rounded-xl p-4 border border-gray-200">
                      <div className="flex justify-between items-start flex-wrap gap-2">
                        <div>
                          <p className="font-medium text-gray-900">{(profile?.full_name as string) ?? 'Unknown'}</p>
                          <p className="text-sm text-gray-500">
                            {String(shiftRole?.name ?? '')} • {String(venue?.name ?? '')} • {shift?.shift_date ? formatDate(shift.shift_date) : ''}
                          </p>
                          <p className="text-sm text-gray-600 mt-1">
                            Scheduled: {String(shift?.start_time ?? '')}–{String(shift?.end_time ?? '')} · Actual: {formatTime(ts.clock_in)}–{formatTime(ts.clock_out)} · {typeof ts.total_hours === 'number' ? ts.total_hours.toFixed(2) : '0'} hrs
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleApproveTimesheet(String(ts.id))}
                            className="px-3 py-1.5 rounded-lg bg-green-100 text-green-800 text-sm font-medium hover:bg-green-200"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRequestEdit(String(ts.id))}
                            className="px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium"
                          >
                            Request edit
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

          <div>
            <h2 className="text-lg font-bold text-gray-900 mb-2">Manual time entry approvals</h2>
            {pendingManual.length === 0 ? (
              <div className="bg-white rounded-xl p-6 text-center border border-gray-200">
                <p className="text-gray-500">No pending manual time submissions.</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Worker</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Shift date</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Scheduled</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Proposed</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {pendingManual.map((row) => {
                        const shift = row.shift as Record<string, unknown> | undefined
                        const teamMember = row.team_member as Record<string, unknown> | undefined
                        const profile = teamMember?.profile as Record<string, unknown> | undefined
                        const name = (profile?.full_name as string) ?? '–'
                        const id = row.id as string
                        const busy = actioningId === id
                        return (
                          <tr key={id} className="hover:bg-gray-50">
                            <td className="px-4 py-2 text-sm font-medium text-gray-900">{name}</td>
                            <td className="px-4 py-2 text-sm text-gray-600">{formatDate(shift?.shift_date)}</td>
                            <td className="px-4 py-2 text-sm text-gray-600">
                              {formatTime(shift?.start_time ? `${shift.shift_date}T${String(shift.start_time).slice(0, 5)}` : null)} – {formatTime(shift?.end_time ? `${shift.shift_date}T${String(shift.end_time).slice(0, 5)}` : null)}
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-900">
                              {formatTime(row.proposed_clock_in)} – {formatTime(row.proposed_clock_out)}
                            </td>
                            <td className="px-4 py-2 text-right">
                              <div className="flex justify-end gap-2">
                                <button type="button" onClick={() => handleApproveManual(row)} disabled={busy} className="px-3 py-1.5 rounded-lg bg-green-100 text-green-800 text-sm font-medium disabled:opacity-50">Approve</button>
                                <button type="button" onClick={() => { setManualModifyModal(row); setModifyClockIn((row.proposed_clock_in as string) ? new Date(row.proposed_clock_in as string).toISOString().slice(0, 16) : ''); setModifyClockOut((row.proposed_clock_out as string) ? new Date(row.proposed_clock_out as string).toISOString().slice(0, 16) : ''); setModifyNotesManual(''); }} disabled={busy} className="px-3 py-1.5 rounded-lg bg-blue-100 text-blue-800 text-sm font-medium disabled:opacity-50">Modify</button>
                                <button type="button" onClick={() => { setManualRejectModal(row); setManualRejectNotes(''); }} disabled={busy} className="px-3 py-1.5 rounded-lg bg-red-100 text-red-800 text-sm font-medium disabled:opacity-50">Reject</button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          <div>
            <h2 className="text-lg font-bold text-gray-900 mb-2">Shift time change approvals</h2>
            {pendingTimeApprovals.length === 0 ? (
              <div className="bg-white rounded-xl p-6 text-center border border-gray-200">
                <p className="text-gray-500">No pending time change requests.</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Worker</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Shift date</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Scheduled</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Requested</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {pendingTimeApprovals.map((row) => {
                        const tk = (row.timekeeping_records ?? row.timekeeping_record) as Record<string, unknown> | undefined
                        const teamMember = tk?.team_member as Record<string, unknown> | undefined
                        const profile = teamMember?.profile as Record<string, unknown> | undefined
                        const name = (profile?.full_name as string) ?? '–'
                        const shift = tk?.shift as Record<string, unknown> | undefined
                        const approvalId = row.id as string
                        const busy = actioningId === approvalId
                        return (
                          <tr key={approvalId} className="hover:bg-gray-50">
                            <td className="px-4 py-2 text-sm font-medium text-gray-900">{name}</td>
                            <td className="px-4 py-2 text-sm text-gray-600">{formatDate(shift?.shift_date)}</td>
                            <td className="px-4 py-2 text-sm text-gray-600">
                              {formatTime(row.original_shift_start)} – {formatTime(row.original_shift_end)}
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-900">
                              {formatTime(row.requested_start)} – {formatTime(row.requested_end)}
                            </td>
                            <td className="px-4 py-2 text-right">
                              <div className="flex justify-end gap-2">
                                <button type="button" onClick={() => handleApproveTimeApproval(row)} disabled={busy} className="px-3 py-1.5 rounded-lg bg-green-100 text-green-800 text-sm font-medium disabled:opacity-50">Approve</button>
                                <button type="button" onClick={() => { setModifyModal(row); setModifyStart((row.requested_start as string) ? new Date(row.requested_start as string).toISOString().slice(0, 16) : ''); setModifyEnd((row.requested_end as string) ? new Date(row.requested_end as string).toISOString().slice(0, 16) : ''); setModifyNotes(''); }} disabled={busy} className="px-3 py-1.5 rounded-lg bg-blue-100 text-blue-800 text-sm font-medium disabled:opacity-50">Modify</button>
                                <button type="button" onClick={() => { setRejectModal(row); setRejectNotes(''); }} disabled={busy} className="px-3 py-1.5 rounded-lg bg-red-100 text-red-800 text-sm font-medium disabled:opacity-50">Reject</button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'reports' && (
        <>
          <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
            <div className="flex items-center gap-2 mb-3 text-gray-700 font-medium">
              <Filter className="w-4 h-4" />
              Filters
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">View</label>
                <select value={view} onChange={(e) => setView(e.target.value as 'daily' | 'weekly' | 'monthly')} className="w-full border border-gray-300 rounded-lg px-3 py-2">
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
              {view === 'daily' && (
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Date</label>
                  <input type="date" value={dailyDate} onChange={(e) => setDailyDate(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2" />
                </div>
              )}
              {view === 'weekly' && (
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Week starting</label>
                  <input type="date" value={weekStart} onChange={(e) => setWeekStart(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2" />
                </div>
              )}
              {view === 'monthly' && (
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Month</label>
                  <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2" />
                </div>
              )}
              <div>
                <label className="block text-sm text-gray-600 mb-1">Venue</label>
                <select value={venueId} onChange={(e) => setVenueId(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2">
                  <option value="">All venues</option>
                  {venues.map((v) => (
                    <option key={String(v.id)} value={String(v.id)}>{String(v.name)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Worker</label>
                <select value={workerId} onChange={(e) => setWorkerId(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2">
                  <option value="">All workers</option>
                  {teamMembers.map((m) => (
                    <option key={String(m.id)} value={String(m.id)}>{String((m.profile as { full_name?: string })?.full_name ?? m.email ?? m.id)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Status</label>
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2">
                  <option value="">All</option>
                  <option value="approved">Approved</option>
                  <option value="pending">Pending</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
            </div>
          </div>
          <div className="mb-4 flex items-center justify-between flex-wrap gap-2">
            <p className="text-gray-600">
              Total hours: <strong>{totalHoursReports.toFixed(2)}</strong> · <strong>{records.length}</strong> record(s)
            </p>
            <button
              type="button"
              className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
              onClick={() => {
                const headers = ['Date', 'Worker', 'Venue', 'Role', 'Clock In', 'Clock Out', 'Hours', 'Status']
                const rows = records.map((r) => {
                  const shift = r.shift as Record<string, unknown> | undefined
                  const venue = shift?.venue as { name?: string } | undefined
                  const role = shift?.role as { name?: string } | undefined
                  const profile = (r.team_member as Record<string, unknown>)?.profile as { full_name?: string } | undefined
                  const status = String(r.manual_entry_status ?? r.status ?? 'pending')
                  return [
                    formatDateShort(String(shift?.shift_date ?? r.clock_in)),
                    profile?.full_name ?? '–',
                    venue?.name ?? '–',
                    role?.name ?? '–',
                    formatTime(r.clock_in ?? r.actual_clock_in),
                    formatTime(r.clock_out ?? r.actual_clock_out),
                    Number(r.total_hours ?? 0).toFixed(2),
                    status,
                  ].join(',')
                })
                const csv = [headers.join(','), ...rows].join('\n')
                const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `timesheet-report-${new Date().toISOString().slice(0, 10)}.csv`
                a.click()
                URL.revokeObjectURL(url)
              }}
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          </div>
          {records.length === 0 ? (
            <div className="bg-white rounded-xl p-12 text-center border border-gray-200">
              <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No timekeeping records match the filters.</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Worker</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Venue / Role</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Clock In – Out</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Hours</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {records.map((r) => {
                      const shift = r.shift as Record<string, unknown> | undefined
                      const venue = shift?.venue as { name?: string } | undefined
                      const role = shift?.role as { name?: string } | undefined
                      const profile = (r.team_member as Record<string, unknown>)?.profile as { full_name?: string } | undefined
                      const status = String(r.manual_entry_status ?? r.status ?? 'pending')
                      return (
                        <tr key={String(r.id)} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm text-gray-900">{formatDateShort(String(shift?.shift_date ?? r.clock_in))}</td>
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">{profile?.full_name ?? '–'}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">{venue?.name ?? '–'} / {role?.name ?? '–'}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">{formatTime(r.clock_in ?? r.actual_clock_in)} – {formatTime(r.clock_out ?? r.actual_clock_out)}</td>
                          <td className="px-4 py-3 text-sm text-right font-medium">{Number(r.total_hours ?? 0).toFixed(2)}</td>
                          <td className="px-4 py-3 text-right">
                            <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${status === 'approved' ? 'bg-green-100 text-green-800' : status === 'pending' ? 'bg-amber-100 text-amber-800' : status === 'rejected' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-700'}`}>{status}</span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Modals: shift time approval modify/reject */}
      {modifyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Modify times</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start time</label>
                <input type="datetime-local" value={modifyStart} onChange={(e) => setModifyStart(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End time</label>
                <input type="datetime-local" value={modifyEnd} onChange={(e) => setModifyEnd(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
                <textarea value={modifyNotes} onChange={(e) => setModifyNotes(e.target.value)} rows={2} className="w-full border border-gray-300 rounded-lg px-3 py-2" />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button type="button" onClick={() => setModifyModal(null)} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium">Cancel</button>
              <button type="button" onClick={handleModifyTimeApproval} className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium">Save & notify</button>
            </div>
          </div>
        </div>
      )}
      {rejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Reject submission</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Manager notes (required) *</label>
              <textarea value={rejectNotes} onChange={(e) => setRejectNotes(e.target.value)} placeholder="Tell the worker why this was rejected" rows={3} className="w-full border border-gray-300 rounded-lg px-3 py-2" />
            </div>
            <div className="flex gap-3 mt-6">
              <button type="button" onClick={() => setRejectModal(null)} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium">Cancel</button>
              <button type="button" onClick={() => handleRejectTimeApproval(rejectModal)} disabled={!rejectNotes.trim()} className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-medium disabled:opacity-50">Reject</button>
            </div>
          </div>
        </div>
      )}

      {/* Modals: manual time modify/reject */}
      {manualModifyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Modify times</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Clock-in</label>
                <input type="datetime-local" value={modifyClockIn} onChange={(e) => setModifyClockIn(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Clock-out</label>
                <input type="datetime-local" value={modifyClockOut} onChange={(e) => setModifyClockOut(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
                <textarea value={modifyNotesManual} onChange={(e) => setModifyNotesManual(e.target.value)} rows={2} className="w-full border border-gray-300 rounded-lg px-3 py-2" />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button type="button" onClick={() => setManualModifyModal(null)} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium">Cancel</button>
              <button type="button" onClick={handleModifyManual} className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium">Save & notify</button>
            </div>
          </div>
        </div>
      )}
      {manualRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Reject submission</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reason (optional)</label>
              <textarea value={manualRejectNotes} onChange={(e) => setManualRejectNotes(e.target.value)} placeholder="Tell the worker why this was rejected" rows={3} className="w-full border border-gray-300 rounded-lg px-3 py-2" />
            </div>
            <div className="flex gap-3 mt-6">
              <button type="button" onClick={() => setManualRejectModal(null)} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium">Cancel</button>
              <button type="button" onClick={() => handleRejectManual(manualRejectModal)} className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-medium">Reject</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
