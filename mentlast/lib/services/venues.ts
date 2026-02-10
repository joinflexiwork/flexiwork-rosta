import { supabase } from '@/lib/supabase'
import type { Venue } from '@/lib/types'

export async function createVenue(data: {
  organisation_id: string
  name: string
  address?: string
}) {
  const { data: venue, error } = await supabase
    .from('venues')
    .insert(data)
    .select()
    .single()

  if (error) throw new Error(error.message)
  if (!venue) throw new Error('No data returned from insert')
  return venue as Venue
}

export async function getVenuesByOrg(organisationId: string) {
  const { data, error } = await supabase
    .from('venues')
    .select('*')
    .eq('organisation_id', organisationId)
    .eq('is_active', true)
    .order('name')

  if (error) throw new Error(error.message)
  return (data ?? []) as Venue[]
}

export async function updateVenue(id: string, updates: Partial<Venue>) {
  const { data, error } = await supabase
    .from('venues')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data as Venue
}

export async function deleteVenue(id: string) {
  const { error } = await supabase
    .from('venues')
    .update({ is_active: false })
    .eq('id', id)

  if (error) throw new Error(error.message)
}
