'use server'

import { createClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import type { HierarchyLevel } from '@/lib/types/hierarchy'
import { HIERARCHY_RULES } from '@/lib/types/hierarchy'
import { createNotification } from '@/app/actions/notifications'

/** Get current user's team_member row for an org with hierarchy_level. */
async function getInviterMember(orgId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { user: null, member: null }

  const { data: member, error } = await supabase
    .from('team_members')
    .select('id, user_id, organisation_id, hierarchy_level, can_invite_managers, venue_scope')
    .eq('organisation_id', orgId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return { user, member: member as (Record<string, unknown> & { hierarchy_level?: HierarchyLevel }) | null }
}

/** Invite a manager at a given hierarchy level. Validates inviter level and permission. */
export async function inviteManager(
  orgId: string,
  email: string,
  fullName: string,
  level: HierarchyLevel,
  venueIds: string[]
) {
  const { user, member } = await getInviterMember(orgId)
  if (!user || !member) throw new Error('Not authenticated or not a member of this organisation')

  const inviterLevel = (member.hierarchy_level as HierarchyLevel) || 'worker'
  const rules = HIERARCHY_RULES[inviterLevel]
  if (!rules.canInvite.includes(level)) {
    throw new Error(`Your role (${inviterLevel}) cannot invite ${level}.`)
  }
  if (level === 'gm' && !member.can_invite_managers && inviterLevel !== 'employer') {
    throw new Error('You do not have permission to invite managers.')
  }

  const res = await fetch(
    `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/invite`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email.trim(),
        fullName: fullName.trim(),
        orgId,
        orgName: '',
        role: 'manager',
        venueIds: venueIds || [],
        hierarchy_level: level,
        venue_scope: venueIds,
        invited_by: user.id,
      }),
    }
  )
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Failed to send invite')
  return data as { success: boolean; teamMember?: unknown; message: string; manualLink?: string }
}

/** Build hierarchy tree for an org (management_chain + team_members). Uses service role to bypass RLS. */
export async function getTeamHierarchy(orgId: string) {
  try {
    console.log('[getTeamHierarchy] START orgId:', orgId)
    const admin = getSupabaseAdmin()
    console.log('[getTeamHierarchy] Admin client created')

    const { data: members, error: membersError } = await admin
      .from('team_members')
      .select('id, user_id, organisation_id, hierarchy_level')
      .eq('organisation_id', orgId)

    console.log('[getTeamHierarchy] Query done:', {
      dataLength: members?.length,
      error: membersError?.message,
      errorCode: membersError?.code,
    })

    if (membersError) {
      console.error('[getTeamHierarchy] QUERY ERROR:', membersError)
      throw membersError
    }

    return { members: (members ?? []) as Record<string, unknown>[], chain: [] }
  } catch (err) {
    console.error('[getTeamHierarchy] CATCH ERROR:', err)
    throw err
  }
}

/** Update a member's hierarchy level and venue scope. Only higher-level users can update. */
export async function updateHierarchyLevel(
  memberId: string,
  newLevel: HierarchyLevel,
  assignedVenueIds: string[]
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: target, error: targetErr } = await supabase
    .from('team_members')
    .select('id, organisation_id, hierarchy_level')
    .eq('id', memberId)
    .single()
  if (targetErr || !target) throw new Error('Team member not found')

  const { member } = await getInviterMember((target as { organisation_id: string }).organisation_id)
  if (!member) throw new Error('You are not a member of this organisation')
  const inviterLevel = (member.hierarchy_level as HierarchyLevel) || 'worker'
  const currentLevel = (target as { hierarchy_level?: HierarchyLevel }).hierarchy_level || 'worker'

  const order: HierarchyLevel[] = ['employer', 'gm', 'agm', 'shift_leader', 'worker']
  const inviterRank = order.indexOf(inviterLevel)
  const currentRank = order.indexOf(currentLevel)
  const newRank = order.indexOf(newLevel)
  if (inviterRank <= currentRank || inviterRank <= newRank) {
    throw new Error('You can only change roles for people below your level.')
  }

  const admin = getSupabaseAdmin()
  const { error: updateErr } = await admin
    .from('team_members')
    .update({
      hierarchy_level: newLevel,
      venue_scope: assignedVenueIds.length ? assignedVenueIds : null,
      member_type: newLevel === 'worker' ? 'employee' : 'manager',
    })
    .eq('id', memberId)
  if (updateErr) throw new Error(updateErr.message)

  const { data: tmRow } = await admin.from('team_members').select('user_id, organisation_id').eq('id', memberId).single()
  const targetUserId = (tmRow as { user_id?: string; organisation_id?: string } | null)?.user_id
  const organisationId = (tmRow as { organisation_id?: string } | null)?.organisation_id
  if (targetUserId && organisationId) {
    await createNotification(
      organisationId,
      targetUserId,
      'hierarchy_changed',
      'Role updated',
      `Your role has been updated to ${newLevel}.`,
      { memberId, newLevel }
    ).catch(() => {})
  }

  return { success: true }
}

/** Check if the current user has permission for an action (e.g. can_edit_rota). */
export async function checkPermission(
  userId: string,
  action: keyof import('@/lib/types/hierarchy').Permissions
): Promise<boolean> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || user.id !== userId) return false

  const { data: tm, error: tmErr } = await supabase
    .from('team_members')
    .select('id, hierarchy_level')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle()
  if (tmErr || !tm) return false

  const teamMemberId = (tm as { id: string }).id
  const { data: perm } = await supabase
    .from('permissions')
    .select('*')
    .eq('team_member_id', teamMemberId)
    .maybeSingle()
  if (perm && (perm as Record<string, boolean>)[action]) return true

  const level = (tm as { hierarchy_level?: HierarchyLevel }).hierarchy_level ?? 'worker'
  const rules = HIERARCHY_RULES[level]
  if (action === 'can_edit_rota') return rules.canEditRota !== 'none'
  if (action === 'can_manage_venue_settings') return rules.canManageVenue !== 'none'
  if (action === 'can_invite_managers') return rules.canInvite.includes('gm')
  if (action === 'can_invite_workers') return rules.canInvite.includes('worker')
  return false
}
