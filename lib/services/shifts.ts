import { supabase } from '@/lib/supabase'

/** Statuses that count as "upcoming" (not completed/cancelled). */
const UPCOMING_STATUSES = ['allocated', 'confirmed', 'in_progress']

export type UpcomingShiftRow = {
  shift_date: string
  start_time: string
  end_time: string
  venue_name: string
  role_name: string
  rota_shift_id?: string
}

/**
 * Get upcoming shifts for a team member (today onwards).
 * Uses shift_allocations JOIN rota_shifts; filters by team_member_id, future dates, active status.
 * Returns at most 5 shifts, sorted by date then time.
 * On error returns [] and logs to console.
 */
export async function getUpcomingShiftsForTeamMember(
  teamMemberId: string,
  _organisationId: string
): Promise<UpcomingShiftRow[]> {
  const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD

  try {
    const { data, error } = await supabase
      .from('shift_allocations')
      .select(
        `
        rota_shift_id,
        shift:rota_shifts(
          shift_date,
          start_time,
          end_time,
          venue:venues(name),
          role:roles(name)
        )
      `
      )
      .eq('team_member_id', teamMemberId)
      .in('status', UPCOMING_STATUSES)
      .limit(30)

    if (error) {
      console.warn('[getUpcomingShiftsForTeamMember] query error:', error.message, error.code)
      return []
    }

    const rows = (data ?? []) as {
      rota_shift_id?: string
      shift?: {
        shift_date: string
        start_time: string
        end_time: string
        venue?: { name?: string } | null
        role?: { name?: string } | null
      } | null
    }[]

    const out: UpcomingShiftRow[] = []
    for (const row of rows) {
      const s = row.shift
      if (!s || !s.shift_date) continue
      if (s.shift_date < today) continue
      out.push({
        shift_date: s.shift_date,
        start_time: s.start_time ?? '',
        end_time: s.end_time ?? '',
        venue_name: s.venue?.name ?? '—',
        role_name: s.role?.name ?? '—',
        rota_shift_id: row.rota_shift_id,
      })
    }

    out.sort((a, b) => {
      if (a.shift_date !== b.shift_date) return a.shift_date.localeCompare(b.shift_date)
      return (a.start_time || '').localeCompare(b.start_time || '')
    })

    return out.slice(0, 5)
  } catch (e) {
    console.warn('[getUpcomingShiftsForTeamMember] exception:', e)
    return []
  }
}

/**
 * All shifts for worker detail page (with status), ordered by shift_date DESC.
 */
export type WorkerShiftRow = UpcomingShiftRow & { status?: string }

/**
 * Get all shifts for a team member (past and future), for the worker shifts detail page.
 * Returns shift_date, start_time, end_time, venue_name, role_name, status, ordered by shift_date DESC.
 */
export async function getAllShiftsForTeamMember(
  teamMemberId: string,
  _organisationId: string
): Promise<WorkerShiftRow[]> {
  try {
    const { data, error } = await supabase
      .from('shift_allocations')
      .select(
        `
        status,
        shift:rota_shifts(
          shift_date,
          start_time,
          end_time,
          venue:venues(name),
          role:roles(name)
        )
      `
      )
      .eq('team_member_id', teamMemberId)
      .order('created_at', { ascending: false })

    if (error) {
      console.warn('[getAllShiftsForTeamMember] query error:', error.message, error.code)
      return []
    }

    const rows = (data ?? []) as {
      status?: string
      shift?: {
        shift_date: string
        start_time: string
        end_time: string
        venue?: { name?: string } | null
        role?: { name?: string } | null
      } | null
    }[]

    const out: WorkerShiftRow[] = []
    for (const row of rows) {
      const s = row.shift
      if (!s || !s.shift_date) continue
      out.push({
        shift_date: s.shift_date,
        start_time: s.start_time ?? '',
        end_time: s.end_time ?? '',
        venue_name: s.venue?.name ?? '—',
        role_name: s.role?.name ?? '—',
        status: row.status ?? '—',
      })
    }

    out.sort((a, b) => b.shift_date.localeCompare(a.shift_date) || (b.start_time || '').localeCompare(a.start_time || ''))
    return out
  } catch (e) {
    console.warn('[getAllShiftsForTeamMember] exception:', e)
    return []
  }
}

export type ShiftForWIW = UpcomingShiftRow & { id?: string }

/** Statuses to include in WIW (past + upcoming: allocated, confirmed, in_progress, completed). */
const WIW_STATUSES = ['allocated', 'confirmed', 'in_progress', 'completed']

/**
 * Get shifts for "Who is Working" view: past 7 days + next 14 days for a team member.
 * Same shape as getUpcomingShiftsForTeamMember but no limit and date range filter.
 */
export async function getShiftsForWIW(teamMemberId: string): Promise<ShiftForWIW[]> {
  const today = new Date()
  const fromDate = new Date(today)
  fromDate.setDate(fromDate.getDate() - 7)
  const toDate = new Date(today)
  toDate.setDate(toDate.getDate() + 14)
  const fromStr = fromDate.toISOString().slice(0, 10)
  const toStr = toDate.toISOString().slice(0, 10)

  try {
    const { data, error } = await supabase
      .from('shift_allocations')
      .select(
        `
        id,
        rota_shift_id,
        status,
        shift:rota_shifts(
          shift_date,
          start_time,
          end_time,
          venue:venues(name),
          role:roles(name)
        )
      `
      )
      .eq('team_member_id', teamMemberId)
      .in('status', WIW_STATUSES)
      .limit(100)

    if (error) {
      console.warn('[getShiftsForWIW] query error:', error.message, error.code)
      return []
    }

    const rows = (data ?? []) as {
      id?: string
      rota_shift_id?: string
      shift?: {
        shift_date: string
        start_time: string
        end_time: string
        venue?: { name?: string } | null
        role?: { name?: string } | null
      } | null
    }[]

    const out: ShiftForWIW[] = []
    for (const row of rows) {
      const s = row.shift
      if (!s || !s.shift_date) continue
      if (s.shift_date < fromStr || s.shift_date > toStr) continue
      out.push({
        id: row.id,
        shift_date: s.shift_date,
        start_time: s.start_time ?? '',
        end_time: s.end_time ?? '',
        venue_name: s.venue?.name ?? '—',
        role_name: s.role?.name ?? '—',
        rota_shift_id: row.rota_shift_id,
      })
    }

    out.sort((a, b) => {
      if (a.shift_date !== b.shift_date) return a.shift_date.localeCompare(b.shift_date)
      return (a.start_time || '').localeCompare(b.start_time || '')
    })

    return out
  } catch (e) {
    console.warn('[getShiftsForWIW] exception:', e)
    return []
  }
}
