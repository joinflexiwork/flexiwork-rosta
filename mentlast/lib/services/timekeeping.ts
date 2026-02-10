import { supabase } from '@/lib/supabase'
import type { TimekeepingRecord } from '@/lib/types'

export async function clockIn(data: {
  rota_shift_id: string
  team_member_id: string
  venue_id: string
  location?: string
}) {
  const { data: record, error } = await supabase
    .from('timekeeping_records')
    .insert({
      rota_shift_id: data.rota_shift_id,
      team_member_id: data.team_member_id,
      venue_id: data.venue_id,
      clock_in: new Date().toISOString(),
      clock_in_location: data.location,
      status: 'pending',
    })
    .select()
    .single()

  if (error) throw new Error(error.message)

  await supabase
    .from('shift_allocations')
    .update({ status: 'in_progress' })
    .eq('rota_shift_id', data.rota_shift_id)
    .eq('team_member_id', data.team_member_id)

  return record as TimekeepingRecord
}

export async function clockOut(data: {
  timekeeping_record_id: string
  location?: string
}) {
  const { data: record, error } = await supabase
    .from('timekeeping_records')
    .update({
      clock_out: new Date().toISOString(),
      clock_out_location: data.location,
    })
    .eq('id', data.timekeeping_record_id)
    .select()
    .single()

  if (error) throw new Error(error.message)
  if (!record) throw new Error('Timekeeping record not found')

  await supabase
    .from('shift_allocations')
    .update({ status: 'completed' })
    .eq('rota_shift_id', record.rota_shift_id)
    .eq('team_member_id', record.team_member_id)

  return record as TimekeepingRecord
}

export async function getPendingTimesheets(venueId: string) {
  const { data, error } = await supabase
    .from('timekeeping_records')
    .select(`
      *,
      team_member:team_members(
        id,
        employment_type,
        profile:profiles(full_name, worker_status)
      ),
      shift:rota_shifts(
        id,
        shift_date,
        start_time,
        end_time,
        role:roles(name)
      ),
      venue:venues(id, name)
    `)
    .eq('venue_id', venueId)
    .eq('status', 'pending')
    .not('clock_out', 'is', null)
    .order('clock_out', { ascending: false })

  if (error) throw new Error(error.message)
  return (data || []) as Record<string, unknown>[]
}

export async function approveTimesheet(id: string) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data, error } = await supabase
    .from('timekeeping_records')
    .update({
      status: 'approved',
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data as TimekeepingRecord
}

export async function requestTimesheetEdit(id: string, notes: string) {
  const { data, error } = await supabase
    .from('timekeeping_records')
    .update({
      status: 'disputed',
      notes,
    })
    .eq('id', id)
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data as TimekeepingRecord
}

export async function getMyTimekeeping(userId: string) {
  const { data: tm } = await supabase
    .from('team_members')
    .select('id')
    .eq('user_id', userId)

  if (!tm || tm.length === 0) return []
  const teamMemberIds = tm.map((t) => t.id)

  const { data, error } = await supabase
    .from('timekeeping_records')
    .select(`
      *,
      shift:rota_shifts(
        shift_date,
        start_time,
        end_time,
        role:roles(name),
        venue:venues(name)
      )
    `)
    .in('team_member_id', teamMemberIds)
    .order('clock_in', { ascending: false })
    .limit(50)

  if (error) throw new Error(error.message)
  return (data || []) as Record<string, unknown>[]
}
