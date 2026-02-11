'use server'

import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { revalidatePath } from 'next/cache'

// ============================================
// TYPES
// ============================================

export interface OnboardingStep2Data {
  organisationName: string
  companyAddress?: string
  taxId?: string
}

export interface OnboardingStep3Data {
  firstInviteEmail?: string
  firstInvitePosition?: 'employer' | 'gm' | 'agm'
}

export interface OnboardingResult {
  success: boolean
  organisationId?: string
  error?: string
  step?: 'auth' | 'organisation' | 'profile' | 'invite'
}

// ============================================
// STEP 2: ATOMIC TENANT CREATION
// ============================================

/**
 * Creates organisation with owner assignment.
 * Trigger auto-creates team_members (employer) and audit log.
 */
export async function createTenantWithOwner(
  userId: string,
  orgData: OnboardingStep2Data
): Promise<OnboardingResult> {
  const supabase = getSupabaseAdmin()

  try {
    if (!orgData.organisationName || orgData.organisationName.trim().length < 2) {
      throw new Error('Organisation name must be at least 2 characters')
    }

    const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()

    const { data: organisation, error: orgError } = await supabase
      .from('organisations')
      .insert({
        name: orgData.organisationName.trim(),
        owner_id: userId,
        company_address: orgData.companyAddress?.trim() || null,
        tax_id: orgData.taxId?.trim() || null,
        subscription_status: 'trial',
        trial_ends_at: trialEndsAt,
        onboarding_completed: false,
      })
      .select('id, name, owner_id')
      .single()

    if (orgError) {
      console.error('Organisation creation error:', orgError)
      throw new Error(`Failed to create organisation: ${orgError.message}`)
    }

    if (!organisation) {
      throw new Error('Organisation creation returned no data')
    }

    // Verify trigger created team_members record; fallback insert if trigger missed
    let { data: teamMember, error: tmError } = await supabase
      .from('team_members')
      .select('id, hierarchy_level')
      .eq('organisation_id', organisation.id)
      .eq('user_id', userId)
      .maybeSingle()

    if (tmError || !teamMember) {
      // Fallback: trigger may not exist for pre-migration orgs; insert manually
      const { error: insertError } = await supabase.from('team_members').insert({
        organisation_id: organisation.id,
        user_id: userId,
        hierarchy_level: 'employer',
        employment_type: 'full_time',
        status: 'active',
      })

      if (insertError) {
        await supabase.from('organisations').delete().eq('id', organisation.id)
        throw new Error('Failed to create owner team membership. Organisation rolled back.')
      }

      const { data: inserted } = await supabase
        .from('team_members')
        .select('id, hierarchy_level')
        .eq('organisation_id', organisation.id)
        .eq('user_id', userId)
        .maybeSingle()
      teamMember = inserted
    }

    if (!teamMember || teamMember.hierarchy_level !== 'employer') {
      await supabase.from('organisations').delete().eq('id', organisation.id)
      throw new Error(`Team member hierarchy mismatch. Expected employer, got ${teamMember?.hierarchy_level}`)
    }

    revalidatePath('/dashboard')
    revalidatePath('/onboarding')

    return {
      success: true,
      organisationId: organisation.id,
    }
  } catch (error) {
    console.error('createTenantWithOwner error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create organisation',
      step: 'organisation',
    }
  }
}

// ============================================
// STEP 3: COMPLETE ONBOARDING & OPTIONAL INVITE
// ============================================

export async function completeOnboarding(
  userId: string,
  organisationId: string,
  step3Data?: OnboardingStep3Data
): Promise<OnboardingResult> {
  const supabase = getSupabaseAdmin()

  try {
    const { error: updateError } = await supabase
      .from('organisations')
      .update({
        onboarding_completed: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', organisationId)
      .eq('owner_id', userId)

    if (updateError) {
      throw new Error(`Failed to complete onboarding: ${updateError.message}`)
    }

    if (step3Data?.firstInviteEmail?.trim() && step3Data?.firstInvitePosition) {
      const { createInvite } = await import('./invite-actions')
      const inviteResult = await createInvite(
        step3Data.firstInviteEmail.trim(),
        step3Data.firstInvitePosition,
        organisationId
      )
      if (!inviteResult.success) {
        console.warn('First invite failed (non-critical):', inviteResult.error)
      }
    }

    // Welcome notification
    try {
      await supabase.from('notifications').insert({
        organisation_id: organisationId,
        actor_id: null,
        recipient_id: userId,
        category: 'system',
        event_type: 'onboarding_completed',
        title: 'Welcome to FlexiWork Rosta!',
        body: 'Your organisation is ready. You can now invite team members and create shifts.',
        priority: 'normal',
        action_link: '/dashboard/team',
      })
    } catch (notifErr) {
      console.warn('Welcome notification failed (non-critical):', notifErr)
    }

    revalidatePath('/dashboard')
    revalidatePath('/onboarding')

    return { success: true, organisationId }
  } catch (error) {
    console.error('completeOnboarding error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to complete onboarding',
      step: 'invite',
    }
  }
}

// ============================================
// VALIDATION: Check onboarding status
// ============================================

export async function checkOnboardingStatus(userId: string): Promise<{
  hasOrganisation: boolean
  onboardingCompleted: boolean
  organisationId?: string
}> {
  const supabase = getSupabaseAdmin()

  const { data: org } = await supabase
    .from('organisations')
    .select('id, onboarding_completed')
    .eq('owner_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!org) {
    return { hasOrganisation: false, onboardingCompleted: false }
  }

  return {
    hasOrganisation: true,
    onboardingCompleted: org.onboarding_completed ?? false,
    organisationId: org.id,
  }
}
