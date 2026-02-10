import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params
    const raw = (code ?? '').trim().toUpperCase()
    if (!raw) {
      return NextResponse.json({ error: 'Missing invite code' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const { data: invite, error } = await supabase
      .from('shift_invites')
      .select(
        `
        id,
        invite_code,
        status,
        expires_at,
        team_member:team_members(email),
        shift:rota_shifts(
          id,
          shift_date,
          start_time,
          end_time,
          venue:venues(id, name, address),
          role:roles(id, name),
          creator:profiles!rota_shifts_created_by_fkey(full_name)
        )
      `
      )
      .eq('invite_code', raw)
      .maybeSingle()

    if (error) {
      console.error('[Invite Shift API]', error)
      return NextResponse.json({ error: 'Failed to load invite' }, { status: 500 })
    }

    if (!invite || !invite.shift) {
      return NextResponse.json({ error: 'Invite not found or expired' }, { status: 404 })
    }

    const shift = invite.shift as unknown as {
      id: string
      shift_date: string
      start_time: string
      end_time: string
      venue?: { id: string; name: string; address?: string }
      role?: { id: string; name: string }
      creator?: { full_name?: string } | null
    }
    const teamMember = invite.team_member as { email?: string | null } | null
    const status = invite.status as string
    const expiresAt = invite.expires_at as string | null

    if (status !== 'pending') {
      return NextResponse.json(
        { error: 'This invite has already been accepted or declined', invite: null },
        { status: 410 }
      )
    }

    if (expiresAt && new Date(expiresAt) < new Date()) {
      return NextResponse.json(
        { error: 'This invite has expired', invite: null },
        { status: 410 }
      )
    }

    return NextResponse.json({
      invite: {
        id: invite.id,
        code: invite.invite_code,
        manager_name: shift.creator?.full_name ?? null,
        venue_name: shift.venue?.name ?? null,
        venue_address: shift.venue?.address ?? null,
        role_name: shift.role?.name ?? null,
        shift_date: shift.shift_date,
        start_time: shift.start_time,
        end_time: shift.end_time,
        expires_at: expiresAt,
        invited_email: teamMember?.email ?? null,
      },
    })
  } catch (err) {
    console.error('[Invite Shift API]', err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
