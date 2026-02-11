'use server'

import { createClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { revalidatePath } from 'next/cache'
import type { HierarchyLevel } from '@/lib/types/hierarchy'

// ============================================
// HIERARCHY (aligned with Emergency Protocol & protocol spec)
// Owner = Employer (same person, rank 90)
// ============================================

const HIERARCHY_RANK: Record<string, number> = {
  employer: 90,  // Owner = Employer (same person)
  gm: 80,
  agm: 70,
  shift_leader: 60,
  worker: 50,
}

export type InvitePosition = 'employer' | 'gm' | 'agm' | 'shift_leader' | 'worker'

const INVITABLE_POSITIONS: Record<string, InvitePosition[]> = {
  employer: ['gm', 'agm', 'shift_leader', 'worker'],  // Owner/Employer can invite down to worker
  gm: ['agm', 'shift_leader', 'worker'],
  agm: ['shift_leader', 'worker'],
  shift_leader: ['worker'],
  worker: [],
}

export type CreateInviteResult = {
  success: boolean
  code?: string
  inviteLink?: string
  error?: string
}

// ============================================
// Get Actor's Hierarchy Level (Owner Blind Spot fix)
// ============================================

async function getActorLevel(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  actorId: string,
  organisationId: string
): Promise<{ level: HierarchyLevel; rank: number }> {
  const { data: org, error: orgError } = await supabase
    .from('organisations')
    .select('owner_id')
    .eq('id', organisationId)
    .single()

  if (orgError) throw new Error(`Failed to fetch organisation: ${orgError.message}`)
  if (!org) throw new Error('Organisation not found')

  if (org.owner_id === actorId) {
    return { level: 'employer', rank: HIERARCHY_RANK.employer }
  }

  const { data: member, error: memberError } = await supabase
    .from('team_members')
    .select('hierarchy_level')
    .eq('user_id', actorId)
    .eq('organisation_id', organisationId)
    .eq('status', 'active')
    .maybeSingle()

  if (memberError) throw new Error(`Failed to fetch membership: ${memberError.message}`)
  if (!member?.hierarchy_level) {
    throw new Error('You are not an active member of this organisation')
  }

  const level = String(member.hierarchy_level).toLowerCase() as HierarchyLevel
  const rank = HIERARCHY_RANK[level] ?? HIERARCHY_RANK.worker
  return { level, rank }
}

// ============================================
// Generate invite code (FLEX-XXXXXXXX-XXXXXXXX)
// ============================================

function generateInviteCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  const rand = (n: number) => {
    let s = ''
    const arr = new Uint8Array(n)
    crypto.getRandomValues(arr)
    for (let i = 0; i < n; i++) s += chars[arr[i]! % chars.length]
    return s
  }
  return `FLEX-${rand(8)}-${rand(8)}`
}

// ============================================
// createInvite – Server Action (atomic, hierarchy-enforced)
// ============================================

export async function createInvite(
  email: string,
  position: InvitePosition,
  organisationId: string,
  venueIds?: string[]
): Promise<CreateInviteResult> {
  const supabaseAdmin = getSupabaseAdmin()
  const supabaseUser = await createClient()

  const {
    data: { user },
  } = await supabaseUser.auth.getUser()
  if (!user) {
    return { success: false, error: 'Not authenticated' }
  }

  const actorId = user.id
  const trimmedEmail = email.trim().toLowerCase()
  if (!trimmedEmail) {
    return { success: false, error: 'Email is required' }
  }

  const targetRank = HIERARCHY_RANK[position] ?? 0
  if (targetRank === 0) {
    return { success: false, error: `Invalid position: ${position}` }
  }

  try {
    // 1. Validate actor permission (owner check first)
    const { level: actorLevel, rank: actorRank } = await getActorLevel(supabaseAdmin, actorId, organisationId)

    if (actorRank <= targetRank) {
      const actorLabel = actorLevel === 'employer' ? 'Organization Owner' : actorLevel.toUpperCase()
      return {
        success: false,
        error: `You don't have permission to invite someone as ${position}. Your role (${actorLabel}) cannot invite at this level.`,
      }
    }

    if (position === 'worker' && actorLevel === 'worker') {
      return {
        success: false,
        error: 'You cannot invite members. Workers cannot invite anyone.',
      }
    }

    // 2. No pending invite for this email+org
    const { data: existingInvite } = await supabaseAdmin
      .from('invites')
      .select('id')
      .eq('email', trimmedEmail)
      .eq('organisation_id', organisationId)
      .eq('status', 'pending')
      .maybeSingle()

    if (existingInvite) {
      return {
        success: false,
        error: 'An active invite already exists for this email address',
      }
    }

    // 3. Email not already registered in organisation
    const { data: existingMember } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .ilike('email', trimmedEmail)
      .limit(1)
      .maybeSingle()

    if (existingMember) {
      const { data: memberInOrg } = await supabaseAdmin
        .from('team_members')
        .select('id')
        .eq('user_id', existingMember.id)
        .eq('organisation_id', organisationId)
        .maybeSingle()

      if (memberInOrg) {
        return {
          success: false,
          error: 'This email address is already registered in this organisation',
        }
      }
    }

    // 4. Generate code and insert invite (atomic)
    const code = generateInviteCode()
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7)

    const { data: inviteRow, error: insertError } = await supabaseAdmin
      .from('invites')
      .insert({
        token: code,
        email: trimmedEmail,
        organisation_id: organisationId,
        invited_by: actorId,
        hierarchy_level: position,
        status: 'pending',
        expires_at: expiresAt.toISOString(),
        venue_ids: venueIds && venueIds.length > 0 ? venueIds : null,
      })
      .select('id')
      .single()

    if (insertError) {
      if (insertError.code === '23505') {
        return { success: false, error: 'Invite code collision. Please try again.' }
      }
      throw new Error(insertError.message)
    }

    const inviteId = inviteRow?.id
    if (!inviteId) throw new Error('Invite creation failed')

    // 5. Audit log (INVITE_SENT = INVITE_CREATED)
    await supabaseAdmin.from('organisation_audit_logs').insert({
      organisation_id: organisationId,
      user_id: actorId,
      table_name: 'invites',
      record_id: inviteId,
      action: 'INVITE_SENT',
      new_data: {
        email: trimmedEmail,
        intended_position: position,
        expires_at: expiresAt.toISOString(),
      },
    })

    const baseUrl =
      typeof process.env.NEXT_PUBLIC_APP_URL === 'string' && process.env.NEXT_PUBLIC_APP_URL
        ? process.env.NEXT_PUBLIC_APP_URL
        : 'http://localhost:3000'
    const inviteLink = `${baseUrl}/invite/accept?token=${encodeURIComponent(code)}`

    revalidatePath('/dashboard/team')
    revalidatePath('/dashboard/team/invites')

    return {
      success: true,
      code,
      inviteLink,
    }
  } catch (err) {
    console.error('[createInvite] error:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error occurred',
    }
  }
}

// ============================================
// validateInvitation – Pre-registration check
// ============================================

export async function validateInvitation(
  inviteCode: string,
  email: string
): Promise<{
  valid: boolean
  organisationId?: string
  targetPosition?: InvitePosition
  organisationName?: string
  error?: string
}> {
  const supabaseAdmin = getSupabaseAdmin()
  const code = inviteCode.trim().toUpperCase()
  const trimmedEmail = email.trim().toLowerCase()
  if (!code) {
    return { valid: false, error: 'Invalid or expired invitation code' }
  }

  const { data: invite, error } = await supabaseAdmin
    .from('invites')
    .select('id, email, organisation_id, hierarchy_level, expires_at, status')
    .eq('token', code)
    .eq('status', 'pending')
    .maybeSingle()

  if (error || !invite) {
    return { valid: false, error: 'Invalid or expired invitation code' }
  }

  if (invite.expires_at && new Date(invite.expires_at) <= new Date()) {
    await supabaseAdmin.from('invites').update({ status: 'expired' }).eq('id', invite.id)
    return { valid: false, error: 'Invitation code has expired' }
  }

  if ((invite.email as string).toLowerCase() !== trimmedEmail) {
    return {
      valid: false,
      error: `This invitation was sent to ${invite.email}, not ${email}`,
    }
  }

  const { data: org } = await supabaseAdmin
    .from('organisations')
    .select('name')
    .eq('id', invite.organisation_id)
    .single()

  return {
    valid: true,
    organisationId: invite.organisation_id,
    targetPosition: invite.hierarchy_level as InvitePosition,
    organisationName: (org as { name?: string })?.name,
  }
}

// ============================================
// revokeInvitation – Cancel pending invite
// ============================================

export async function revokeInvitation(
  inviteId: string,
  actorId: string,
  organisationId: string
): Promise<{ success: boolean; error?: string }> {
  const supabaseAdmin = getSupabaseAdmin()

  const { data: invite, error: fetchErr } = await supabaseAdmin
    .from('invites')
    .select('id, invited_by, status')
    .eq('id', inviteId)
    .eq('organisation_id', organisationId)
    .single()

  if (fetchErr || !invite) {
    return { success: false, error: 'Invitation not found' }
  }

  if ((invite as { status?: string }).status !== 'pending') {
    return { success: false, error: 'Can only revoke pending invitations' }
  }

  const { level: actorLevel } = await getActorLevel(supabaseAdmin, actorId, organisationId)
  const isCreator = (invite as { invited_by?: string }).invited_by === actorId
  const isHighRank = ['employer', 'gm'].includes(actorLevel)

  if (!isCreator && !isHighRank) {
    return { success: false, error: 'Only the creator or high-rank members can revoke invites' }
  }

  const { error: updateErr } = await supabaseAdmin
    .from('invites')
    .update({ status: 'revoked' })
    .eq('id', inviteId)

  if (updateErr) {
    return { success: false, error: updateErr.message }
  }

  await supabaseAdmin.from('organisation_audit_logs').insert({
    organisation_id: organisationId,
    user_id: actorId,
    table_name: 'invites',
    record_id: inviteId,
    action: 'UPDATE',
    old_data: { status: 'pending' },
    new_data: { status: 'revoked' },
  })

  revalidatePath('/dashboard/team')
  revalidatePath('/dashboard/team/invites')
  return { success: true }
}

// ============================================
// listOrganisationInvites – For UI display
// ============================================

export async function listOrganisationInvites(
  organisationId: string,
  actorId: string,
  status?: 'pending' | 'accepted' | 'expired' | 'revoked'
): Promise<Array<{
  id: string
  email: string
  hierarchy_level: string
  token: string
  expires_at: string
  created_at: string
  invited_by: string | null
  creator?: { full_name?: string; email?: string }
}>> {
  const supabaseAdmin = getSupabaseAdmin()
  await getActorLevel(supabaseAdmin, actorId, organisationId)

  let query = supabaseAdmin
    .from('invites')
    .select('id, email, hierarchy_level, token, expires_at, created_at, invited_by')
    .eq('organisation_id', organisationId)
    .order('created_at', { ascending: false })

  if (status) {
    query = query.eq('status', status)
  }

  const { data, error } = await query
  if (error) throw error

  const rows = (data ?? []) as Array<{
    id: string
    email: string
    hierarchy_level: string
    token: string
    expires_at: string
    created_at: string
    invited_by: string | null
  }>

  if (rows.length === 0) return []

  const creatorIds = [...new Set(rows.map((r) => r.invited_by).filter(Boolean))] as string[]
  let creators: Array<{ id: string; full_name?: string; email?: string }> = []
  if (creatorIds.length > 0) {
    const { data: creatorData } = await supabaseAdmin
    .from('profiles')
    .select('id, full_name, email')
    .in('id', creatorIds)
    creators = (creatorData ?? []) as Array<{ id: string; full_name?: string; email?: string }>
  }

  const creatorMap = new Map<string, { full_name?: string; email?: string }>()
  for (const c of creators) {
    creatorMap.set((c as { id: string }).id, c as { full_name?: string; email?: string })
  }

  return rows.map((r) => ({
    ...r,
    creator: r.invited_by ? creatorMap.get(r.invited_by) : undefined,
  }))
}
