import { supabase } from '@/lib/supabase'

export type OrganisationSettings = {
  show_ratings: boolean
  show_gig_features: boolean
  created_at?: string
  updated_at?: string
}

/** Fetch organisation settings. Returns defaults if no row exists (show_ratings: true, show_gig_features: false). */
export async function getOrganisationSettings(orgId: string): Promise<OrganisationSettings> {
  const { data, error } = await supabase
    .from('organisation_settings')
    .select('show_ratings, show_gig_features, created_at, updated_at')
    .eq('organisation_id', orgId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) return { show_ratings: true, show_gig_features: false }
  return {
    show_ratings: data.show_ratings ?? true,
    show_gig_features: data.show_gig_features ?? false,
    created_at: data.created_at,
    updated_at: data.updated_at,
  }
}

/** Update a specific setting. Creates row if missing. */
export async function updateOrganisationSetting(
  orgId: string,
  key: 'show_ratings' | 'show_gig_features',
  value: boolean
): Promise<void> {
  const payload =
    key === 'show_ratings'
      ? { organisation_id: orgId, show_ratings: value }
      : key === 'show_gig_features'
        ? { organisation_id: orgId, show_gig_features: value }
        : undefined
  if (!payload) throw new Error('Unknown setting key')

  const { error } = await supabase
    .from('organisation_settings')
    .upsert(payload, { onConflict: 'organisation_id' })

  if (error) throw new Error(error.message)
}

/** Update Gig Platform feature visibility. Default is false (hidden). */
export async function updateShowGigFeatures(orgId: string, value: boolean): Promise<void> {
  return updateOrganisationSetting(orgId, 'show_gig_features', value)
}
