import { supabase } from '@/lib/supabase'

/**
 * Publish all shifts for a venue in the given week (set status to 'published').
 * Returns the number of shifts updated.
 */
export async function publishRosterWeek(venueId: string, weekStartDate: string) {
  const start = new Date(weekStartDate)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)

  const startStr = start.toISOString().split('T')[0]
  const endStr = end.toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('rota_shifts')
    .update({ status: 'published', updated_at: new Date().toISOString() })
    .eq('venue_id', venueId)
    .gte('shift_date', startStr)
    .lte('shift_date', endStr)
    .select('id')

  if (error) throw new Error(error.message)
  return { publishedCount: data?.length ?? 0 }
}
