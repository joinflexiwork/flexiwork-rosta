import { supabase } from '@/lib/supabase'
import { getMyOrganisations } from '@/lib/services/organisations'

export type HierarchyLevel = 'employer' | 'gm' | 'agm' | 'shift_leader' | 'worker'

export type ProfilePageData = {
  userId: string
  profile: {
    firstName: string
    lastName: string
    fullName: string
    email: string
    phone: string | null
    avatarUrl: string | null
    address: string | null
  }
  hierarchyLevel: HierarchyLevel
  organisationId: string | null
  organisationName: string
  primaryVenueId: string | null
  primaryVenueName: string | null
  reportingTo: string
  memberSince: string | null
  teamMemberId: string | null
  isOwner: boolean
  venues: { id: string; name: string }[]
  organisation: {
    name: string
    company_address: string | null
    tax_id: string | null
    company_logo_url: string | null
  } | null
  /** True when no profile row existed (user must complete profile). */
  isNewProfile: boolean
}

/** Fetch all data needed for the unified profile page (all hierarchy levels). */
export async function getProfilePageData(): Promise<ProfilePageData | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const userId = user.id

  const { data: profileRow, error: profileErr } = await supabase
    .from('profiles')
    .select('full_name, email, avatar_url, phone, first_name, last_name, address')
    .eq('id', userId)
    .maybeSingle()

  const isNewProfile = profileErr != null || !profileRow
  const p = (profileRow ?? {}) as {
    full_name?: string
    email?: string
    avatar_url?: string | null
    phone?: string | null
    first_name?: string | null
    last_name?: string | null
    address?: string | null
  }
  const emailFromProfile = p.email ?? (user.email ?? '')

  const firstName = p.first_name?.trim() ?? ''
  const lastName = p.last_name?.trim() ?? ''
  const fullName = (p.full_name?.trim() || (firstName || lastName ? `${firstName} ${lastName}`.trim() : '') || '') as string

  let ownedOrg: {
    id: string
    name: string
    owner_id: string
    company_address?: string | null
    tax_id?: string | null
    company_logo_url?: string | null
  } | undefined

  const { data: orgs } = await supabase
    .from('organisations')
    .select('*')
    .eq('owner_id', userId)
    .limit(1)

  if (orgs?.[0]) {
    const row = orgs[0] as Record<string, unknown>
    ownedOrg = {
      id: row.id as string,
      name: (row.name as string) ?? '',
      owner_id: row.owner_id as string,
      company_address: (row.company_address as string | null) ?? null,
      tax_id: (row.tax_id as string | null) ?? null,
      company_logo_url: (row.company_logo_url as string | null) ?? null,
    }
  } else {
    // Fallback: RLS may hide owner's org in some setups; use getMyOrganisations (includes RPC fallback)
    try {
      const myOrgs = await getMyOrganisations()
      const asOwner = myOrgs.find((o) => (o as { owner_id?: string }).owner_id === userId)
      if (asOwner) {
        ownedOrg = {
          id: asOwner.id,
          name: asOwner.name ?? '',
          owner_id: (asOwner as { owner_id: string }).owner_id,
          company_address: (asOwner as { company_address?: string | null }).company_address ?? null,
          tax_id: (asOwner as { tax_id?: string | null }).tax_id ?? null,
          company_logo_url: (asOwner as { company_logo_url?: string | null }).company_logo_url ?? null,
        }
      }
    } catch {
      // ignore
    }
  }

  const { data: memberRows } = await supabase
    .from('team_members')
    .select(`
      id,
      organisation_id,
      hierarchy_level,
      primary_venue_id,
      joined_at,
      primary_venue:venues(id, name)
    `)
    .eq('user_id', userId)
    .in('status', ['active', 'pending'])
    .limit(1)

  const member = memberRows?.[0] as {
    id: string
    organisation_id: string
    hierarchy_level?: string
    primary_venue_id?: string | null
    joined_at?: string | null
    primary_venue?: { id: string; name: string } | null
  } | undefined

  let organisationId: string | null = ownedOrg?.id ?? member?.organisation_id ?? null
  let organisationName = ownedOrg?.name ?? ''
  // If user owns an org, they are always employer (hierarchy top); do not use team_members.hierarchy_level for them.
  let hierarchyLevel: HierarchyLevel = ownedOrg
    ? 'employer'
    : ((member?.hierarchy_level as HierarchyLevel) ?? 'worker')
  let primaryVenueId: string | null = member?.primary_venue_id ?? null
  let primaryVenueName: string | null = member?.primary_venue?.name ?? null
  let memberSince: string | null = member?.joined_at ?? null
  const teamMemberId: string | null = member?.id ?? null

  if (ownedOrg) {
    organisationId = ownedOrg.id
    organisationName = ownedOrg.name
  } else if (member) {
    const { data: orgRow } = await supabase
      .from('organisations')
      .select('*')
      .eq('id', member.organisation_id)
      .single()
    const o = orgRow as Record<string, unknown> | null
    organisationName = (o?.name as string) ?? ''
  }

  let reportingTo: string
  if (hierarchyLevel === 'employer') {
    reportingTo = '—'
  } else if (member) {
    reportingTo = '—'
    const { data: chainRows } = await supabase
      .from('management_chain')
      .select('manager_id')
      .eq('subordinate_id', member.id)
      .limit(1)
    const managerTmId = (chainRows?.[0] as { manager_id?: string } | undefined)?.manager_id
    if (managerTmId) {
      const { data: managerTm } = await supabase
        .from('team_members')
        .select('id, hierarchy_level, user_id')
        .eq('id', managerTmId)
        .single()
      const mg = managerTm as { hierarchy_level?: string; user_id?: string } | null
      const level = mg?.hierarchy_level
      let name = ''
      if (mg?.user_id) {
        const { data: profRow } = await supabase
          .from('profiles')
          .select('full_name, first_name, last_name')
          .eq('id', mg.user_id)
          .single()
        const prof = profRow as { full_name?: string; first_name?: string; last_name?: string } | null
        name = (prof?.full_name?.trim() || (prof?.first_name || prof?.last_name ? `${prof?.first_name ?? ''} ${prof?.last_name ?? ''}`.trim() : '') || '') as string
      }
      if (level === 'employer') reportingTo = name ? `Organization Owner (${name})` : 'Organization Owner'
      else reportingTo = name || 'Manager'
    }
  } else {
    reportingTo = '—'
  }

  let venues: { id: string; name: string }[] = []
  if (organisationId) {
    const { data: venueRows } = await supabase
      .from('venues')
      .select('id, name')
      .eq('organisation_id', organisationId)
      .eq('is_active', true)
      .order('name')
    venues = (venueRows ?? []).map((v) => ({ id: v.id, name: (v as { name: string }).name }))
  }

  let organisation: ProfilePageData['organisation'] = null
  if (ownedOrg && hierarchyLevel === 'employer') {
    organisation = {
      name: ownedOrg.name,
      company_address: ownedOrg.company_address ?? null,
      tax_id: ownedOrg.tax_id ?? null,
      company_logo_url: ownedOrg.company_logo_url ?? null,
    }
  } else if (member && organisationId) {
    const { data: orgRow } = await supabase
      .from('organisations')
      .select('*')
      .eq('id', organisationId)
      .single()
    const o = orgRow as Record<string, unknown> | null
    if (o) {
      organisation = {
        name: (o.name as string) ?? '',
        company_address: (o.company_address as string | null) ?? null,
        tax_id: (o.tax_id as string | null) ?? null,
        company_logo_url: (o.company_logo_url as string | null) ?? null,
      }
    }
  }

  return {
    userId,
    profile: {
      firstName,
      lastName,
      fullName,
      email: emailFromProfile,
      phone: p.phone ?? null,
      avatarUrl: p.avatar_url ?? null,
      address: p.address ?? null,
    },
    hierarchyLevel,
    organisationId,
    organisationName,
    primaryVenueId,
    primaryVenueName,
    reportingTo,
    memberSince,
    teamMemberId,
    isOwner: !!ownedOrg,
    venues,
    organisation,
    isNewProfile,
  }
}

/** Set primary venue for current user's team member (GM/AGM/Shift Leader). */
export async function setPrimaryVenue(teamMemberId: string, venueId: string | null): Promise<void> {
  const { error } = await supabase
    .from('team_members')
    .update({ primary_venue_id: venueId })
    .eq('id', teamMemberId)
  if (error) throw new Error(error.message)
}
