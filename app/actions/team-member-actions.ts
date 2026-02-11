'use server'

import { createClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { revalidatePath } from 'next/cache'
import type { HierarchyLevel } from '@/lib/types/hierarchy'
import { notifyHierarchyChange } from '@/app/actions/notification-actions'

// ============================================
// TYPES (adapted to FlexiWork Rosta schema)
// ============================================

const HIERARCHY_RANK: Record<HierarchyLevel, number> = {
  employer: 90,
  gm: 80,
  agm: 70,
  shift_leader: 60,
  worker: 50,
}

export type TeamMemberUpdate = {
  full_name?: string
  hierarchy_level?: string
  status?: string
  primary_venue_id?: string | null
  role_ids?: string[]
  venue_ids?: string[]
}

export type UpdateResult = {
  success: boolean
  error?: string
  auditEntries?: number
  message?: string
}

export type MyProfilePersonalUpdate = {
  first_name: string
  last_name: string
  phone: string | null
}

// ============================================
// MY PROFILE: Update own personal info (first_name, last_name, phone)
// Uses service role; only allows editing own profile. Works for owners without team_members.
// ============================================

export async function updateMyProfilePersonal(
  userId: string,
  changes: MyProfilePersonalUpdate
): Promise<UpdateResult> {
  const supabaseAdmin = getSupabaseAdmin()
  const supabaseUser = await createClient()

  const {
    data: { user },
  } = await supabaseUser.auth.getUser()
  if (!user) {
    return { success: false, error: 'Not authenticated' }
  }

  if (user.id !== userId) {
    return { success: false, error: 'You can only update your own profile' }
  }

  try {
    const fullName = [changes.first_name?.trim(), changes.last_name?.trim()]
      .filter(Boolean)
      .join(' ') || null

    // Fetch current user_type to satisfy NOT NULL on insert; preserve on update
    const { data: existing } = await supabaseAdmin
      .from('profiles')
      .select('user_type')
      .eq('id', userId)
      .maybeSingle()

    const userType = (existing?.user_type as string) ?? 'employee'
    if (userType !== 'employer' && userType !== 'employee') {
      throw new Error('Invalid user_type in profile')
    }

    const row = {
      id: userId,
      first_name: changes.first_name?.trim() || null,
      last_name: changes.last_name?.trim() || null,
      full_name: fullName,
      phone: changes.phone?.trim() || null,
      user_type: userType,
    }

    const { error } = await supabaseAdmin
      .from('profiles')
      .upsert(row, { onConflict: 'id' })

    if (error) {
      throw new Error('Profile update failed: ' + error.message)
    }

    revalidatePath('/dashboard/profile')
    return { success: true }
  } catch (err) {
    console.error('[updateMyProfilePersonal] error:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error occurred',
    }
  }
}

// ============================================
// MY PROFILE: Update own organisation (owner only)
// Uses service role to avoid RLS issues.
// ============================================

export async function updateOrganisationServer(
  organisationId: string,
  updates: { name?: string; company_address?: string; tax_id?: string }
): Promise<UpdateResult> {
  const supabaseAdmin = getSupabaseAdmin()
  const supabaseUser = await createClient()

  const {
    data: { user },
  } = await supabaseUser.auth.getUser()
  if (!user) {
    return { success: false, error: 'Not authenticated' }
  }

  const { data: org, error: orgErr } = await supabaseAdmin
    .from('organisations')
    .select('owner_id')
    .eq('id', organisationId)
    .single()

  if (orgErr || !org) {
    return { success: false, error: 'Organisation not found' }
  }
  if (org.owner_id !== user.id) {
    return { success: false, error: 'Only the organisation owner can update these settings' }
  }

  if (Object.keys(updates).length === 0) {
    return { success: true }
  }

  const payload: Record<string, string | null> = {}
  if (updates.name !== undefined) payload.name = updates.name.trim() || null
  if (updates.company_address !== undefined) payload.company_address = updates.company_address.trim() || null
  if (updates.tax_id !== undefined) payload.tax_id = updates.tax_id.trim() || null

  if (Object.keys(payload).length === 0) {
    return { success: true }
  }

  const { error } = await supabaseAdmin
    .from('organisations')
    .update(payload)
    .eq('id', organisationId)

  if (error) {
    console.error('[updateOrganisationServer] error:', error)
    return { success: false, error: error.message }
  }

  revalidatePath('/dashboard/profile')
  return { success: true }
}

// ============================================
// CORE: Get Actor's Hierarchy Level
// CRITICAL FIX: Check organisations.owner_id FIRST (Owner Blind Spot)
// ============================================

async function getActorLevel(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  actorId: string,
  organisationId: string
): Promise<{ level: HierarchyLevel; isOwner: boolean }> {
  // PRIORITY 1: Check if actor is the organisation owner
  const { data: org, error: orgError } = await supabase
    .from('organisations')
    .select('owner_id')
    .eq('id', organisationId)
    .single()

  if (orgError) {
    throw new Error(`Failed to fetch organisation: ${orgError.message}`)
  }

  if (org?.owner_id === actorId) {
    return { level: 'employer', isOwner: true }
  }

  // PRIORITY 2: Check team_members hierarchy_level
  const { data: member, error: memberError } = await supabase
    .from('team_members')
    .select('hierarchy_level')
    .eq('user_id', actorId)
    .eq('organisation_id', organisationId)
    .maybeSingle()

  if (memberError) {
    throw new Error(`Failed to fetch actor membership: ${memberError.message}`)
  }

  if (!member?.hierarchy_level) {
    throw new Error('Actor is not a member of this organisation')
  }

  const level = String(member.hierarchy_level).toLowerCase() as HierarchyLevel
  if (!(level in HIERARCHY_RANK)) {
    throw new Error(`Invalid hierarchy level: ${level}`)
  }

  return { level, isOwner: false }
}

// ============================================
// CORE: Get Target's Hierarchy Level
// ============================================

async function getTargetLevel(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  memberId: string
): Promise<HierarchyLevel> {
  const { data: member, error } = await supabase
    .from('team_members')
    .select('hierarchy_level')
    .eq('id', memberId)
    .single()

  if (error || !member) {
    throw new Error('Target team member not found')
  }

  const level = String(member.hierarchy_level || 'worker').toLowerCase() as HierarchyLevel
  return level in HIERARCHY_RANK ? level : 'worker'
}

// ============================================
// VALIDATION: Hierarchy Permission Check
// ============================================

function validateHierarchyPermission(
  actorLevel: HierarchyLevel,
  targetLevel: HierarchyLevel,
  requestedLevel?: HierarchyLevel
): void {
  const actorRank = HIERARCHY_RANK[actorLevel]
  const targetRank = HIERARCHY_RANK[targetLevel]

  if (actorRank <= targetRank) {
    throw new Error(`Permission denied: ${actorLevel} cannot modify ${targetLevel}`)
  }

  if (requestedLevel) {
    const requestedRank = HIERARCHY_RANK[requestedLevel]
    if (requestedRank >= actorRank) {
      throw new Error(
        `Cannot promote to ${requestedLevel}: would exceed your authority as ${actorLevel}`
      )
    }
  }
}

// ============================================
// MAIN SERVER ACTION
// ============================================

export async function updateTeamMemberComplete(
  memberId: string,
  targetUserId: string,
  organisationId: string,
  changes: TeamMemberUpdate
): Promise<UpdateResult> {
  const supabaseAdmin = getSupabaseAdmin()
  const supabaseUser = await createClient()

  const {
    data: { user },
  } = await supabaseUser.auth.getUser()
  if (!user) {
    return { success: false, error: 'Not authenticated' }
  }

  const actorId = user.id

  try {
    // STEP 1: Determine Actor Level (with Owner fix)
    const { level: actorLevel } = await getActorLevel(supabaseAdmin, actorId, organisationId)

    // STEP 2: Get Target's Current Level
    const targetLevel = await getTargetLevel(supabaseAdmin, memberId)

    // STEP 3: Validate Hierarchy Permission
    const requestedLevel = changes.hierarchy_level as HierarchyLevel | undefined
    validateHierarchyPermission(actorLevel, targetLevel, requestedLevel)

    // STEP 4: Fetch Current Data for Audit
    const { data: currentMember, error: memberErr } = await supabaseAdmin
      .from('team_members')
      .select('full_name, hierarchy_level, status, primary_venue_id')
      .eq('id', memberId)
      .single()

    if (memberErr || !currentMember) {
      throw new Error('Target team member not found')
    }

    const oldData = {
      full_name: currentMember.full_name,
      hierarchy_level: currentMember.hierarchy_level,
      status: currentMember.status,
      primary_venue_id: currentMember.primary_venue_id,
    }

    // STEP 5: Build Audit Entries (organisation_audit_logs schema)
    const auditEntries: Array<{
      organisation_id: string
      user_id: string
      table_name: string
      record_id: string
      action: string
      old_data: Record<string, unknown>
      new_data: Record<string, unknown>
    }> = []

    const addAudit = (field: string, oldVal: unknown, newVal: unknown) => {
      if (oldVal !== newVal) {
        auditEntries.push({
          organisation_id: organisationId,
          user_id: actorId,
          table_name: 'team_members',
          record_id: memberId,
          action: 'UPDATE',
          old_data: { [field]: oldVal },
          new_data: { [field]: newVal },
        })
      }
    }

    if (changes.full_name !== undefined) addAudit('full_name', oldData.full_name, changes.full_name)
    if (changes.hierarchy_level !== undefined)
      addAudit('hierarchy_level', oldData.hierarchy_level, changes.hierarchy_level)
    if (changes.status !== undefined) addAudit('status', oldData.status, changes.status)
    if (changes.primary_venue_id !== undefined)
      addAudit('primary_venue_id', oldData.primary_venue_id, changes.primary_venue_id)

    // STEP 6: Atomic Updates

    // Update team_members
    const teamUpdates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }
    if (changes.full_name !== undefined) teamUpdates.full_name = changes.full_name?.trim() || null
    if (changes.hierarchy_level !== undefined) teamUpdates.hierarchy_level = changes.hierarchy_level
    if (changes.status !== undefined) teamUpdates.status = changes.status
    if (changes.primary_venue_id !== undefined)
      teamUpdates.primary_venue_id = changes.primary_venue_id ?? null

    const { error: updateMemberErr } = await supabaseAdmin
      .from('team_members')
      .update(teamUpdates)
      .eq('id', memberId)

    if (updateMemberErr) {
      throw new Error(`Team member update failed: ${updateMemberErr.message}`)
    }

    // Update profiles.full_name if user_id exists
    if (targetUserId && changes.full_name !== undefined) {
      await supabaseAdmin
        .from('profiles')
        .update({ full_name: changes.full_name.trim() || null })
        .eq('id', targetUserId)
    }

    // Update roles
    if (changes.role_ids !== undefined) {
      await supabaseAdmin.from('team_member_roles').delete().eq('team_member_id', memberId)
      if (changes.role_ids.length > 0) {
        const roleRows = changes.role_ids.map((roleId, idx) => ({
          team_member_id: memberId,
          role_id: roleId,
          is_primary: idx === 0,
        }))
        const { error: roleErr } = await supabaseAdmin
          .from('team_member_roles')
          .insert(roleRows)
        if (roleErr) {
          throw new Error(`Role update failed: ${roleErr.message}`)
        }
      }
    }

    // Update venues
    if (changes.venue_ids !== undefined) {
      const primaryId = changes.primary_venue_id ?? changes.venue_ids[0] ?? null
      await supabaseAdmin.from('team_member_venues').delete().eq('team_member_id', memberId)
      if (changes.venue_ids.length > 0) {
        const venueRows = changes.venue_ids.map((venueId) => ({
          team_member_id: memberId,
          venue_id: venueId,
          is_primary: venueId === primaryId,
        }))
        const { error: venueErr } = await supabaseAdmin
          .from('team_member_venues')
          .insert(venueRows)
        if (venueErr) {
          throw new Error(`Venue update failed: ${venueErr.message}`)
        }
      }
    }

    // STEP 7: Create Audit Logs (consolidate into single entry if multiple fields)
    if (auditEntries.length > 0) {
      const mergedOld: Record<string, unknown> = {}
      const mergedNew: Record<string, unknown> = {}
      for (const e of auditEntries) {
        Object.assign(mergedOld, e.old_data)
        Object.assign(mergedNew, e.new_data)
      }
      const { error: auditErr } = await supabaseAdmin.from('organisation_audit_logs').insert({
        organisation_id: organisationId,
        user_id: actorId,
        table_name: 'team_members',
        record_id: memberId,
        action: 'UPDATE',
        old_data: mergedOld,
        new_data: mergedNew,
      })
      if (auditErr) {
        console.error('[team-member-actions] Audit log failed:', auditErr)
      }
    }

    // STEP 8: Hierarchy notifications (if hierarchy or status changed)
    const newLevel = (changes.hierarchy_level ?? oldData.hierarchy_level) as string
    const newStatus = changes.status ?? oldData.status
    const hierarchyChanged = changes.hierarchy_level !== undefined
    const statusChanged = changes.status !== undefined

    if ((hierarchyChanged || statusChanged) && targetUserId) {
      let changeType: 'promoted' | 'demoted' | 'activated' | 'deactivated' | 'joined' = 'joined'
      if (statusChanged) {
        changeType = newStatus === 'active' ? 'activated' : 'deactivated'
      } else if (hierarchyChanged) {
        const oldRank = HIERARCHY_RANK[(oldData.hierarchy_level as HierarchyLevel) ?? 'worker']
        const newRank = HIERARCHY_RANK[(newLevel as HierarchyLevel) ?? 'worker']
        changeType = newRank > oldRank ? 'promoted' : 'demoted'
      }

      const { data: actorProfile } = await supabaseAdmin
        .from('profiles')
        .select('full_name')
        .eq('id', actorId)
        .single()

      const targetProfile = { full_name: currentMember.full_name ?? 'Team member' }

      notifyHierarchyChange(
        organisationId,
        actorId,
        targetUserId,
        changeType,
        (oldData.hierarchy_level as string) ?? 'worker',
        newLevel,
        targetProfile.full_name,
        (actorProfile?.full_name as string) ?? 'A manager'
      ).catch((err) => console.error('[updateTeamMemberComplete] notifyHierarchyChange:', err))
    }

    // STEP 9: Revalidate Cache
    revalidatePath(`/dashboard/workers/${targetUserId}`)
    revalidatePath('/dashboard/workers')
    revalidatePath('/dashboard/team')

    return {
      success: true,
      auditEntries: auditEntries.length,
      message: `Updated ${currentMember.full_name || 'member'} successfully`,
    }
  } catch (error) {
    console.error('[updateTeamMemberComplete] error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    }
  }
}
