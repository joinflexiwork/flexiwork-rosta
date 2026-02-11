import { supabase } from '@/lib/supabase'
import type { ShiftAllocation } from '@/lib/types'
import { logAction } from '@/lib/services/auditService'

/** RPC row shape from get_worker_shifts / get_worker_shift_details */
export type WorkerShiftRpcRow = {
  shift_allocation_id: string
  rota_shift_id: string
  status: string | null
  venue_id: string | null
  venue_name: string | null
  venue_address: string | null
  role_id: string | null
  role_name: string | null
  shift_date: string
  shift_start_time: string
  shift_end_time: string
  allocated_by_user_id: string | null
  allocated_at: string | null
  organisation_name: string | null
}

/** Map RPC row to WorkerShiftAllocation-like shape for WorkerShiftCard */
export function mapWorkerShiftRpcToAllocation(row: WorkerShiftRpcRow): Record<string, unknown> {
  return {
    id: row.shift_allocation_id,
    rota_shift_id: row.rota_shift_id,
    status: row.status ?? 'allocated',
    shift: {
      id: row.rota_shift_id,
      shift_date: row.shift_date,
      start_time: row.shift_start_time,
      end_time: row.shift_end_time,
      venue_id: row.venue_id,
      venue: {
        id: row.venue_id,
        name: row.venue_name ?? '',
        address: row.venue_address ?? '',
        organisation: row.organisation_name ? { name: row.organisation_name } : null,
      },
      role: row.role_name ? { id: row.role_id, name: row.role_name } : null,
    },
  }
}

/** Worker shifts with full details (venue, role, times) via SECURITY DEFINER RPC — no RLS recursion */
export async function getWorkerShifts(userId: string): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase.rpc('get_worker_shifts', { p_user_id: userId })
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as WorkerShiftRpcRow[]
  return rows.map(mapWorkerShiftRpcToAllocation)
}

/** Single shift details for worker; only returns data if allocation belongs to current user */
export async function getWorkerShiftDetails(allocationId: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase.rpc('get_worker_shift_details', { p_allocation_id: allocationId })
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as WorkerShiftRpcRow[]
  if (rows.length === 0) return null
  return mapWorkerShiftRpcToAllocation(rows[0])
}

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
      confirmation_status: 'auto-confirmed',
    })
    .select()
    .single()

  if (error) throw new Error(error.message)
  const alloc = allocation as ShiftAllocation & { id: string }
  const { data: shiftRow } = await supabase
    .from('rota_shifts')
    .select('venue_id')
    .eq('id', data.rota_shift_id)
    .single()
  const venueId = (shiftRow as { venue_id?: string } | null)?.venue_id
  if (venueId) {
    const { data: venueRow } = await supabase
      .from('venues')
      .select('organisation_id')
      .eq('id', venueId)
      .single()
    const orgId = (venueRow as { organisation_id?: string } | null)?.organisation_id
    if (orgId) {
      await logAction({
        organisationId: orgId,
        tableName: 'shift_allocations',
        recordId: alloc.id,
        action: 'SHIFT_ASSIGNED',
        newData: {
          rota_shift_id: data.rota_shift_id,
          team_member_id: data.team_member_id,
        },
      })
    }
  }
  return allocation as ShiftAllocation
}

export async function removeAllocation(id: string) {
  const { data: allocation } = await supabase
    .from('shift_allocations')
    .select('id, rota_shift_id, team_member_id')
    .eq('id', id)
    .single()
  const orgId = allocation
    ? await getOrganisationIdForRotaShift((allocation as { rota_shift_id: string }).rota_shift_id)
    : null

  const { error } = await supabase
    .from('shift_allocations')
    .delete()
    .eq('id', id)

  if (error) throw new Error(error.message)

  if (orgId) {
    await logAction({
      organisationId: orgId,
      tableName: 'shift_allocations',
      recordId: id,
      action: 'DELETE',
      oldData: allocation as Record<string, unknown>,
      newData: null,
      metadata: { message: 'Shift allocation removed' },
    })
  }
}

async function getOrganisationIdForRotaShift(rotaShiftId: string): Promise<string | null> {
  const { data: shift } = await supabase
    .from('rota_shifts')
    .select('venue_id')
    .eq('id', rotaShiftId)
    .single()
  const venueId = (shift as { venue_id?: string } | null)?.venue_id
  if (!venueId) return null
  const { data: venue } = await supabase
    .from('venues')
    .select('organisation_id')
    .eq('id', venueId)
    .single()
  return (venue as { organisation_id?: string } | null)?.organisation_id ?? null
}

/** Get allocation id for a shift + worker (for replace/unallocate). */
export async function getShiftAllocationForWorker(
  rota_shift_id: string,
  team_member_id: string
): Promise<{ id: string } | null> {
  const { data, error } = await supabase
    .from('shift_allocations')
    .select('id')
    .eq('rota_shift_id', rota_shift_id)
    .eq('team_member_id', team_member_id)
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data as { id: string } | null
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
      id,
      rota_shift_id,
      team_member_id,
      allocation_type,
      status,
      allocated_by,
      allocated_at,
      shift:rota_shifts(
        id,
        shift_date,
        start_time,
        end_time,
        status,
        venue_id,
        role_id,
        venue:venues(id, name, address, organisation:organisations(id, name)),
        role:roles(id, name, colour)
      )
    `)
    .in('team_member_id', teamMemberIds)
    .in('status', ['allocated', 'confirmed', 'in_progress'])
    .order('allocated_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data || []) as Record<string, unknown>[]
}
