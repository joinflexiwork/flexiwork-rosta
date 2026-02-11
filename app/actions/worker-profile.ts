'use server'

import { createClient } from '@/lib/supabase-server'

/** Server action: update a worker's profile full_name. Checks permission via RLS. */
export async function updateWorkerProfileFullName(
  profileId: string,
  fullName: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: fullName.trim() || null })
      .eq('id', profileId)
    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Failed to update' }
  }
}
