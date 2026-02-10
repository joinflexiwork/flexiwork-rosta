import { supabase } from '@/lib/supabase'
import type { ShiftAllocation } from '@/lib/types'

export async function allocateEmployee(data: {
  rota_shift_id: string
  team_member_id: string
}) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: allocation, error } = await supabase
    .from('shift_allocations')
    .insert({
      rota_shift_id: data.rota_shift_id,
      team_member_id: data.team_member_id,
      allocation_type: 'direct',
      status: 'allocated',
      allocated_by: user.id,
    })
    .select()
    .single()

  if (error) throw new Error(error.message)
  return allocation as ShiftAllocation
}

export async function removeAllocation(id: string) {
  const { error } = await supabase
    .from('shift_allocations')
    .delete()
    .eq('id', id)

  if (error) throw new Error(error.message)
}

export async function getMyAllocatedShifts(userId: string) {
  const { data: tm } = await supabase
    .from('team_members')
    .select('id')
    .eq('user_id', userId)

  if (!tm || tm.length === 0) return []
  const teamMemberIds = tm.map((t) => t.id)

  const { data, error } = await supabase
    .from('shift_allocations')
    .select(`
      *,
      shift:rota_shifts(
        *,
        venue:venues(id, name, address),
        role:roles(id, name, colour)
      )
    `)
    .in('team_member_id', teamMemberIds)
    .in('status', ['allocated', 'confirmed', 'in_progress'])
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data || []) as Record<string, unknown>[]
}
