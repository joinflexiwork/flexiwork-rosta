'use server'

import { getUpcomingShiftsForTeamMember, getAllShiftsForTeamMember } from '@/lib/services/shifts'
import type { WorkerShiftRow } from '@/lib/services/shifts'

export type TeamMemberShiftsResult = {
  shifts: { shift_date: string; start_time: string; end_time: string; venue_name: string; role_name: string }[] | null
  error: string | null
}

export type WorkerShiftsDetailResult = {
  shifts: WorkerShiftRow[] | null
  error: string | null
}

/**
 * Server action: get upcoming shifts for a team member.
 * Returns { shifts, error: null } or { shifts: null, error: string }.
 */
export async function getTeamMemberShifts(
  teamMemberId: string,
  organisationId: string
): Promise<TeamMemberShiftsResult> {
  try {
    const shifts = await getUpcomingShiftsForTeamMember(teamMemberId, organisationId)
    return { shifts, error: null }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to load shifts'
    return { shifts: null, error: message }
  }
}

/**
 * Server action: get all shifts for a worker (detail page), with status, ordered by date DESC.
 */
export async function getWorkerShiftsForDetail(
  teamMemberId: string,
  organisationId: string
): Promise<WorkerShiftsDetailResult> {
  try {
    const shifts = await getAllShiftsForTeamMember(teamMemberId, organisationId)
    return { shifts, error: null }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to load shifts'
    return { shifts: null, error: message }
  }
}
