import { supabase } from '@/lib/supabase'
import type { TimekeepingRecord } from '@/lib/types'

export type ShiftForClockResult = {
  success: boolean
  team_member_id?: string
  shift?: Record<string, unknown>
  allocation?: Record<string, unknown>
  timekeeping?: Record<string, unknown> | null
  error?: string
  message?: string
}

/** Load shift + allocation + timekeeping for clock page. Uses auth.uid() server-side. */
export async function getShiftForClock(rotaShiftId: string): Promise<ShiftForClockResult> {
  const { data, error } = await supabase.rpc('get_shift_for_clock', {
    p_rota_shift_id: rotaShiftId,
  })
  if (error) throw new Error(error.message)
  const res = data as ShiftForClockResult
  return res ?? { success: false, error: 'unknown', message: 'Failed to load shift' }
}

/** Clock in via RPC (optional GPS validation and consistent approval_status). */
export async function clockInWithValidation(data: {
  rota_shift_id: string
  team_member_id: string
  location?: string
}): Promise<TimekeepingRecord> {
  const { data: result, error } = await supabase.rpc('clock_in_with_validation', {
    p_shift_id: data.rota_shift_id,
    p_team_member_id: data.team_member_id,
    p_location: data.location ?? null,
  })
  if (error) throw new Error(error.message)
  const res = result as { success: boolean; error?: string; record?: TimekeepingRecord }
  if (!res?.success || !res.record) throw new Error(res?.error ?? 'Clock-in failed')
  return res.record as TimekeepingRecord
}

/** User-friendly message for clock-in/out RPC errors */
export function getClockErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  if (/not allocated|not assigned/i.test(msg)) return 'You are not assigned to this shift'
  if (/not yet published|not open/i.test(msg)) return 'This shift is not yet published'
  if (/already clocked in/i.test(msg)) return 'You are already clocked in'
  if (/already clocked out|Shift already completed/i.test(msg)) return 'Shift already completed'
  if (/Record not found|already clocked out/i.test(msg)) return 'Record not found or already clocked out'
  return msg
}

export async function clockIn(data: {
  rota_shift_id: string
  team_member_id: string
  venue_id: string
  location?: string
}) {
  const { data: record, error } = await supabase
    .from('timekeeping_records')
    .insert({
      rota_shift_id: data.rota_shift_id,
      team_member_id: data.team_member_id,
      venue_id: data.venue_id,
      clock_in: new Date().toISOString(),
      clock_in_location: data.location,
      status: 'pending',
    })
    .select()
    .single()

  if (error) throw new Error(error.message)

  await supabase
    .from('shift_allocations')
    .update({ status: 'in_progress' })
    .eq('rota_shift_id', data.rota_shift_id)
    .eq('team_member_id', data.team_member_id)

  return record as TimekeepingRecord
}

/** Clock out via RPC: sets break_duration from break_rules, updates shift_allocation. */
export async function clockOutWithValidation(data: {
  timekeeping_record_id: string
  team_member_id: string
  location?: string
}): Promise<TimekeepingRecord> {
  const { data: result, error } = await supabase.rpc('clock_out_with_validation', {
    p_timekeeping_record_id: data.timekeeping_record_id,
    p_team_member_id: data.team_member_id,
    p_location: data.location ?? null,
  })
  if (error) throw new Error(error.message)
  const res = result as { success: boolean; error?: string; record?: TimekeepingRecord }
  if (!res?.success || !res.record) throw new Error(res?.error ?? 'Clock-out failed')
  return res.record as TimekeepingRecord
}

export async function clockOut(data: {
  timekeeping_record_id: string
  location?: string
}) {
  const { data: record, error } = await supabase
    .from('timekeeping_records')
    .update({
      clock_out: new Date().toISOString(),
      clock_out_location: data.location,
    })
    .eq('id', data.timekeeping_record_id)
    .select()
    .single()

  if (error) throw new Error(error.message)
  if (!record) throw new Error('Timekeeping record not found')

  await supabase
    .from('shift_allocations')
    .update({ status: 'completed' })
    .eq('rota_shift_id', record.rota_shift_id)
    .eq('team_member_id', record.team_member_id)

  return record as TimekeepingRecord
}

export async function getPendingTimesheets(venueId: string) {
  const { data, error } = await supabase
    .from('timekeeping_records')
    .select(`
      *,
      team_member:team_members(
        id,
        employment_type,
        profile:profiles(full_name, worker_status)
      ),
      shift:rota_shifts(
        id,
        shift_date,
        start_time,
        end_time,
        role:roles(name)
      ),
      venue:venues(id, name)
    `)
    .eq('venue_id', venueId)
    .eq('status', 'pending')
    .not('clock_out', 'is', null)
    .order('clock_out', { ascending: false })

  if (error) throw new Error(error.message)
  return (data || []) as Record<string, unknown>[]
}

export async function approveTimesheet(id: string) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data, error } = await supabase
    .from('timekeeping_records')
    .update({
      status: 'approved',
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data as TimekeepingRecord
}

export async function requestTimesheetEdit(id: string, notes: string) {
  const { data, error } = await supabase
    .from('timekeeping_records')
    .update({
      status: 'disputed',
      notes,
    })
    .eq('id', id)
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data as TimekeepingRecord
}

export async function getMyTimekeeping(userId: string) {
  const { data: tm } = await supabase
    .from('team_members')
    .select('id')
    .eq('user_id', userId)

  if (!tm || tm.length === 0) return []
  const teamMemberIds = tm.map((t) => t.id)

  const { data, error } = await supabase
    .from('timekeeping_records')
    .select(`
      *,
      shift:rota_shifts(
        shift_date,
        start_time,
        end_time,
        role:roles(name),
        venue:venues(name)
      )
    `)
    .in('team_member_id', teamMemberIds)
    .order('clock_in', { ascending: false })
    .limit(50)

  if (error) throw new Error(error.message)
  return (data || []) as Record<string, unknown>[]
}

/** Generate or update timesheet for a worker and date range (RPC). */
export async function generateTimesheet(params: {
  workerId: string
  startDate: string
  endDate: string
}): Promise<{ success: boolean; timesheet_id?: string; total_hours?: number; regular_hours?: number; overtime_hours?: number }> {
  const { data, error } = await supabase.rpc('generate_timesheet', {
    p_worker_id: params.workerId,
    p_start_date: params.startDate,
    p_end_date: params.endDate,
  })
  if (error) throw new Error(error.message)
  return (data ?? { success: false }) as { success: boolean; timesheet_id?: string; total_hours?: number; regular_hours?: number; overtime_hours?: number }
}

/** Get timesheets for current user (worker). */
export async function getMyTimesheets(teamMemberId: string): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase
    .from('timesheets')
    .select('*')
    .eq('worker_id', teamMemberId)
    .order('period_end', { ascending: false })
    .limit(24)
  if (error) throw new Error(error.message)
  return (data ?? []) as Record<string, unknown>[]
}

/** Approve a draft timesheet (period summary) via RPC. Manager only. */
export async function approveTimesheetDraft(timesheetId: string): Promise<{ success: boolean; timesheet?: Record<string, unknown>; error?: string }> {
  const { data, error } = await supabase.rpc('approve_timesheet', { p_timesheet_id: timesheetId })
  if (error) throw new Error(error.message)
  return (data ?? { success: false }) as { success: boolean; timesheet?: Record<string, unknown>; error?: string }
}

/** Submit proposed clock-in/out for manager approval (manual entry workflow). */
export async function submitTimeProposal(data: {
  rota_shift_id: string
  team_member_id: string
  clock_in: string
  clock_out: string
  reason?: string
}): Promise<{ success: boolean; record_id?: string; error?: string }> {
  const { data: result, error } = await supabase.rpc('submit_time_proposal', {
    p_shift_id: data.rota_shift_id,
    p_team_member_id: data.team_member_id,
    p_clock_in: data.clock_in,
    p_clock_out: data.clock_out,
    p_reason: data.reason ?? null,
  })
  if (error) throw new Error(error.message)
  const res = result as { success: boolean; record_id?: string; error?: string }
  return res ?? { success: false }
}

/** Manager reviews a time proposal: approve, reject, or modify. */
export async function reviewTimeProposal(data: {
  timekeeping_id: string
  action: 'approve' | 'reject' | 'modify'
  actual_clock_in?: string
  actual_clock_out?: string
  notes?: string
}): Promise<{ success: boolean; status?: string; error?: string }> {
  const { data: result, error } = await supabase.rpc('review_time_proposal', {
    p_timekeeping_id: data.timekeeping_id,
    p_action: data.action,
    p_actual_clock_in: data.actual_clock_in ?? null,
    p_actual_clock_out: data.actual_clock_out ?? null,
    p_notes: data.notes ?? null,
  })
  if (error) throw new Error(error.message)
  const res = result as { success: boolean; status?: string; error?: string }
  return res ?? { success: false }
}

/** Get pending manual time submissions for manager approval (manual_entry_status = 'pending'). */
export async function getPendingManualSubmissions(organisationId: string): Promise<Record<string, unknown>[]> {
  const { data: venueIds } = await supabase
    .from('venues')
    .select('id')
    .eq('organisation_id', organisationId)
  const ids = (venueIds ?? []).map((v) => (v as { id: string }).id)
  if (ids.length === 0) return []

  const { data, error } = await supabase
    .from('timekeeping_records')
    .select(`
      *,
      team_member:team_members(
        id,
        profile:profiles(full_name, email)
      ),
      shift:rota_shifts(
        id,
        shift_date,
        start_time,
        end_time,
        role:roles(name)
      ),
      venue:venues(id, name)
    `)
    .in('venue_id', ids)
    .eq('manual_entry_status', 'pending')
    .order('submitted_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []) as Record<string, unknown>[]
}

/** Option A: Clock In Now (auto_clocked, no approval). */
export async function clockInAuto(data: {
  rota_shift_id: string
  team_member_id: string
  location?: string
}): Promise<{ success: boolean; record?: TimekeepingRecord; error?: string }> {
  const { data: result, error } = await supabase.rpc('clock_in_auto', {
    p_shift_id: data.rota_shift_id,
    p_team_member_id: data.team_member_id,
    p_location: data.location ?? null,
  })
  if (error) throw new Error(error.message)
  const res = result as { success: boolean; record?: TimekeepingRecord; error?: string }
  return res ?? { success: false }
}

/** Submit manual start/end for approval (Option B). Creates timekeeping_record + shift_time_approvals. */
export async function submitManualTimeEntry(data: {
  rota_shift_id: string
  team_member_id: string
  requested_start: string
  requested_end: string
  reason?: string
}): Promise<{ success: boolean; record_id?: string; approval_id?: string; error?: string }> {
  const { data: result, error } = await supabase.rpc('submit_manual_time_entry', {
    p_rota_shift_id: data.rota_shift_id,
    p_team_member_id: data.team_member_id,
    p_requested_start: data.requested_start,
    p_requested_end: data.requested_end,
    p_reason: data.reason ?? null,
  })
  if (error) throw new Error(error.message)
  const res = result as { success: boolean; record_id?: string; approval_id?: string; error?: string }
  return res ?? { success: false }
}

/** Manager: approve / reject / modify a time approval. */
export async function processTimeApproval(data: {
  approval_id: string
  action: 'approve' | 'reject' | 'modify'
  actual_start?: string
  actual_end?: string
  manager_notes?: string
}): Promise<{ success: boolean; status?: string; error?: string }> {
  const { data: result, error } = await supabase.rpc('process_time_approval', {
    p_approval_id: data.approval_id,
    p_action: data.action,
    p_actual_start: data.actual_start ?? null,
    p_actual_end: data.actual_end ?? null,
    p_manager_notes: data.manager_notes ?? null,
  })
  if (error) throw new Error(error.message)
  const res = result as { success: boolean; status?: string; error?: string }
  return res ?? { success: false }
}

/** Get pending shift_time_approvals for manager dashboard (by organisation). */
export async function getPendingTimeApprovals(organisationId: string): Promise<Record<string, unknown>[]> {
  const { data: venueIds } = await supabase
    .from('venues')
    .select('id')
    .eq('organisation_id', organisationId)
  const vids = (venueIds ?? []).map((v) => (v as { id: string }).id)
  if (vids.length === 0) return []

  const { data: tkIds } = await supabase
    .from('timekeeping_records')
    .select('id')
    .in('venue_id', vids)
  const ids = (tkIds ?? []).map((r) => (r as { id: string }).id)
  if (ids.length === 0) return []

  const { data, error } = await supabase
    .from('shift_time_approvals')
    .select(`
      *,
      timekeeping_records(
        id,
        rota_shift_id,
        team_member_id,
        submitted_start_time,
        submitted_end_time,
        reason,
        manual_entry_status,
        team_member:team_members(id, profile:profiles(full_name, email)),
        shift:rota_shifts(id, shift_date, start_time, end_time, role:roles(name)),
        venue:venues(id, name)
      )
    `)
    .in('timekeeping_record_id', ids)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []) as Record<string, unknown>[]
}

/** Worker: timekeeping records in date range (for reports). Uses clock_in for range. */
export async function getMyTimekeepingByDateRange(
  userId: string,
  startDate: string,
  endDate: string
): Promise<Record<string, unknown>[]> {
  const { data: tm } = await supabase.from('team_members').select('id').eq('user_id', userId)
  if (!tm?.length) return []
  const teamMemberIds = tm.map((t) => t.id)
  const startISO = new Date(startDate + 'T00:00:00').toISOString()
  const endISO = new Date(endDate + 'T23:59:59').toISOString()
  const { data, error } = await supabase
    .from('timekeeping_records')
    .select(`
      *,
      shift:rota_shifts(
        shift_date,
        start_time,
        end_time,
        role:roles(name),
        venue:venues(name)
      )
    `)
    .in('team_member_id', teamMemberIds)
    .gte('clock_in', startISO)
    .lte('clock_in', endISO)
    .order('clock_in', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as Record<string, unknown>[]
}

/** Employer: timekeeping records by org in date range with filters. */
export async function getTimekeepingByDateRange(params: {
  organisationId: string
  startDate: string
  endDate: string
  venueId?: string
  teamMemberId?: string
  status?: string
}): Promise<Record<string, unknown>[]> {
  const { data: venueIds } = await supabase
    .from('venues')
    .select('id')
    .eq('organisation_id', params.organisationId)
  const vids = (venueIds ?? []).map((v) => (v as { id: string }).id)
  if (vids.length === 0) return []
  const startISO = new Date(params.startDate + 'T00:00:00').toISOString()
  const endISO = new Date(params.endDate + 'T23:59:59').toISOString()
  let q = supabase
    .from('timekeeping_records')
    .select(`
      *,
      team_member:team_members(id, profile:profiles(full_name, email)),
      shift:rota_shifts(shift_date, start_time, end_time, role:roles(name)),
      venue:venues(id, name)
    `)
    .in('venue_id', vids)
    .gte('clock_in', startISO)
    .lte('clock_in', endISO)
    .order('clock_in', { ascending: false })
  if (params.venueId) q = q.eq('venue_id', params.venueId)
  if (params.teamMemberId) q = q.eq('team_member_id', params.teamMemberId)
  if (params.status) q = q.eq('status', params.status)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data ?? []) as Record<string, unknown>[]
}
