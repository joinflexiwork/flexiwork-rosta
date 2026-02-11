'use server'

import { createClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export type IntegrityResult = {
  orphanedProfiles: Array<{ id: string; email: string | null; full_name: string | null }>
  pendingTeamMembers: Array<{ id: string; email: string | null; full_name: string | null; invite_code: string | null }>
  ghostAuthUsers: Array<{ id: string; email: string | null }>
  error?: string
}

/**
 * Admin-only: Fetch data integrity stats.
 * Caller must be organisation owner.
 */
export async function getDataIntegrity(): Promise<IntegrityResult> {
  const supabaseUser = await createClient()
  const { data: { user } } = await supabaseUser.auth.getUser()
  if (!user) {
    return { orphanedProfiles: [], pendingTeamMembers: [], ghostAuthUsers: [], error: 'Not authenticated' }
  }

  const supabaseAdmin = getSupabaseAdmin()

  // Verify caller is org owner (admin)
  const { data: org } = await supabaseAdmin
    .from('organisations')
    .select('id')
    .eq('owner_id', user.id)
    .limit(1)
    .maybeSingle()

  if (!org) {
    return { orphanedProfiles: [], pendingTeamMembers: [], ghostAuthUsers: [], error: 'Only organisation owners can access this page' }
  }

  try {
    // 1. Profiles without auth users (orphaned)
    const { data: profiles } = await supabaseAdmin
      .from('profiles')
      .select('id, email, full_name')

    const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers()

    const authUserIds = new Set((authUsers?.users ?? []).map((u) => u.id))
    const orphanedProfiles = (profiles ?? []).filter((p) => !authUserIds.has(p.id))

    // 2. Team members without user_id (pending invites)
    const { data: pendingMembers } = await supabaseAdmin
      .from('team_members')
      .select('id, email, full_name, invite_code')
      .is('user_id', null)
      .eq('status', 'pending')

    // 3. Auth users without profiles (ghost users)
    const profileIds = new Set((profiles ?? []).map((p) => p.id))
    const ghostAuthUsers = (authUsers?.users ?? []).filter((u) => !profileIds.has(u.id))

    return {
      orphanedProfiles: orphanedProfiles.map((p) => ({ id: p.id, email: p.email ?? null, full_name: p.full_name ?? null })),
      pendingTeamMembers: (pendingMembers ?? []).map((p) => ({
        id: p.id,
        email: p.email ?? null,
        full_name: p.full_name ?? null,
        invite_code: p.invite_code ?? null,
      })),
      ghostAuthUsers: ghostAuthUsers.map((u) => ({ id: u.id, email: u.email ?? null })),
    }
  } catch (err) {
    console.error('[getDataIntegrity]', err)
    return {
      orphanedProfiles: [],
      pendingTeamMembers: [],
      ghostAuthUsers: [],
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}
