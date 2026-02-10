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
