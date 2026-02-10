import { supabase } from '@/lib/supabase'
import type { ShiftInvite } from '@/lib/types'

function generateShiftInviteCode(): string {
  return (Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10)).toUpperCase()
}

export async function inviteEmployeesToShift(data: {
  rota_shift_id: string
  team_member_ids: string[]
}) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
  const invites = data.team_member_ids.map((team_member_id) => ({
    rota_shift_id: data.rota_shift_id,
    team_member_id,
    invited_by: user.id,
    status: 'pending',
    expires_at: expiresAt,
    invite_code: generateShiftInviteCode(),
  }))

  const { data: createdInvites, error } = await supabase
    .from('shift_invites')
    .insert(invites)
    .select()

  if (error) throw new Error(error.message)
  return createdInvites as (ShiftInvite & { invite_code?: string })[]
}

export async function acceptShiftInvite(inviteId: string, teamMemberId: string) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: rpcResult, error: rpcError } = await supabase.rpc('accept_shift_invite_atomic', {
    p_invite_id: inviteId,
    p_team_member_id: teamMemberId,
  })

  if (rpcError) throw new Error(rpcError.message)
  return rpcResult as unknown
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

export async function getMyPendingInvites(userId: string) {
  const { data: tm } = await supabase
    .from('team_members')
    .select('id')
    .eq('user_id', userId)

  if (!tm || tm.length === 0) return []
  const teamMemberIds = tm.map((t) => t.id)

  const { data, error } = await supabase
    .from('shift_invites')
    .select(`
      *,
      shift:rota_shifts(
        *,
        venue:venues(id, name, address),
        role:roles(id, name, colour)
      )
    `)
    .in('team_member_id', teamMemberIds)
    .eq('status', 'pending')
    .order('invited_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data || []) as Record<string, unknown>[]
}
