import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

function generateShiftInviteCode(): string {
  return (Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10)).toUpperCase()
}

/**
 * POST /api/shift-invites
 * Creates shift_invites using service role (bypasses RLS). Call from dashboard when inviting PT workers to a shift.
 * Body: { rota_shift_id, team_member_ids: string[], invited_by: string }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { rota_shift_id, team_member_ids, invited_by } = body as {
      rota_shift_id?: string
      team_member_ids?: string[]
      invited_by?: string
    }

    if (!rota_shift_id?.trim() || !Array.isArray(team_member_ids) || team_member_ids.length === 0 || !invited_by?.trim()) {
      return NextResponse.json(
        { error: 'rota_shift_id, team_member_ids (non-empty array), and invited_by are required' },
        { status: 400 }
      )
    }

    const supabaseAdmin = getSupabaseAdmin()
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()

    const invites = team_member_ids.map((team_member_id: string) => ({
      rota_shift_id: rota_shift_id.trim(),
      team_member_id,
      invited_by: invited_by.trim(),
      status: 'pending',
      expires_at: expiresAt,
      invite_code: generateShiftInviteCode(),
    }))

    const { data: createdInvites, error } = await supabaseAdmin
      .from('shift_invites')
      .insert(invites)
      .select()

    if (error) {
      console.error('[API shift-invites]', error.message, { code: (error as { code?: string }).code, details: (error as { details?: string }).details })
      const code = (error as { code?: string }).code
      if (code === '23505') {
        return NextResponse.json(
          { error: 'One or more of these employees were already invited to this shift.' },
          { status: 400 }
        )
      }
      if (code === '23503') {
        return NextResponse.json(
          { error: 'Invalid shift or team member. You can only invite team members from your organisation.' },
          { status: 400 }
        )
      }
      return NextResponse.json(
        { error: error.message || 'Failed to create shift invites' },
        { status: 400 }
      )
    }

    return NextResponse.json(createdInvites)
  } catch (err: unknown) {
    console.error('[API shift-invites]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create shift invites' },
      { status: 500 }
    )
  }
}
