import { supabase } from '@/lib/supabase'
import type { TeamMember } from '@/lib/types'
import { logAction } from '@/lib/services/auditService'

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
      profile:profiles!team_members_user_id_fkey(full_name, email, worker_status),
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

/** Get a single team member with roles, profile, primary_venue and assigned venues. (Shifts are shown in "Who is Working" via getShiftsForWIW.) */
export async function getTeamMemberWithRoles(memberId: string): Promise<Record<string, unknown> | null> {
  const { data: member, error: memberErr } = await supabase
    .from('team_members')
    .select(`
      *,
      profile:profiles!team_members_user_id_fkey(full_name, email, avatar_url, worker_status),
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

  return member as Record<string, unknown>
}

/** Update team member profile: full_name (team_members for pending), primary_venue_id, rating, status, role_ids, venue_ids, hierarchy_level. */
export async function updateTeamMemberProfile(
  memberId: string,
  data: {
    full_name?: string | null
    primary_venue_id?: string | null
    rating?: number | null
    status?: string
    role_ids?: string[]
    venue_ids?: string[]
    hierarchy_level?: string | null
  }
): Promise<void> {
  const { data: existing } = await supabase
    .from('team_members')
    .select('organisation_id, hierarchy_level, status, full_name')
    .eq('id', memberId)
    .single()
  const orgId = (existing as { organisation_id?: string } | null)?.organisation_id
  const oldLevel = (existing as { hierarchy_level?: string } | null)?.hierarchy_level
  const oldStatus = (existing as { status?: string } | null)?.status
  const oldFullName = (existing as { full_name?: string } | null)?.full_name

  const VALID_HIERARCHY_LEVELS = ['employer', 'gm', 'agm', 'shift_leader', 'worker'] as const
  const updates: Record<string, unknown> = {}
  if (data.full_name !== undefined) updates.full_name = data.full_name?.trim() || null
  if (data.primary_venue_id !== undefined) updates.primary_venue_id = data.primary_venue_id ?? null
  if (data.rating !== undefined) updates.rating = data.rating ?? null
  if (data.status !== undefined) updates.status = data.status
  if (data.hierarchy_level !== undefined && data.hierarchy_level !== null) {
    const level = String(data.hierarchy_level).toLowerCase()
    if (VALID_HIERARCHY_LEVELS.includes(level)) {
      updates.hierarchy_level = level
    }
  }

  if (Object.keys(updates).length > 0) {
    const { error: updateErr } = await supabase
      .from('team_members')
      .update(updates)
      .eq('id', memberId)
    if (updateErr) {
      const msg = `Team member update failed: ${updateErr.message}${updateErr.code ? ` (code: ${updateErr.code})` : ''}${updateErr.details ? ` [${updateErr.details}]` : ''}`
      console.error('[updateTeamMemberProfile] team_members update:', updateErr)
      throw new Error(msg)
    }
  }

  if (data.role_ids !== undefined) {
    const { error: deleteErr } = await supabase.from('team_member_roles').delete().eq('team_member_id', memberId)
    if (deleteErr) {
      console.error('[updateTeamMemberProfile] team_member_roles delete:', deleteErr)
      throw new Error(`Failed to clear roles: ${deleteErr.message}`)
    }
    if (data.role_ids.length > 0) {
      const rows = data.role_ids.map((role_id, idx) => ({
        team_member_id: memberId,
        role_id,
        is_primary: idx === 0,
      }))
      const { error: insertErr } = await supabase.from('team_member_roles').insert(rows)
      if (insertErr) {
        const msg = `Failed to save roles: ${insertErr.message}${insertErr.code ? ` (code: ${insertErr.code})` : ''}${insertErr.details ? ` [${insertErr.details}]` : ''}`
        console.error('[updateTeamMemberProfile] team_member_roles insert:', insertErr)
        throw new Error(msg)
      }
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

  if (orgId) {
    const hasChanges =
      data.hierarchy_level !== undefined ||
      data.role_ids !== undefined ||
      data.venue_ids !== undefined ||
      data.status !== undefined ||
      data.full_name !== undefined
    if (hasChanges) {
      await logAction({
        organisationId: orgId,
        tableName: 'team_members',
        recordId: memberId,
        action: 'UPDATE',
        oldData: {
          hierarchy_level: oldLevel,
          status: oldStatus,
          full_name: oldFullName,
        },
        newData: {
          hierarchy_level: data.hierarchy_level ?? oldLevel,
          status: data.status ?? oldStatus,
          full_name: data.full_name !== undefined ? data.full_name : oldFullName,
          role_ids: data.role_ids,
          venue_ids: data.venue_ids,
        },
      })
    }
  }
}

/** Delete a team member. Fails if active and has assigned shifts. Pending members can be deleted (cancels invite). */
export async function deleteTeamMember(memberId: string): Promise<void> {
  const { data: member, error: fetchErr } = await supabase
    .from('team_members')
    .select('id, status, organisation_id, profile:profiles!team_members_user_id_fkey(full_name)')
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

  const orgId = (member as { organisation_id?: string }).organisation_id
  const profile = (member as { profile?: { full_name?: string | null } }).profile
  const displayName = profile?.full_name?.trim() || null

  const { error: deleteErr } = await supabase
    .from('team_members')
    .delete()
    .eq('id', memberId)

  if (deleteErr) throw new Error(deleteErr.message)

  if (orgId) {
    await logAction({
      organisationId: orgId,
      tableName: 'team_members',
      recordId: memberId,
      action: 'DELETE',
      oldData: { status: (member as { status: string }).status },
      newData: null,
      metadata: { message: displayName ? `Team member deleted: ${displayName}` : 'Team member deleted' },
    })
  }
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
