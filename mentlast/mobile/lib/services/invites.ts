import { supabase } from '../supabase'
import type { ShiftInviteRow } from '../types'

export async function getPendingInvites(userId: string): Promise<ShiftInviteRow[]> {
  const { data: tm, error: tmError } = await supabase
    .from('team_members')
    .select('id')
    .eq('user_id', userId)

  if (tmError) throw new Error(tmError.message)
  if (!tm || tm.length === 0) return []

  const teamMemberIds = tm.map((t) => t.id)

  const { data, error } = await supabase
    .from('shift_invites')
    .select(`
      *,
      shift:rota_shifts(
        id,
        shift_date,
        start_time,
        end_time,
        venue:venues(id, name, address),
        role:roles(id, name, colour)
      )
    `)
    .in('team_member_id', teamMemberIds)
    .eq('status', 'pending')
    .order('invited_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []) as ShiftInviteRow[]
}

export async function acceptShiftInvite(inviteId: string, teamMemberId: string): Promise<unknown> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: rpcResult, error: rpcError } = await supabase.rpc('accept_shift_invite_atomic', {
    p_invite_id: inviteId,
    p_team_member_id: teamMemberId,
  })

  if (rpcError) throw new Error(rpcError.message)
  return rpcResult as unknown
}

export async function declineShiftInvite(inviteId: string): Promise<void> {
  const { error } = await supabase
    .from('shift_invites')
    .update({
      status: 'declined',
      responded_at: new Date().toISOString(),
    })
    .eq('id', inviteId)

  if (error) throw new Error(error.message)
}
