import { supabase } from '@/lib/supabase'
import type { Organisation } from '@/lib/types'

export async function createOrganisation(data: {
  name: string
  business_reg_number?: string
  industry?: string
  billing_email?: string
}) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated - please log in again')

  const { data: org, error } = await supabase
    .from('organisations')
    .insert({
      owner_id: user.id,
      ...data,
    })
    .select()
    .single()

  if (error) throw new Error(error.message)
  if (!org) throw new Error('No data returned from insert')
  return org as Organisation
}

export async function getMyOrganisations() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: owned, error: ownedError } = await supabase
    .from('organisations')
    .select('*')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false })

  if (ownedError) throw new Error(ownedError.message)
  if (owned && owned.length > 0) return owned as Organisation[]

  try {
    const { data: managerRows, error: managerError } = await supabase
      .from('team_members')
      .select('organisation_id')
      .eq('user_id', user.id)
      .eq('member_type', 'manager')
      .eq('status', 'active')
      .limit(1)

    if (managerError || !managerRows?.length) return []

    const { data: org, error: orgError } = await supabase
      .from('organisations')
      .select('*')
      .eq('id', managerRows[0].organisation_id)
      .maybeSingle()

    if (orgError || !org) return []
    return [org as Organisation]
  } catch {
    return []
  }
}

/** Returns the organisation id the current user can access (as owner or manager). */
export async function getOrganisationIdForCurrentUser(): Promise<string | null> {
  try {
    const orgs = await getMyOrganisations()
    return orgs[0]?.id ?? null
  } catch {
    return null
  }
}

export async function updateOrganisation(id: string, updates: Partial<Organisation>) {
  const { data, error } = await supabase
    .from('organisations')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data as Organisation
}
