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
      primary_venue:venues(*),
      venues:team_member_venues(
        venue:venues(id, name)
      )
    `)
    .eq('organisation_id', organisationId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return data as Record<string, unknown>[]
}

/** Get the current user's team member record with roles, rating, etc. (for employee dashboard). */
export async function getMyTeamMemberWithRoles(userId: string): Promise<Record<string, unknown> | null> {
  const { data: row, error } = await supabase
    .from('team_members')
    .select('id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle()
  if (error || !row) return null
  return getTeamMemberWithRoles((row as { id: string }).id)
}

/** Get a single team member with roles, profile, primary_venue, assigned venues and recent shifts (last 5 allocations). */
export async function getTeamMemberWithRoles(memberId: string): Promise<Record<string, unknown> | null> {
  const { data: member, error: memberErr } = await supabase
    .from('team_members')
    .select(`
      *,
      profile:profiles(full_name, email, worker_status),
      roles:team_member_roles(
        id,
        role_id,
        role:roles(id, name, colour, description)
      ),
      primary_venue:venues(id, name, address),
      venues:team_member_venues(
        venue_id,
        venue:venues(id, name, address)
      )
    `)
    .eq('id', memberId)
    .single()

  if (memberErr || !member) return null

  const { data: recentAllocations } = await supabase
    .from('shift_allocations')
    .select(`
      id,
      rota_shift_id,
      status,
      shift:rota_shifts(
        id,
        shift_date,
        start_time,
        end_time,
        venue:venues(id, name),
        role:roles(id, name)
      )
    `)
    .eq('team_member_id', memberId)
    .order('allocated_at', { ascending: false })
    .limit(5)

  return {
    ...member,
    recent_shifts: recentAllocations ?? [],
  } as Record<string, unknown>
}

/** Update team member profile: full_name (team_members for pending), primary_venue_id, rating, status, role_ids, venue_ids. */
export async function updateTeamMemberProfile(
  memberId: string,
  data: {
    full_name?: string | null
    primary_venue_id?: string | null
    rating?: number | null
    status?: string
    role_ids?: string[]
    venue_ids?: string[]
  }
): Promise<void> {
  const updates: Record<string, unknown> = {}
  if (data.full_name !== undefined) updates.full_name = data.full_name?.trim() || null
  if (data.primary_venue_id !== undefined) updates.primary_venue_id = data.primary_venue_id
  if (data.rating !== undefined) updates.rating = data.rating
  if (data.status !== undefined) updates.status = data.status

  if (Object.keys(updates).length > 0) {
    const { error: updateErr } = await supabase
      .from('team_members')
      .update(updates)
      .eq('id', memberId)
    if (updateErr) throw new Error(updateErr.message)
  }

  if (data.role_ids !== undefined) {
    await supabase.from('team_member_roles').delete().eq('team_member_id', memberId)
    if (data.role_ids.length > 0) {
      const rows = data.role_ids.map((role_id, idx) => ({
        team_member_id: memberId,
        role_id,
        is_primary: idx === 0,
      }))
      const { error: insertErr } = await supabase.from('team_member_roles').insert(rows)
      if (insertErr) throw new Error(insertErr.message)
    }
  }

  if (data.venue_ids !== undefined) {
    const primaryId = data.primary_venue_id ?? (data.venue_ids.length > 0 ? data.venue_ids[0] : null)
    await supabase.from('team_member_venues').delete().eq('team_member_id', memberId)
    if (data.venue_ids.length > 0) {
      const rows = data.venue_ids.map((venue_id) => ({
        team_member_id: memberId,
        venue_id,
        is_primary: venue_id === primaryId,
      }))
      const { error: insertErr } = await supabase.from('team_member_venues').insert(rows)
      if (insertErr) throw new Error(insertErr.message)
    }
  }
}

/** Delete a team member. Fails if active and has assigned shifts. Pending members can be deleted (cancels invite). */
export async function deleteTeamMember(memberId: string): Promise<void> {
  const { data: member, error: fetchErr } = await supabase
    .from('team_members')
    .select('id, status, organisation_id')
    .eq('id', memberId)
    .single()

  if (fetchErr || !member) throw new Error('Team member not found')

  if ((member as { status: string }).status === 'active') {
    const { data: allocations, error: allocErr } = await supabase
      .from('shift_allocations')
      .select('id')
      .eq('team_member_id', memberId)
      .in('status', ['allocated', 'confirmed', 'in_progress'])

    if (!allocErr && allocations && allocations.length > 0) {
      throw new Error('Member has assigned shifts. Reassign or delete shifts first.')
    }
  }

  const { error: deleteErr } = await supabase
    .from('team_members')
    .delete()
    .eq('id', memberId)

  if (deleteErr) throw new Error(deleteErr.message)
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
