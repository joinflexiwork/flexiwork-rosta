import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { createNotification } from '@/app/actions/notification-actions'

/** user_type for newly created profiles when accepting a team invite */
const INVITE_PROFILE_USER_TYPE = 'employee'

/**
 * POST /api/invite/accept
 * Uses service role to ensure profile exists (bypassing RLS) then updates team_members.
 * Call after signUp so team_members.user_id FK to profiles(id) is satisfied.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { inviteCode, userId, fullName, email, employmentType } = body as {
      inviteCode: string
      userId: string
      fullName?: string
      email?: string
      employmentType?: string
    }

    if (!inviteCode?.trim() || !userId?.trim()) {
      return NextResponse.json(
        { error: 'inviteCode and userId are required' },
        { status: 400 }
      )
    }

    const supabaseAdmin = getSupabaseAdmin()

    // 1. Ensure profile row exists (service role bypasses RLS).
    // If profile already exists (e.g. from a previous attempt), only update safe fields so we don't
    // overwrite user_type with a value that might fail the DB check constraint.
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .maybeSingle()

    if (existingProfile) {
      const { error: updateError } = await supabaseAdmin
        .from('profiles')
        .update({
          full_name: fullName ?? null,
          email: email?.trim() ?? null,
          worker_status: 'inactive',
        })
        .eq('id', userId)
      if (updateError) {
        console.error('[Invite Accept API] profile update (existing) error:', updateError.message, updateError.details, updateError.code)
        return NextResponse.json(
          { error: updateError.message ?? 'Failed to update profile' },
          { status: 500 }
        )
      }
    } else {
      const { error: insertError } = await supabaseAdmin
        .from('profiles')
        .insert({
          id: userId,
          user_type: INVITE_PROFILE_USER_TYPE,
          full_name: fullName ?? null,
          email: email?.trim() ?? null,
          worker_status: 'inactive',
        })
      if (insertError) {
        console.error('[Invite Accept API] profile insert error:', insertError.message, insertError.details, insertError.code)
        return NextResponse.json(
          { error: insertError.message ?? 'Failed to create profile' },
          { status: 500 }
        )
      }
    }

    // 2. Update team_members: link user, set invite_status, onboarded_at, optional employment_type
    const updatePayload: Record<string, unknown> = {
      user_id: userId,
      status: 'active',
      joined_at: new Date().toISOString(),
      invite_status: 'accepted',
      onboarded_at: new Date().toISOString(),
    }
    if (employmentType && ['full-time', 'part-time', 'gig', 'full_time', 'part_time'].includes(employmentType)) {
      updatePayload.employment_type = employmentType
    }
    const { data: teamMember, error: updateError } = await supabaseAdmin
      .from('team_members')
      .update(updatePayload)
      .eq('invite_code', inviteCode.trim().toUpperCase())
      .eq('status', 'pending')
      .select()
      .single()

    if (updateError) {
      console.error('[Invite Accept API] team_members update error:', updateError)
      return NextResponse.json(
        { error: updateError.message ?? 'Failed to accept invite' },
        { status: 400 }
      )
    }

    if (!teamMember) {
      return NextResponse.json(
        { error: 'Invite not found or already used' },
        { status: 404 }
      )
    }

    // 3. If employee, set has_employee_profile on profile
    const memberType = (teamMember as { member_type?: string }).member_type
    if (memberType === 'employee') {
      await supabaseAdmin
        .from('profiles')
        .update({ has_employee_profile: true })
        .eq('id', userId)
    }

    // 4. If manager, create in-app notification (hierarchy)
    const organisationId = (teamMember as { organisation_id?: string }).organisation_id
    if (memberType === 'manager' && organisationId) {
      await createNotification({
        organisationId,
        actorId: null,
        recipientId: userId,
        category: 'hierarchy',
        eventType: 'manager_invite_received',
        title: 'Welcome as manager',
        body: 'You have accepted the manager invite. You can now access the dashboard.',
        priority: 'normal',
      })
    }

    return NextResponse.json({ teamMember })
  } catch (err: unknown) {
    console.error('[Invite Accept API] error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to accept invite' },
      { status: 500 }
    )
  }
}
