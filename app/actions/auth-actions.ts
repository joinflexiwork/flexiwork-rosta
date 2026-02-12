'use server'

import { createClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { redirect } from 'next/navigation'

/** Sign out the current user and redirect to login. Works even when other data fetching fails. */
export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/auth/login')
}

export type GeneratePasswordResetResult = {
  success: boolean
  resetLink?: string
  error?: string
}

/**
 * Generate a password reset link for a worker (admin only).
 * Caller must be employer or GM of the organisation.
 * Returns the link to share with the worker; does NOT send email.
 */
export async function generatePasswordResetLink(
  email: string,
  organisationId: string
): Promise<GeneratePasswordResetResult> {
  const supabaseUser = await createClient()
  const { data: { user } } = await supabaseUser.auth.getUser()
  if (!user) {
    return { success: false, error: 'Not authenticated' }
  }

  const supabaseAdmin = getSupabaseAdmin()

  // Verify caller is employer or GM of this org
  const { data: org } = await supabaseAdmin
    .from('organisations')
    .select('owner_id')
    .eq('id', organisationId)
    .single()

  if (org?.owner_id === user.id) {
    // Caller is owner - allowed
  } else {
    const { data: member } = await supabaseAdmin
      .from('team_members')
      .select('hierarchy_level')
      .eq('user_id', user.id)
      .eq('organisation_id', organisationId)
      .eq('status', 'active')
      .maybeSingle()

    const level = (member?.hierarchy_level as string)?.toLowerCase()
    if (!['gm', 'employer'].includes(level ?? '')) {
      return { success: false, error: 'Only organisation owner or GM can reset passwords' }
    }
  }

  const trimmedEmail = email?.trim()?.toLowerCase()
  if (!trimmedEmail) {
    return { success: false, error: 'Email is required' }
  }

  try {
    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email: trimmedEmail,
    })

    if (error) {
      if (error.message?.toLowerCase().includes('user not found')) {
        return { success: false, error: 'No auth account exists for this email. Run the SQL fix (FIX_AUTH_USER_GEZA.sql) first.' }
      }
      return { success: false, error: error.message }
    }

    const link = (data as { properties?: { action_link?: string } })?.properties?.action_link
      ?? (data as { action_link?: string })?.action_link
    if (!link) {
      return { success: false, error: 'Failed to generate reset link' }
    }

    return { success: true, resetLink: link }
  } catch (err) {
    console.error('[generatePasswordResetLink]', err)
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
