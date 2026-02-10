import { supabase } from '../supabase'
import type { ShiftAllocationRow, TimekeepingRecordRow } from '../types'

export async function getMyShifts(userId: string): Promise<ShiftAllocationRow[]> {
  const { data: tm, error: tmError } = await supabase
    .from('team_members')
    .select('id')
    .eq('user_id', userId)

  if (tmError) throw new Error(tmError.message)
  if (!tm || tm.length === 0) return []

  const teamMemberIds = tm.map((t) => t.id)

  const { data, error } = await supabase
    .from('shift_allocations')
    .select(`
      *,
      shift:rota_shifts(
        id,
        shift_date,
        start_time,
        end_time,
        venue:venues(id, name, address),
        role:roles(id, name, colour)
      )
    `)
    .in('team_member_id', teamMemberIds)
    .in('status', ['allocated', 'confirmed', 'in_progress'])
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []) as ShiftAllocationRow[]
}

export async function clockIn(params: {
  rota_shift_id: string
  team_member_id: string
  venue_id: string
  location?: string
}): Promise<TimekeepingRecordRow> {
  const { data: record, error } = await supabase
    .from('timekeeping_records')
    .insert({
      rota_shift_id: params.rota_shift_id,
      team_member_id: params.team_member_id,
      venue_id: params.venue_id,
      clock_in: new Date().toISOString(),
      clock_in_location: params.location,
      status: 'pending',
    })
    .select()
    .single()

  if (error) throw new Error(error.message)

  await supabase
    .from('shift_allocations')
    .update({ status: 'in_progress' })
    .eq('rota_shift_id', params.rota_shift_id)
    .eq('team_member_id', params.team_member_id)

  return record as TimekeepingRecordRow
}

export async function clockOut(params: {
  timekeeping_record_id: string
  location?: string
}): Promise<TimekeepingRecordRow> {
  const { data: record, error } = await supabase
    .from('timekeeping_records')
    .update({
      clock_out: new Date().toISOString(),
      clock_out_location: params.location,
    })
    .eq('id', params.timekeeping_record_id)
    .select()
    .single()

  if (error) throw new Error(error.message)
  if (!record) throw new Error('Timekeeping record not found')

  await supabase
    .from('shift_allocations')
    .update({ status: 'completed' })
    .eq('rota_shift_id', record.rota_shift_id)
    .eq('team_member_id', record.team_member_id)

  return record as TimekeepingRecordRow
}

export async function getActiveTimekeeping(
  userId: string
): Promise<TimekeepingRecordRow | null> {
  const { data: tm, error: tmError } = await supabase
    .from('team_members')
    .select('id')
    .eq('user_id', userId)
    .single()

  if (tmError || !tm) return null

  const { data, error } = await supabase
    .from('timekeeping_records')
    .select('*')
    .eq('team_member_id', tm.id)
    .is('clock_out', null)
    .order('clock_in', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data as TimekeepingRecordRow | null
}
