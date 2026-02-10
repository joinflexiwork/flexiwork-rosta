import { supabase } from '@/lib/supabase'
import type { RotaShift, RotaShiftWithDetails } from '@/lib/types'
import { publishRosterWeek as publishRosterWeekService } from '@/lib/services/rota-service'

export async function createRotaShift(data: {
  venue_id: string
  role_id: string
  shift_date: string
  start_time: string
  end_time: string
  headcount_needed: number
  notes?: string
}) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: shift, error } = await supabase
    .from('rota_shifts')
    .insert({
      ...data,
      created_by: user.id,
      status: 'draft',
    })
    .select()
    .single()

  if (error) throw new Error(error.message)
  return shift as RotaShift
}

export async function getWeeklyRota(params: {
  venue_id: string
  week_start: string
}) {
  const weekEnd = new Date(params.week_start)
  weekEnd.setDate(weekEnd.getDate() + 6)
  const weekEndStr = weekEnd.toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('rota_shifts')
    .select(`
      *,
      venue:venues(id, name, address),
      role:roles(id, name, colour),
      creator:profiles!rota_shifts_created_by_fkey(full_name),
      allocations:shift_allocations(
        *,
        team_member:team_members(
          id,
          employment_type,
          profile:profiles(full_name)
        )
      ),
      invites:shift_invites(
        *,
        team_member:team_members(
          id,
          employment_type,
          profile:profiles(full_name)
        )
      )
    `)
    .eq('venue_id', params.venue_id)
    .gte('shift_date', params.week_start)
    .lte('shift_date', weekEndStr)
    .order('shift_date')
    .order('start_time')

  if (error) throw error
  const list = data || []
  return list.map((shift: Record<string, unknown>) => ({
    ...shift,
    headcount_filled: Array.isArray(shift.allocations) ? shift.allocations.length : 0,
  })) as RotaShiftWithDetails[]
}

export async function publishRotaWeek(venue_id: string, week_start: string) {
  const { publishedCount } = await publishRosterWeekService(venue_id, week_start)
  return { publishedCount }
}

export async function updateRotaShift(id: string, updates: Partial<RotaShift>) {
  const { data, error } = await supabase
    .from('rota_shifts')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data as RotaShift
}

export async function deleteRotaShift(id: string) {
  const { error } = await supabase
    .from('rota_shifts')
    .delete()
    .eq('id', id)

  if (error) throw new Error(error.message)
}
