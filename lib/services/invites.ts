import { supabase } from '@/lib/supabase'
import { logAction } from '@/lib/services/auditService'

export type HierarchicalInviteType = 'gm' | 'agm' | 'shift_leader' | 'worker'

const INVITE_TYPE_LABELS: Record<HierarchicalInviteType, string> = {
  gm: 'General Manager',
  agm: 'Assistant General Manager',
  shift_leader: 'Shift Leader',
  worker: 'Worker',
}

export function getInviteTypeLabel(type: HierarchicalInviteType): string {
  return INVITE_TYPE_LABELS[type] ?? type
}

/**
 * Create a hierarchical invite via RPC (validates inviter level server-side).
 * Returns the invite token. One active invite per email per org: checks for existing pending and throws if found.
 */
export async function createHierarchicalInvite(params: {
  email: string
  organisationId: string
  hierarchyLevel: HierarchicalInviteType
  venueIds?: string[]
}): Promise<{ token: string; inviteLink: string }> {
  const email = params.email.trim().toLowerCase()
  if (!email) throw new Error('Email is required')

  const { data: existing } = await supabase
    .from('invites')
    .select('id')
    .eq('email', email)
    .eq('organisation_id', params.organisationId)
    .eq('status', 'pending')
    .maybeSingle()

  if (existing) {
    throw new Error('An invite is already pending for this email. Revoke it first or use a different address.')
  }

  const venueIds = params.venueIds ?? []
  const { data: token, error } = await supabase.rpc('create_invite', {
    p_email: email,
    p_organisation_id: params.organisationId,
    p_hierarchy_level: params.hierarchyLevel,
    p_venue_ids: venueIds.length ? venueIds : null,
  })

  if (error) throw new Error(error.message ?? 'Failed to create invite')
  const tokenStr = typeof token === 'string' ? token : String(token ?? '')
  if (!tokenStr) throw new Error('No invite token returned')

  const baseUrl =
    (typeof window !== 'undefined'
      ? window.location.origin
      : process.env.NEXT_PUBLIC_APP_URL) || 'http://localhost:3000'
  const inviteLink = `${baseUrl}/invite/accept?token=${encodeURIComponent(tokenStr)}`

  const { data: inviteRow } = await supabase
    .from('invites')
    .select('id')
    .eq('token', tokenStr)
    .eq('organisation_id', params.organisationId)
    .limit(1)
    .maybeSingle()
  const inviteId = (inviteRow as { id?: string } | null)?.id
  if (inviteId) {
    await logAction({
      organisationId: params.organisationId,
      tableName: 'invites',
      recordId: inviteId,
      action: 'INVITE_SENT',
      newData: { email, hierarchy_level: params.hierarchyLevel, venue_ids: venueIds },
    })
  }

  return { token: tokenStr, inviteLink }
}

/**
 * Get count of pending invites for the given user's context.
 * Uses userId to resolve organisation and hierarchy: for employer, counts all pending invites in the org;
 * for others, counts only invites sent by this user (invited_by = userId).
 */
export async function getPendingInvitesCount(
  userId: string
): Promise<number> {
  const { data: member } = await supabase
    .from('team_members')
    .select('organisation_id, hierarchy_level')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!member) return 0

  const organisationId = (member as { organisation_id?: string }).organisation_id
  const level = (member as { hierarchy_level?: string }).hierarchy_level ?? 'worker'

  let query = supabase
    .from('invites')
    .select('*', { count: 'exact', head: true })
    .eq('organisation_id', organisationId)
    .eq('status', 'pending')

  if (level !== 'employer') {
    query = query.eq('invited_by', userId)
  }

  const { count, error } = await query

  if (error) {
    console.error('Error fetching pending invites count:', error)
    return 0
  }

  return count ?? 0
}

/**
 * Get count of pending invites for an organisation, optionally scoped by inviter.
 * Use this when you already have organisationId and userHierarchyLevel (e.g. from dashboard).
 */
export async function getPendingInvitesCountForOrg(
  organisationId: string,
  userHierarchyLevel: string
): Promise<number> {
  let query = supabase
    .from('invites')
    .select('*', { count: 'exact', head: true })
    .eq('organisation_id', organisationId)
    .eq('status', 'pending')

  const { count, error } = await query

  if (error) {
    console.error('Error fetching pending invites count:', error)
    return 0
  }

  return count ?? 0
}

/**
 * Accept an invite by token. Call when user is authenticated.
 * Uses RPC accept_invite(p_token, p_user_id).
 */
export async function acceptHierarchicalInvite(token: string): Promise<{
  success: boolean
  organisation_id: string
  hierarchy_level: string
  team_member_id: string
}> {
  const { data, error } = await supabase.rpc('accept_invite', {
    p_token: token.trim(),
  })

  if (error) throw new Error(error.message ?? 'Failed to accept invite')
  const result = data as { success?: boolean; organisation_id?: string; hierarchy_level?: string; team_member_id?: string } | null
  if (!result?.success) throw new Error('Invite could not be accepted')
  return {
    success: true,
    organisation_id: result.organisation_id ?? '',
    hierarchy_level: result.hierarchy_level ?? 'worker',
    team_member_id: result.team_member_id ?? '',
  }
}

// ---------------------------------------------------------------------------
// Shift invites (rota_shifts / shift_invites)
// ---------------------------------------------------------------------------

/** Pending shift invites for a worker (by userId). Used by ShiftInvitationsList. */
export async function getMyPendingInvites(userId: string): Promise<Record<string, unknown>[]> {
  const { data: members } = await supabase
    .from('team_members')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'active')

  const teamMemberIds = (members ?? []).map((m) => (m as { id: string }).id)
  if (teamMemberIds.length === 0) return []

  const { data, error } = await supabase
    .from('shift_invites')
    .select(
      `
      *,
      shift:rota_shifts(*, venue:venues(id,name), role:roles(id,name,colour)),
      inviter:profiles!shift_invites_invited_by_fkey(full_name)
    `
    )
    .in('team_member_id', teamMemberIds)
    .eq('status', 'pending')

  if (error) throw error
  return (data ?? []) as Record<string, unknown>[]
}

/** Accept a shift invite (worker). Uses RPC accept_shift_invite_atomic. */
export async function acceptShiftInvite(inviteId: string, teamMemberId: string): Promise<void> {
  const { data, error } = await supabase.rpc('accept_shift_invite_atomic', {
    p_invite_id: inviteId,
    p_team_member_id: teamMemberId,
  })

  if (error) throw new Error(error.message ?? 'Failed to accept invite')
  if (!data) throw new Error('No response from accept')
}

/** Decline a shift invite (worker). */
export async function declineShiftInvite(inviteId: string): Promise<void> {
  const { error } = await supabase
    .from('shift_invites')
    .update({ status: 'declined', responded_at: new Date().toISOString() })
    .eq('id', inviteId)

  if (error) throw error
}

/** Pending shift invites for a rota shift, with team_member and profile. */
export async function getPendingInvitesForShift(rotaShiftId: string): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase
    .from('shift_invites')
    .select(
      `
      *,
      team_member:team_members(
        id,
        employment_type,
        profile:profiles!team_members_user_id_fkey(full_name, email)
      )
    `
    )
    .eq('rota_shift_id', rotaShiftId)
    .eq('status', 'pending')

  if (error) throw error
  return (data ?? []) as Record<string, unknown>[]
}

/** Cancel a shift invite (set status to cancelled). */
export async function cancelShiftInvite(inviteId: string): Promise<void> {
  const { data: invite } = await supabase
    .from('shift_invites')
    .select('id, rota_shift_id, team_member_id')
    .eq('id', inviteId)
    .single()
  let orgId: string | null = null
  if (invite?.rota_shift_id) {
    const { data: shift } = await supabase
      .from('rota_shifts')
      .select('venue_id')
      .eq('id', (invite as { rota_shift_id: string }).rota_shift_id)
      .single()
    const venueId = (shift as { venue_id?: string } | null)?.venue_id
    if (venueId) {
      const { data: venue } = await supabase
        .from('venues')
        .select('organisation_id')
        .eq('id', venueId)
        .single()
      orgId = (venue as { organisation_id?: string } | null)?.organisation_id ?? null
    }
  }

  const { error } = await supabase
    .from('shift_invites')
    .update({ status: 'cancelled', responded_at: new Date().toISOString() })
    .eq('id', inviteId)

  if (error) throw error

  if (orgId) {
    await logAction({
      organisationId: orgId,
      tableName: 'shift_invites',
      recordId: inviteId,
      action: 'UPDATE',
      oldData: invite as Record<string, unknown>,
      newData: { status: 'cancelled' },
      metadata: { message: 'Shift invite cancelled' },
    })
  }
}

function generateInviteCode(): string {
  const segment = () => Math.random().toString(36).slice(2, 10)
  return `SI-${segment()}${segment()}`.toUpperCase()
}

async function getOrganisationIdForRotaShift(rotaShiftId: string): Promise<string | null> {
  const { data: shift } = await supabase
    .from('rota_shifts')
    .select('venue_id')
    .eq('id', rotaShiftId)
    .single()
  const venueId = (shift as { venue_id?: string } | null)?.venue_id
  if (!venueId) return null
  const { data: venue } = await supabase
    .from('venues')
    .select('organisation_id')
    .eq('id', venueId)
    .single()
  return (venue as { organisation_id?: string } | null)?.organisation_id ?? null
}

/**
 * Invite multiple employees to a shift. Creates shift_invites rows.
 * Returns created rows (with invite_code, team_member_id).
 */
export async function inviteEmployeesToShift(params: {
  rota_shift_id: string
  team_member_ids: string[]
}): Promise<Record<string, unknown>[]> {
  const { data: { user } } = await supabase.auth.getUser()
  const invitedBy = user?.id ?? null

  const rows = params.team_member_ids.map((team_member_id) => ({
    rota_shift_id: params.rota_shift_id,
    team_member_id,
    status: 'pending',
    invited_by: invitedBy,
    invite_code: generateInviteCode(),
  }))

  const { data, error } = await supabase
    .from('shift_invites')
    .insert(rows)
    .select()

  if (error) throw error
  const created = (data ?? []) as Record<string, unknown>[]
  const orgId = await getOrganisationIdForRotaShift(params.rota_shift_id)
  if (orgId) {
    for (const row of created) {
      const id = row.id as string
      if (id) {
        await logAction({
          organisationId: orgId,
          tableName: 'shift_invites',
          recordId: id,
          action: 'INSERT',
          newData: { rota_shift_id: params.rota_shift_id, team_member_id: row.team_member_id, status: 'pending' },
          metadata: { message: 'Shift invite sent' },
        })
      }
    }
  }
  return created
}

/**
 * Create a single shift invite (for InviteWorkerModal).
 */
export async function createShiftInvite(rotaShiftId: string, teamMemberId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  const invitedBy = user?.id ?? null

  const { data: created, error } = await supabase
    .from('shift_invites')
    .insert({
      rota_shift_id: rotaShiftId,
      team_member_id: teamMemberId,
      status: 'pending',
      invited_by: invitedBy,
      invite_code: generateInviteCode(),
    })
    .select('id')
    .single()

  if (error) throw error

  const orgId = await getOrganisationIdForRotaShift(rotaShiftId)
  if (orgId && created?.id) {
    await logAction({
      organisationId: orgId,
      tableName: 'shift_invites',
      recordId: (created as { id: string }).id,
      action: 'INSERT',
      newData: { rota_shift_id: rotaShiftId, team_member_id: teamMemberId, status: 'pending' },
      metadata: { message: 'Shift invite sent' },
    })
  }
}

/**
 * Filter team members to those available for a shift (not already allocated or invited).
 */
export async function getAvailableWorkersForShift(
  rotaShiftId: string,
  _organisationId: string,
  allWorkers: Record<string, unknown>[]
): Promise<Record<string, unknown>[]> {
  const { data: allocations } = await supabase
    .from('shift_allocations')
    .select('team_member_id')
    .eq('rota_shift_id', rotaShiftId)
  const { data: invites } = await supabase
    .from('shift_invites')
    .select('team_member_id')
    .eq('rota_shift_id', rotaShiftId)
    .in('status', ['pending', 'accepted'])

  const allocatedOrInvited = new Set<string>()
  for (const r of allocations ?? []) {
    allocatedOrInvited.add(String((r as { team_member_id: string }).team_member_id))
  }
  for (const r of invites ?? []) {
    allocatedOrInvited.add(String((r as { team_member_id: string }).team_member_id))
  }

  return allWorkers.filter((w) => !allocatedOrInvited.has(String(w.id)))
}

/**
 * Pull available workers for a shift (by venue/role/date). Excludes already allocated or invited for this shift.
 */
export async function pullAvailableWorkers(params: {
  venueId: string
  roleId?: string
  shiftDate?: string
  shiftId?: string
}): Promise<{ team_member_id: string; full_name: string | null; email: string | null; employment_type: string | null }[]> {
  const { venueId, roleId, shiftId } = params

  const { data: venue } = await supabase
    .from('venues')
    .select('organisation_id')
    .eq('id', venueId)
    .single()
  const orgId = (venue as { organisation_id?: string } | null)?.organisation_id
  if (!orgId) return []

  let query = supabase
    .from('team_members')
    .select(
      `
      id,
      employment_type,
      profile:profiles!team_members_user_id_fkey(full_name, email)
    `
    )
    .eq('organisation_id', orgId)
    .eq('status', 'active')

  const { data: members, error } = await query
  if (error) return []

  const list = (members ?? []) as Record<string, unknown>[]
  let teamMemberIds = list.map((m) => String(m.id))

  if (shiftId) {
    const { data: alloc } = await supabase
      .from('shift_allocations')
      .select('team_member_id')
      .eq('rota_shift_id', shiftId)
    const { data: inv } = await supabase
      .from('shift_invites')
      .select('team_member_id')
      .eq('rota_shift_id', shiftId)
      .in('status', ['pending', 'accepted'])
    const excluded = new Set<string>()
    for (const r of alloc ?? []) excluded.add(String((r as { team_member_id: string }).team_member_id))
    for (const r of inv ?? []) excluded.add(String((r as { team_member_id: string }).team_member_id))
    teamMemberIds = teamMemberIds.filter((id) => !excluded.has(id))
  }

  const profileMap = new Map<string, { full_name?: string; email?: string }>()
  for (const m of list) {
    const prof = (m as { profile?: { full_name?: string; email?: string } }).profile
    profileMap.set(String(m.id), prof ?? {})
  }

  return teamMemberIds.map((id) => {
    const m = list.find((x) => String(x.id) === id) as Record<string, unknown> | undefined
    const prof = m ? profileMap.get(id) ?? (m.profile as { full_name?: string; email?: string }) : {}
    return {
      team_member_id: id,
      full_name: (prof?.full_name ?? (m?.profile as { full_name?: string })?.full_name) ?? null,
      email: (prof?.email ?? (m?.profile as { email?: string })?.email) ?? null,
      employment_type: (m?.employment_type as string) ?? null,
    }
  })
}
