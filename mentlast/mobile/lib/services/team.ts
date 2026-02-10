import { supabase } from '../supabase'

/**
 * Accept team invite (join organisation) by invite code after user is signed in.
 * Used when user registers with invite code or opens deep link with code.
 */
export async function acceptTeamInvite(inviteCode: string, userId: string) {
  const { data: teamMember, error } = await supabase
    .from('team_members')
    .update({
      user_id: userId,
      status: 'active',
      joined_at: new Date().toISOString(),
    })
    .eq('invite_code', inviteCode)
    .eq('status', 'pending')
    .select()
    .single()

  if (error) throw new Error(error.message)
  if (!teamMember) throw new Error('Invite not found or already used')

  const memberType = (teamMember as { member_type?: string }).member_type
  if (memberType === 'employee') {
    await supabase
      .from('profiles')
      .update({ has_employee_profile: true })
      .eq('id', userId)
  }

  return teamMember
}
