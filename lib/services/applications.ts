import { supabase } from '@/lib/supabase'

export type ApplicationRow = {
  id: string
  email: string
  hierarchy_level: string
  status: string
  created_at: string
  expires_at: string | null
  invited_by: string | null
  inviter_name?: string | null
}

/** Count pending invites (applications) for an organisation. Uses count for efficiency. */
export async function getPendingApplicationsCount(organisationId: string): Promise<number> {
  const { count, error } = await supabase
    .from('invites')
    .select('*', { count: 'exact', head: true })
    .eq('organisation_id', organisationId)
    .eq('status', 'pending')
  if (error) return 0
  return count ?? 0
}

/** Fetch org invites (applications) for the current user's organisation. */
export async function getApplicationsForOrg(organisationId: string): Promise<ApplicationRow[]> {
  const { data, error } = await supabase
    .from('invites')
    .select('id, email, hierarchy_level, status, created_at, expires_at, invited_by')
    .eq('organisation_id', organisationId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  const rows = (data ?? []) as ApplicationRow[]
  if (rows.length === 0) return []

  const inviterIds = [...new Set(rows.map((r) => r.invited_by).filter(Boolean))] as string[]
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', inviterIds)
  const nameMap = new Map((profiles ?? []).map((p) => [p.id, (p as { full_name?: string }).full_name]))

  return rows.map((r) => ({
    ...r,
    inviter_name: r.invited_by ? nameMap.get(r.invited_by) ?? null : null,
  }))
}
