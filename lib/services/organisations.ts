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

export async function getMyOrganisations(): Promise<Organisation[]> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const ownerId = user.id
  console.info('[getMyOrganisations] Querying organisations with owner_id:', ownerId, '(RLS uses auth.uid() which should match this when session is set)')

  const { data: owned, error: ownedError } = await supabase
    .from('organisations')
    .select('*')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false })

  if (ownedError) {
    console.warn('[getMyOrganisations] organisations query error:', ownedError.message, 'code:', ownedError.code)
    if (ownedError.code === '42P17' || (ownedError.message && ownedError.message.includes('recursion'))) {
      const { data: rpcOrgs, error: rpcError } = await supabase.rpc('get_my_organisations_rpc')
      if (!rpcError && rpcOrgs && Array.isArray(rpcOrgs) && rpcOrgs.length > 0) {
        return rpcOrgs as Organisation[]
      }
    }
    throw new Error(ownedError.message)
  }

  const ownedLength = owned?.length ?? 0
  console.info('[getMyOrganisations] Owner query result: rows=', ownedLength)
  if (owned && owned.length > 0) {
    return owned as Organisation[]
  }

  if (ownedLength === 0 && !ownedError) {
    console.warn('[getMyOrganisations] Owner query returned 0 rows — trying RPC fallback (RLS may be blocking). owner_id=', ownerId)
    const { data: rpcOrgs, error: rpcError } = await supabase.rpc('get_my_organisations_rpc')
    if (!rpcError && rpcOrgs && Array.isArray(rpcOrgs) && rpcOrgs.length > 0) {
      console.info('[getMyOrganisations] RPC fallback returned', rpcOrgs.length, 'org(s)')
      return rpcOrgs as Organisation[]
    }
    if (rpcError) {
      console.warn('[getMyOrganisations] RPC fallback error:', rpcError.message, '(function may not exist yet)')
    }
  }

  try {
    const { data: managerRows, error: managerError } = await supabase
      .from('team_members')
      .select('organisation_id')
      .eq('user_id', user.id)
      .eq('member_type', 'manager')
      .eq('status', 'active')
      .limit(1)

    if (managerError) {
      console.warn('[getMyOrganisations] manager team_members query error:', managerError.message)
    }
    if (managerError || !managerRows?.length) {
      return []
    }

    const { data: org, error: orgError } = await supabase
      .from('organisations')
      .select('*')
      .eq('id', managerRows[0].organisation_id)
      .maybeSingle()

    if (orgError) {
      console.warn('[getMyOrganisations] manager org fetch error:', orgError.message)
    }
    if (orgError || !org) {
      return []
    }
    return [org as Organisation]
  } catch (e) {
    console.warn('[getMyOrganisations] manager fallback failed:', e)
    return []
  }
}

/** Returns the organisation id the current user can access (as owner or manager). Prefers the org that has team members when user owns multiple. */
export async function getOrganisationIdForCurrentUser(): Promise<string | null> {
  try {
    const orgs = await getMyOrganisations()
    if (!orgs?.length) {
      console.warn('[getOrganisationIdForCurrentUser] no org found')
      return null
    }
    if (orgs.length === 1) {
      const id = orgs[0].id
      console.info('[getOrganisationIdForCurrentUser] single org:', id)
      return id
    }
    // Multiple orgs: prefer the one that has at least one team member
    const orgIds = orgs.map((o) => o.id)
    const { data: members } = await supabase
      .from('team_members')
      .select('organisation_id')
      .in('organisation_id', orgIds)
      .limit(100)
    const orgIdWithMembers = members?.[0]?.organisation_id as string | undefined
    const id = orgIdWithMembers ?? orgs[0].id
    console.info('[getOrganisationIdForCurrentUser] multi org, preferred (has members):', orgIdWithMembers ?? 'none', '-> returning:', id)
    return id
  } catch (e) {
    console.error('[getOrganisationIdForCurrentUser]', e instanceof Error ? e.message : e)
    return null
  }
}

/** True if the current user has any team_members record (invited employee/manager). */
export async function hasTeamMembership(): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data, error } = await supabase
    .from('team_members')
    .select('id')
    .eq('user_id', user.id)
    .limit(1)
  return !error && (data?.length ?? 0) > 0
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

const ORG_LOGO_BUCKET = 'organisation-logos'
const MAX_LOGO_SIZE = 2 * 1024 * 1024
const ALLOWED_LOGO_TYPES = ['image/jpeg', 'image/png']

/** Upload organisation logo and update organisations.company_logo_url. Requires bucket "organisation-logos" to exist. */
export async function uploadOrganisationLogo(organisationId: string, file: File): Promise<string> {
  if (file.size > MAX_LOGO_SIZE) throw new Error('File must be 2MB or smaller')
  if (!ALLOWED_LOGO_TYPES.includes(file.type)) throw new Error('Only JPEG and PNG are allowed')

  const ext = file.type === 'image/png' ? 'png' : 'jpg'
  const path = `orgs/${organisationId}.${ext}`

  const { error: uploadError } = await supabase.storage.from(ORG_LOGO_BUCKET).upload(path, file, {
    upsert: true,
    contentType: file.type,
  })
  if (uploadError) throw new Error(uploadError.message)

  const { data: urlData } = supabase.storage.from(ORG_LOGO_BUCKET).getPublicUrl(path)
  const publicUrl = urlData?.publicUrl ?? ''

  const { error: updateError } = await supabase
    .from('organisations')
    .update({ company_logo_url: publicUrl })
    .eq('id', organisationId)
  if (updateError) throw new Error(updateError.message)

  return publicUrl
}
