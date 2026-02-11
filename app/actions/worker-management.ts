'use server'

import { createClient } from '@/lib/supabase-server'
import { canEditTarget, getAllowedLevels } from '@/lib/permissions/hierarchy'
import type { HierarchyLevel } from '@/lib/types/hierarchy'
import { updateTeamMemberProfile } from '@/lib/services/team'
import { logAction } from '@/lib/services/auditService'
import { createNotification } from '@/app/actions/notifications'

type Result = { success: true } | { success: false; error: string }

async function getCurrentUserLevel(orgId: string): Promise<{ level: HierarchyLevel } | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: member } = await supabase
    .from('team_members')
    .select('hierarchy_level')
    .eq('organisation_id', orgId)
    .eq('user_id', user.id)
    .maybeSingle()

  const level = (member as { hierarchy_level?: string } | null)?.hierarchy_level as HierarchyLevel | undefined
  return level ? { level: level as HierarchyLevel } : null
}

async function getTargetMember(targetId: string, orgId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('team_members')
    .select('id, organisation_id, hierarchy_level, user_id')
    .eq('id', targetId)
    .eq('organisation_id', orgId)
    .single()
  if (error || !data) return null
  return data as { id: string; organisation_id: string; hierarchy_level?: string; user_id?: string }
}

/**
 * Update a worker's hierarchy level. Checks permission (can only assign levels below current user).
 */
export async function updateWorkerHierarchy(
  targetId: string,
  newLevel: HierarchyLevel,
  orgId: string
): Promise<Result> {
  try {
    const current = await getCurrentUserLevel(orgId)
    if (!current) return { success: false, error: 'Not authenticated' }

    const target = await getTargetMember(targetId, orgId)
    if (!target) return { success: false, error: 'Team member not found' }

    const targetLevel = (target.hierarchy_level || 'worker') as HierarchyLevel
    if (!canEditTarget(current.level, targetLevel)) {
      return { success: false, error: 'You cannot edit this worker' }
    }

    const allowed = getAllowedLevels(current.level).filter((l) => l !== 'employer')
    if (!allowed.includes(newLevel)) {
      return { success: false, error: `You cannot assign level: ${newLevel}` }
    }

    await updateTeamMemberProfile(targetId, { hierarchy_level: newLevel })

    await logAction({
      organisationId: orgId,
      tableName: 'team_members',
      recordId: targetId,
      action: 'UPDATE',
      oldData: { hierarchy_level: targetLevel },
      newData: { hierarchy_level: newLevel },
    })

    if (target.user_id) {
      await createNotification(
        orgId,
        target.user_id,
        'hierarchy_changed',
        'Role updated',
        `Your role has been updated to ${newLevel}.`,
        { memberId: targetId, newLevel }
      ).catch(() => {})
    }

    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Failed to update' }
  }
}

/**
 * Update a worker's roles. Max 5 roles. Checks permission.
 */
export async function updateWorkerRoles(
  targetId: string,
  roles: string[],
  orgId: string
): Promise<Result> {
  try {
    if (roles.length > 5) return { success: false, error: 'Maximum 5 roles allowed' }

    const current = await getCurrentUserLevel(orgId)
    if (!current) return { success: false, error: 'Not authenticated' }

    const target = await getTargetMember(targetId, orgId)
    if (!target) return { success: false, error: 'Team member not found' }

    const targetLevel = (target.hierarchy_level || 'worker') as HierarchyLevel
    if (!canEditTarget(current.level, targetLevel)) {
      return { success: false, error: 'You cannot edit this worker' }
    }

    await updateTeamMemberProfile(targetId, { role_ids: roles })

    await logAction({
      organisationId: orgId,
      tableName: 'team_members',
      recordId: targetId,
      action: 'ROLE_CHANGED',
      newData: { role_ids: roles },
    })

    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Failed to update roles' }
  }
}

/**
 * Deactivate a worker (soft delete: status = inactive). Checks permission.
 */
export async function deactivateWorker(targetId: string, orgId: string): Promise<Result> {
  try {
    const current = await getCurrentUserLevel(orgId)
    if (!current) return { success: false, error: 'Not authenticated' }

    const target = await getTargetMember(targetId, orgId)
    if (!target) return { success: false, error: 'Team member not found' }

    const targetLevel = (target.hierarchy_level || 'worker') as HierarchyLevel
    if (!canEditTarget(current.level, targetLevel)) {
      return { success: false, error: 'You cannot edit this worker' }
    }

    if (current.level !== 'employer' && current.level !== 'gm') {
      return { success: false, error: 'Only employer or GM can deactivate workers' }
    }

    await updateTeamMemberProfile(targetId, { status: 'inactive' })

    await logAction({
      organisationId: orgId,
      tableName: 'team_members',
      recordId: targetId,
      action: 'UPDATE',
      oldData: { status: 'active' },
      newData: { status: 'inactive' },
    })

    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Failed to deactivate' }
  }
}
