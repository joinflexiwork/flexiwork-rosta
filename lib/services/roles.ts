import { supabase } from '@/lib/supabase'
import type { Role } from '@/lib/types'

export async function createRole(data: {
  organisation_id: string
  name: string
  colour?: string
  description?: string
}) {
  const { data: role, error } = await supabase
    .from('roles')
    .insert({ ...data, is_active: true })
    .select()
    .single()

  if (error) throw new Error(error.message)
  if (!role) throw new Error('No data returned from insert')
  return role as Role
}

export async function getRolesByOrg(organisationId: string) {
  const { data, error } = await supabase
    .from('roles')
    .select('*')
    .eq('organisation_id', organisationId)
    .eq('is_active', true)
    .order('name')

  if (error) throw new Error(error.message)
  return (data ?? []) as Role[]
}

export async function updateRole(id: string, updates: Partial<Role>) {
  const { data, error } = await supabase
    .from('roles')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data as Role
}

/** Delete role. Fails if role is assigned to any active/published rota shift. */
export async function deleteRole(roleId: string): Promise<void> {
  const { data: allocations, error: allocErr } = await supabase
    .from('rota_shifts')
    .select('id')
    .eq('role_id', roleId)
    .in('status', ['draft', 'published', 'in_progress'])

  if (!allocErr && allocations && allocations.length > 0) {
    throw new Error('Cannot delete: role is assigned to active shifts.')
  }

  const { error: deleteErr } = await supabase.from('roles').delete().eq('id', roleId)
  if (deleteErr) throw new Error(deleteErr.message)
}
