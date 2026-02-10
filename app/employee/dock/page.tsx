'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  getShiftForClock,
  clockInAuto,
  submitManualTimeEntry,
  getClockErrorMessage,
} from '@/lib/services/timekeeping'
import { Clock, FileCheck, AlertCircle, Zap } from 'lucide-react'

const MAX_SHIFT_HOURS = 16
const REASON_REQUIRED_DIFF_MINUTES = 15
const GRACE_PERIOD_MINUTES = 10
const WITHIN_SHIFT_HOURS = 24

function todayDateString(): string {
  const d = new Date()
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}

function toISOInLocalTZ(dateStr: string, timeStr: string): string {
  if (!dateStr || !timeStr) return ''
  return new Date(`${dateStr}T${timeStr}`).toISOString()
}

function diffMinutes(proposedISO: string, scheduledDate: string, scheduledTime: string): number {
  const scheduled = new Date(`${scheduledDate}T${String(scheduledTime).slice(0, 5)}`).getTime()
  const proposed = new Date(proposedISO).getTime()
  if (Number.isNaN(scheduled) || Number.isNaN(proposed)) return 0
  return Math.round((proposed - scheduled) / 60000)
}

function DockContent() {
  const searchParams = useSearchParams()
  const shiftId = searchParams.get('shift')

  const [shift, setShift] = useState<Record<string, unknown> | null>(null)
  const [allocation, setAllocation] = useState<Record<string, unknown> | null>(null)
  const [timekeeping, setTimekeeping] = useState<Record<string, unknown> | null>(null)
  const [teamMemberId, setTeamMemberId] = useState<string>('')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)

  const [manualStartDate, setManualStartDate] = useState('')
  const [manualStartTime, setManualStartTime] = useState('')
  const [manualEndDate, setManualEndDate] = useState('')
  const [manualEndTime, setManualEndTime] = useState('')
  const [manualReason, setManualReason] = useState('')
  const [showManualEntry] = useState(true)
  const [submitSuccess, setSubmitSuccess] = useState(false)
  const [successMode, setSuccessMode] = useState<'auto' | 'manual' | null>(null)

  useEffect(() => {
    if (!shiftId) {
      setLoadError('No shift specified')
      setLoading(false)
      return
    }
    async function load() {
      setLoading(true)
      setLoadError(null)
      try {
        const result = await getShiftForClock(shiftId)
        if (!result.success) {
          setLoadError(result.message ?? result.error ?? 'Unable to load shift')
          setLoading(false)
          return
        }
        setTeamMemberId(String(result.team_member_id))
        setShift(result.shift ?? null)
        setAllocation(result.allocation ?? null)
        const tk = result.timekeeping
        setTimekeeping(tk && typeof tk === 'object' && tk !== null ? (tk as Record<string, unknown>) : null)

        const s = result.shift as { shift_date?: string; start_time?: string; end_time?: string } | undefined
        if (s?.shift_date) {
          setManualStartDate(s.shift_date)
          setManualEndDate(s.shift_date)
          setManualStartTime(String(s.start_time ?? '09:00').substring(0, 5))
          setManualEndTime(String(s.end_time ?? '17:00').substring(0, 5))
        }
        const existing = result.timekeeping as { proposed_clock_in?: string; proposed_clock_out?: string } | undefined
        if (existing?.proposed_clock_in) {
          const d = new Date(existing.proposed_clock_in)
          setManualStartDate(d.toISOString().slice(0, 10))
          setManualStartTime(d.toTimeString().slice(0, 5))
        }
        if (existing?.proposed_clock_out) {
          const d = new Date(existing.proposed_clock_out)
          setManualEndDate(d.toISOString().slice(0, 10))
          setManualEndTime(d.toTimeString().slice(0, 5))
        }
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : 'Failed to load shift')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [shiftId])

  async function handleClockInNow() {
    if (!shiftId || !teamMemberId) return
    const shiftDateStr = String(shift?.shift_date ?? '')
    const todayStr = todayDateString()
    const isShiftToday = shiftDateStr === todayStr
    const s = shift as { end_time?: string } | undefined
    const endTimeOnly = String(s?.end_time ?? '23:59').slice(0, 5)
    const shiftEndLocal = shiftDateStr && endTimeOnly ? new Date(`${shiftDateStr}T${endTimeOnly}:00`) : null
    const shiftEndedToday = isShiftToday && shiftEndLocal != null && new Date() > shiftEndLocal
    if (shiftDateStr > todayStr) {
      alert(`This shift is scheduled for ${shiftDateStr ? new Date(shiftDateStr + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : ''}. You can only clock in on that day.`)
      return
    }
    if (shiftDateStr < todayStr) {
      alert('Cannot clock in for past shifts. Use manual entry to submit your actual times for approval.')
      return
    }
    if (shiftEndedToday) {
      alert('Shift already completed. Use manual entry to submit correction.')
      return
    }
    setProcessing(true)
    try {
      const result = await clockInAuto({
        rota_shift_id: shiftId,
        team_member_id: teamMemberId,
      })
      if (result.success) {
        setTimekeeping(result.record as unknown as Record<string, unknown>)
        setSuccessMode('auto')
        // Stay on page so user can still see manual entry option for corrections
      } else {
        alert(result.error ?? getClockErrorMessage(null))
      }
    } catch (error) {
      alert(getClockErrorMessage(error))
    } finally {
      setProcessing(false)
    }
  }

  async function handleSubmitForApproval() {
    if (!shiftId || !teamMemberId || !shift) return
    const startISO = toISOInLocalTZ(manualStartDate, manualStartTime)
    const endISO = toISOInLocalTZ(manualEndDate, manualEndTime)
    if (!startISO || !endISO) {
      alert('Please enter both Actual Start Time and Actual End Time.')
      return
    }
    if (new Date(startISO) >= new Date(endISO)) {
      alert('Start time must be before end time.')
      return
    }
    const hours = (new Date(endISO).getTime() - new Date(startISO).getTime()) / (1000 * 60 * 60)
    if (hours > MAX_SHIFT_HOURS) {
      alert(`Shift length cannot exceed ${MAX_SHIFT_HOURS} hours.`)
      return
    }
    const s = shift as { shift_date?: string; start_time?: string; end_time?: string }
    const dateStr = String(s?.shift_date ?? manualStartDate)
    const startTime = String(s?.start_time ?? '00:00').slice(0, 5)
    const endTime = String(s?.end_time ?? '23:59').slice(0, 5)
    const scheduledStart = new Date(`${dateStr}T${startTime}`).getTime()
    const scheduledEnd = new Date(`${dateStr}T${endTime}`).getTime()
    if (new Date(startISO).getTime() < scheduledStart - WITHIN_SHIFT_HOURS * 60 * 60 * 1000 ||
        new Date(startISO).getTime() > scheduledEnd + WITHIN_SHIFT_HOURS * 60 * 60 * 1000) {
      alert(`Submitted time must be within ${WITHIN_SHIFT_HOURS} hours of the scheduled shift.`)
      return
    }
    const diffIn = Math.abs(diffMinutes(startISO, dateStr, startTime))
    const diffOut = Math.abs(diffMinutes(endISO, dateStr, endTime))
    const needsReason = diffIn > REASON_REQUIRED_DIFF_MINUTES || diffOut > REASON_REQUIRED_DIFF_MINUTES
    if (needsReason && !manualReason.trim()) {
      alert(`Please provide a reason when your times differ from the scheduled shift by more than ${REASON_REQUIRED_DIFF_MINUTES} minutes.`)
      return
    }
    setProcessing(true)
    try {
      const result = await submitManualTimeEntry({
        rota_shift_id: shiftId,
        team_member_id: teamMemberId,
        requested_start: startISO,
        requested_end: endISO,
        reason: manualReason.trim() || undefined,
      })
      if (result.success) {
        setSubmitSuccess(true)
        setSuccessMode('manual')
        if (typeof console !== 'undefined' && console.log) {
          console.log('[Notification] Worker submitted time for approval', { record_id: result.record_id, approval_id: result.approval_id })
        }
        try {
          await fetch('/api/notifications/send-time', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'time_submitted', recordId: result.record_id, shiftId }),
          })
        } catch (_) { /* ignore */ }
      } else {
        alert(result.error ?? 'Submission failed')
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Submission failed')
    } finally {
      setProcessing(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-600">Loading...</div>
      </div>
    )
  }

  if (loadError || !shift || !allocation) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="bg-white rounded-xl p-8 shadow-lg max-w-md w-full text-center">
          <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold mb-2">Cannot load shift</h1>
          <p className="text-gray-600 mb-6">{loadError ?? 'Unknown error'}</p>
          <Link href="/employee/dashboard" className="inline-block px-6 py-3 bg-indigo-600 text-white rounded-lg font-medium">
            Back to Dashboard
          </Link>
        </div>
      </div>
    )
  }

  const manualStatus = timekeeping?.manual_entry_status as string | undefined
  const role = shift?.role as { name?: string } | undefined
  const venue = shift?.venue as { name?: string } | undefined
  const scheduledStart = String(shift?.start_time ?? '').slice(0, 5)
  const scheduledEnd = String(shift?.end_time ?? '').slice(0, 5)
  const alreadyClockedIn = timekeeping?.clock_in != null && timekeeping?.clock_out == null
  const hasPending = manualStatus === 'pending'
  const clockInTime = timekeeping?.clock_in != null
    ? new Date(String(timekeeping.clock_in)).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : null

  const shiftDateStr = String(shift?.shift_date ?? '')
  const todayStr = todayDateString()
  const isShiftFuture = shiftDateStr && todayStr && shiftDateStr > todayStr
  const isShiftPast = shiftDateStr && todayStr && shiftDateStr < todayStr
  const isShiftToday = shiftDateStr === todayStr
  const sForTime = shift as { shift_date?: string; start_time?: string; end_time?: string } | undefined
  const endTimeOnly = String(sForTime?.end_time ?? '23:59').slice(0, 5)
  const shiftEndLocal = shiftDateStr && endTimeOnly ? new Date(`${shiftDateStr}T${endTimeOnly}:00`) : null
  const shiftEndedToday = isShiftToday && shiftEndLocal != null && new Date() > shiftEndLocal
  const autoClockInAllowed = isShiftToday && !shiftEndedToday && !alreadyClockedIn
  const manualEntryAllowed = !isShiftFuture
  const shiftDateFormatted = shiftDateStr
    ? new Date(shiftDateStr + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : ''

  const s = shift as { shift_date?: string; start_time?: string; end_time?: string } | undefined
  const dateStr = String(s?.shift_date ?? manualStartDate)
  const startTime = String(s?.start_time ?? '00:00').slice(0, 5)
  const endTime = String(s?.end_time ?? '23:59').slice(0, 5)
  const startISO = toISOInLocalTZ(manualStartDate, manualStartTime)
  const endISO = toISOInLocalTZ(manualEndDate, manualEndTime)
  const diffIn = startISO && dateStr ? Math.abs(diffMinutes(startISO, dateStr, startTime)) : 0
  const diffOut = endISO && dateStr ? Math.abs(diffMinutes(endISO, dateStr, endTime)) : 0
  const showWarning = (diffIn > REASON_REQUIRED_DIFF_MINUTES || diffOut > REASON_REQUIRED_DIFF_MINUTES) && diffIn <= 999 && diffOut <= 999
  const manualSubmitEnabled = !hasPending && manualStatus !== 'approved'
  const manualButtonLabel = alreadyClockedIn ? 'Submit correction request' : 'Submit for approval'
  const hasManualTimes = !!(manualStartDate && manualStartTime && manualEndDate && manualEndTime)
  const startISOForValidation = toISOInLocalTZ(manualStartDate, manualStartTime)
  const endISOForValidation = toISOInLocalTZ(manualEndDate, manualEndTime)
  const validationInvalid = hasManualTimes && startISOForValidation && endISOForValidation && new Date(startISOForValidation) >= new Date(endISOForValidation)
  const validationMessage = validationInvalid ? 'Start time must be before end time.' : null

  if (typeof console !== 'undefined' && console.log) {
    console.log('[Dock] Rendering auto option, enabled:', !alreadyClockedIn)
    console.log('[Dock] Rendering manual option, values:', { manualStartDate, manualStartTime, manualEndDate, manualEndTime, showManualEntry })
    console.log('[Dock] Shift status:', { manualStatus, alreadyClockedIn, hasPending })
  }

  if (submitSuccess && successMode === 'manual') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="bg-white rounded-xl p-8 shadow-lg max-w-md w-full text-center">
          <FileCheck className="w-16 h-16 text-green-600 mx-auto mb-4" />
          <h1 className="text-xl font-bold mb-2">Submitted for approval</h1>
          <p className="text-gray-600 mb-6">Your manager will review your times. You will be notified when they are approved or if changes are needed.</p>
          <Link href="/employee/dashboard" className="inline-block px-6 py-3 bg-indigo-600 text-white rounded-lg font-medium">
            Back to Dashboard
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-lg mx-auto p-6">
        <div className="bg-white rounded-xl shadow-lg overflow-visible">
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-6">
            <div className="flex items-center gap-3">
              <Clock className="w-8 h-8" />
              <div>
                <h1 className="text-xl font-bold">Clock In / Time Entry</h1>
                <p className="text-indigo-100 text-sm">
                  {shift?.shift_date ? new Date(String(shift.shift_date)).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }) : ''}
                </p>
              </div>
            </div>
          </div>
          <div className="p-6 space-y-6">
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm font-medium text-gray-700 mb-1">Scheduled time</p>
              <p className="text-lg font-semibold text-gray-900">{scheduledStart} – {scheduledEnd}</p>
              <p className="text-sm text-gray-500 mt-1">{String(role?.name ?? '')} • {String(venue?.name ?? '')}</p>
            </div>

            {manualStatus && (
              <div className={`rounded-lg p-3 text-sm font-medium ${
                manualStatus === 'pending' ? 'bg-amber-50 text-amber-800' :
                manualStatus === 'approved' ? 'bg-green-50 text-green-800' :
                manualStatus === 'rejected' ? 'bg-red-50 text-red-800' :
                manualStatus === 'auto_clocked' ? 'bg-green-50 text-green-800' :
                'bg-blue-50 text-blue-800'
              }`}>
                Status: {manualStatus === 'auto_clocked' ? 'Clocked in' : manualStatus.charAt(0).toUpperCase() + manualStatus.slice(1)}
              </div>
            )}

            {/* Future shift: no clock-in, show availability message */}
            {isShiftFuture && (
              <div className="rounded-lg p-4 bg-amber-50 border border-amber-200 text-amber-900">
                <p className="font-medium">Upcoming shift – available on {shiftDateFormatted}</p>
                <p className="text-sm mt-1">You can only clock in on the day of your shift ({shiftDateFormatted}). Cannot clock in for future shifts.</p>
              </div>
            )}

            {/* Card 1: Quick Clock In - hidden for future; disabled when not allowed */}
            {!isShiftFuture && (
              <div className="border border-gray-200 rounded-lg p-4 bg-white relative z-10">
                <h2 className="font-semibold text-gray-900 mb-1">Quick Clock In</h2>
                <p className="text-sm text-gray-600 mb-3">Record current time automatically.</p>
                {!autoClockInAllowed && !alreadyClockedIn && isShiftPast && (
                  <p className="text-sm text-amber-700 mb-3">Cannot clock in for past shifts. Use manual entry below to submit your actual times for approval.</p>
                )}
                {!autoClockInAllowed && !alreadyClockedIn && isShiftToday && shiftEndedToday && (
                  <p className="text-sm text-amber-700 mb-3">Shift already completed. Use manual entry below to submit correction.</p>
                )}
                {alreadyClockedIn && clockInTime && (
                  <p className="text-sm text-amber-700 mb-3">Already clocked in at {clockInTime}. Submit manual adjustment below if needed.</p>
                )}
                <button
                  type="button"
                  onClick={handleClockInNow}
                  disabled={processing || alreadyClockedIn || !autoClockInAllowed}
                  className="w-full px-6 py-3 bg-amber-500 text-white rounded-lg font-medium hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {processing ? 'Clocking in...' : alreadyClockedIn ? 'Clock In Now (already clocked in)' : !autoClockInAllowed ? 'Clock In Now (not available)' : 'Clock In Now'}
                </button>
              </div>
            )}

            {/* Card 2: Manual Time Entry - hidden for future; visible for today and past */}
            {showManualEntry && manualEntryAllowed && (
              <div className="border border-gray-200 rounded-lg p-4 bg-white relative z-10">
                <h2 className="font-semibold text-gray-900 mb-1">Manual Time Entry</h2>
                <p className="text-sm text-gray-600 mb-4">Enter your actual start and end times.</p>
                {isShiftPast && (
                  <p className="text-sm text-amber-700 mb-3">Missed clock-in? Submit your actual times for approval.</p>
                )}
                {isShiftToday && shiftEndedToday && !isShiftPast && (
                  <p className="text-sm text-amber-700 mb-3">Shift ended. Submit manual time for manager approval.</p>
                )}
                {hasPending && (
                  <p className="text-sm text-amber-700 mb-3">Pending approval submitted. Waiting for manager review.</p>
                )}
                {alreadyClockedIn && !hasPending && (
                  <p className="text-sm text-indigo-700 mb-3">Submit correction request if your recorded time should be different.</p>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start time *</label>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="date"
                      value={manualStartDate}
                      onChange={(e) => setManualStartDate(e.target.value)}
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      aria-label="Manual start date"
                    />
                    <input
                      type="time"
                      value={manualStartTime}
                      onChange={(e) => setManualStartTime(e.target.value)}
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      aria-label="Manual start time"
                    />
                  </div>
                </div>
                <div className="mt-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">End time *</label>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="date"
                      value={manualEndDate}
                      onChange={(e) => setManualEndDate(e.target.value)}
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      aria-label="Manual end date"
                    />
                    <input
                      type="time"
                      value={manualEndTime}
                      onChange={(e) => setManualEndTime(e.target.value)}
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      aria-label="Manual end time"
                    />
                  </div>
                </div>
                <div className="mt-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Reason (required if &gt; {REASON_REQUIRED_DIFF_MINUTES} min from scheduled)</label>
                  <textarea
                    value={manualReason}
                    onChange={(e) => setManualReason(e.target.value)}
                    placeholder="e.g. Traffic, stayed to help with closing"
                    rows={3}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                {showWarning && (
                  <p className="mt-2 text-amber-700 text-sm font-medium">Your times differ from scheduled by more than {REASON_REQUIRED_DIFF_MINUTES} minutes. Please add a reason above.</p>
                )}
                {validationMessage && (
                  <p className="mt-2 text-red-600 text-sm font-medium" role="alert">{validationMessage}</p>
                )}
                {manualSubmitEnabled && (
                  <button
                    type="button"
                    onClick={handleSubmitForApproval}
                    disabled={processing || !manualStartDate || !manualStartTime || !manualEndDate || !manualEndTime || validationInvalid}
                    className="mt-4 w-full px-6 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {processing ? 'Submitting...' : manualButtonLabel}
                  </button>
                )}
              </div>
            )}

            <Link href="/employee/dashboard" className="block w-full text-center py-3 text-gray-600 hover:text-gray-900 text-sm font-medium">
              Back to Dashboard
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function DockPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen text-gray-600">Loading...</div>}>
      <DockContent />
    </Suspense>
  )
}
