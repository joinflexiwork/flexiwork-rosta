import { supabase } from '@/lib/supabase'
import type { ShiftInvite } from '@/lib/types'

/** Create a single shift invite (in-app notification). Uses same API as bulk invite; RLS is enforced on API or client. */
export async function createShiftInvite(rotaShiftId: string, teamMemberId: string): Promise<ShiftInvite & { invite_code?: string }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const res = await fetch('/api/shift-invites', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      rota_shift_id: rotaShiftId,
      team_member_ids: [teamMemberId],
      invited_by: user.id,
    }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((json.error as string) || 'Failed to send invitation')
  }
  const created = Array.isArray(json) ? json[0] : json
  if (!created) throw new Error('Failed to send invitation')
  return created as ShiftInvite & { invite_code?: string }
}

/** Get pending invites for a shift (for display on shift card/modal). */
export async function getPendingInvitesForShift(rotaShiftId: string): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase
    .from('shift_invites')
    .select(`
      id,
      team_member_id,
      invited_at,
      status,
      team_member:team_members(
        id,
        profile:profiles(full_name)
      )
    `)
    .eq('rota_shift_id', rotaShiftId)
    .eq('status', 'pending')
    .order('invited_at', { ascending: false })

  if (error) {
    const { data: fallback } = await supabase
      .from('shift_invites')
      .select('id, team_member_id, invited_at, status')
      .eq('rota_shift_id', rotaShiftId)
      .eq('status', 'pending')
      .order('invited_at', { ascending: false })
    return (fallback || []) as Record<string, unknown>[]
  }
  return (data || []) as Record<string, unknown>[]
}

/** Cancel a shift invite (delete) before the worker accepts. */
export async function cancelShiftInvite(inviteId: string): Promise<void> {
  const { error } = await supabase.from('shift_invites').delete().eq('id', inviteId)
  if (error) throw new Error(error.message)
}

/** Get team member ids that are already allocated to this shift. */
export async function getAllocatedTeamMemberIdsForShift(rotaShiftId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('shift_allocations')
    .select('team_member_id')
    .eq('rota_shift_id', rotaShiftId)
  if (error) return []
  return (data || []).map((r) => r.team_member_id)
}

/** Get team member ids that already have a pending invite for this shift. */
export async function getPendingInviteTeamMemberIdsForShift(rotaShiftId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('shift_invites')
    .select('team_member_id')
    .eq('rota_shift_id', rotaShiftId)
    .eq('status', 'pending')
  if (error) return []
  return (data || []).map((r) => r.team_member_id)
}

/** Get workers available to be invited to this shift (active, not allocated, not already invited). */
export async function getAvailableWorkersForShift(
  rotaShiftId: string,
  organisationId: string,
  teamMembers: Record<string, unknown>[],
): Promise<Record<string, unknown>[]> {
  const [allocatedIds, invitedIds] = await Promise.all([
    getAllocatedTeamMemberIdsForShift(rotaShiftId),
    getPendingInviteTeamMemberIdsForShift(rotaShiftId),
  ])
  const excluded = new Set([...allocatedIds, ...invitedIds])
  return teamMembers.filter((m) => m.status === 'active' && !excluded.has(String(m.id)))
}

export async function inviteEmployeesToShift(data: {
  rota_shift_id: string
  team_member_ids: string[]
}) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const res = await fetch('/api/shift-invites', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      rota_shift_id: data.rota_shift_id,
      team_member_ids: data.team_member_ids,
      invited_by: user.id,
    }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((json.error as string) || 'Failed to send invites')
  }
  return (json as (ShiftInvite & { invite_code?: string })[]) ?? []
}

export async function acceptShiftInvite(inviteId: string, teamMemberId: string) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: rpcResult, error: rpcError } = await supabase.rpc('accept_shift_invite_atomic', {
    p_invite_id: inviteId,
    p_team_member_id: teamMemberId,
  })

  if (rpcError) throw new Error(rpcError.message)
  const result = rpcResult as { success: boolean; error?: string; allocation?: unknown } | null
  if (!result || result.success !== true) throw new Error(result?.error ?? 'Failed to accept invite')
  return result.allocation ?? result
}

export async function declineShiftInvite(inviteId: string) {
  const { error } = await supabase
    .from('shift_invites')
    .update({
      status: 'declined',
      responded_at: new Date().toISOString(),
    })
    .eq('id', inviteId)

  if (error) throw new Error(error.message)
}

/** Get pending shift invites for the current user (filtered by expires_at when set). */
export async function getMyPendingInvites(userId: string) {
  const { data: tm } = await supabase
    .from('team_members')
    .select('id')
    .eq('user_id', userId)

  if (!tm || tm.length === 0) return []
  const teamMemberIds = tm.map((t) => t.id)

  const now = new Date().toISOString()
  const selectWithInviter = `
    *,
    shift:rota_shifts(
      *,
      venue:venues(id, name, address),
      role:roles(id, name, colour)
    ),
    inviter:profiles!invited_by(full_name)
  `
  const selectWithoutInviter = `
    *,
    shift:rota_shifts(
      *,
      venue:venues(id, name, address),
      role:roles(id, name, colour)
    )
  `
  let data: Record<string, unknown>[] | null = null
  let error: { message: string } | null = null

  const { data: d1, error: e1 } = await supabase
    .from('shift_invites')
    .select(selectWithInviter)
    .in('team_member_id', teamMemberIds)
    .eq('status', 'pending')
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .order('invited_at', { ascending: false })

  if (e1) {
    const { data: d2, error: e2 } = await supabase
      .from('shift_invites')
      .select(selectWithoutInviter)
      .in('team_member_id', teamMemberIds)
      .eq('status', 'pending')
      .order('invited_at', { ascending: false })
    data = d2
    error = e2
  } else {
    data = d1
  }

  if (error) throw new Error(error.message)
  const list = (data || []) as Record<string, unknown>[]
  return list.filter((row) => {
    const exp = row.expires_at as string | null | undefined
    if (exp == null) return true
    return new Date(exp) > new Date()
  })
}

/** Pull available workers from same org / cross-branch (for unfilled shifts). */
export async function pullAvailableWorkers(params: {
  venueId: string
  roleId?: string
  shiftDate?: string
  shiftId?: string
}): Promise<{ team_member_id: string; full_name: string | null; email: string | null; employment_type: string | null }[]> {
  const { data, error } = await supabase.rpc('pull_available_workers', {
    p_venue_id: params.venueId,
    p_role_id: params.roleId ?? null,
    p_shift_date: params.shiftDate ?? null,
    p_shift_id: params.shiftId ?? null,
  })
  if (error) throw new Error(error.message)
  return (data ?? []) as { team_member_id: string; full_name: string | null; email: string | null; employment_type: string | null }[]
}

/** Get count of pending shift invites for the current user (for notification badge). */
export async function getPendingInvitesCount(userId: string): Promise<number> {
  const { data: tm } = await supabase
    .from('team_members')
    .select('id')
    .eq('user_id', userId)

  if (!tm || tm.length === 0) return 0
  const teamMemberIds = tm.map((t) => t.id)

  const now = new Date().toISOString()
  const { count, error } = await supabase
    .from('shift_invites')
    .select('id', { count: 'exact', head: true })
    .in('team_member_id', teamMemberIds)
    .eq('status', 'pending')
    .or(`expires_at.is.null,expires_at.gt.${now}`)

  if (error) return 0
  return count ?? 0
}
