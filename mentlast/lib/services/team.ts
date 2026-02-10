import { supabase } from '@/lib/supabase'
import type { TeamMember } from '@/lib/types'

export async function inviteEmployee(data: {
  organisation_id: string
  email: string
  full_name: string
  employment_type: 'full_time' | 'part_time'
  primary_venue_id: string
  role_ids: string[]
  venue_ids: string[]
  organisation_name?: string
}) {
  const payload = {
    email: data.email,
    fullName: data.full_name,
    orgId: data.organisation_id,
    orgName: data.organisation_name,
    role: 'employee' as const,
    venueIds: data.venue_ids ?? [],
    role_ids: data.role_ids,
    primary_venue_id: data.primary_venue_id,
    employment_type: data.employment_type ?? 'part_time',
  }
  const response = await fetch('/api/invite', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error ?? 'Failed to send invite')
  }
  const result = (await response.json()) as {
    success: boolean
    teamMember: TeamMember & { invite_code?: string }
    message: string
    manualLink?: string
  }
  return {
    teamMember: result.teamMember as TeamMember,
    invite_code: result.teamMember?.invite_code ?? '',
    message: result.message,
    manualLink: result.manualLink,
  }
}

export async function inviteManager(data: {
  organisation_id: string
  email: string
  full_name: string
  organisation_name?: string
}) {
  const payload = {
    email: data.email,
    fullName: data.full_name,
    orgId: data.organisation_id,
    orgName: data.organisation_name,
    role: 'manager' as const,
    venueIds: [] as string[],
  }
  const response = await fetch('/api/invite', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error ?? 'Failed to send invite')
  }
  const result = (await response.json()) as {
    success: boolean
    teamMember: TeamMember & { invite_code?: string }
    message: string
    manualLink?: string
  }
  return {
    teamMember: result.teamMember as TeamMember,
    invite_code: result.teamMember?.invite_code ?? '',
    message: result.message,
    manualLink: result.manualLink,
  }
}

export async function getTeamMembers(organisationId: string) {
  const { data, error } = await supabase
    .from('team_members')
    .select(`
      *,
      profile:profiles(full_name, email, worker_status),
      roles:team_member_roles(
        role:roles(*)
      ),
      primary_venue:venues(*)
    `)
    .eq('organisation_id', organisationId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return data as Record<string, unknown>[]
}

export async function acceptInvite(inviteCode: string, userId: string) {
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

  if ((teamMember as TeamMember).member_type === 'employee') {
    await supabase
      .from('profiles')
      .update({ has_employee_profile: true })
      .eq('id', userId)
  }

  return teamMember as TeamMember
}
