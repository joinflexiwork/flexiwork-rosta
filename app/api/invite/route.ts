import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

function generateInviteCode() {
  return (Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)).toUpperCase()
}

function buildInviteEmailHtml(opts: {
  inviteeEmail: string
  inviterName?: string
  organisationName?: string
  role: string
  acceptUrl: string
}) {
  const { inviteeEmail, inviterName, organisationName, role, acceptUrl } = opts
  const roleLabel = role === 'manager' ? 'Manager' : 'Team member'
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>You're invited to FlexiWork Rosta</title>
</head>
<body style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f9fafb;padding:24px;">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,0.1);overflow:hidden;">
    <div style="background:linear-gradient(135deg,#3b82f6 0%,#8b5cf6 100%);padding:28px 24px;text-align:center;">
      <h1 style="margin:0;color:#fff;font-size:24px;font-weight:700;">FlexiWork Rosta</h1>
      <p style="margin:8px 0 0;color:rgba(255,255,255,0.9);font-size:14px;">Workforce scheduling made simple</p>
    </div>
    <div style="padding:28px 24px;">
      <p style="margin:0 0 16px;color:#374151;font-size:16px;line-height:1.5;">Hi${inviteeEmail ? ` ${inviteeEmail.split('@')[0]}` : ''},</p>
      <p style="margin:0 0 20px;color:#374151;font-size:16px;line-height:1.5;">
        You've been invited to join${organisationName ? ` <strong>${organisationName}</strong>` : ' the team'} as a <strong>${roleLabel}</strong>.
        ${inviterName ? `The invite was sent by ${inviterName}.` : ''}
      </p>
      <p style="margin:0 0 24px;color:#374151;font-size:16px;line-height:1.5;">
        Click the button below to create your account and accept the invite. This link expires in 48 hours.
      </p>
      <p style="margin:0 0 24px;text-align:center;">
        <a href="${acceptUrl}" style="display:inline-block;background:linear-gradient(135deg,#3b82f6 0%,#8b5cf6 100%);color:#fff;text-decoration:none;font-weight:600;font-size:16px;padding:14px 28px;border-radius:8px;">Accept invitation</a>
      </p>
      <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.5;">
        If the button doesn't work, copy and paste this link into your browser:<br>
        <a href="${acceptUrl}" style="color:#6366f1;word-break:break-all;">${acceptUrl}</a>
      </p>
    </div>
    <div style="padding:16px 24px;background:#f9fafb;border-top:1px solid #e5e7eb;">
      <p style="margin:0;color:#9ca3af;font-size:12px;">FlexiWork Rosta – Invite</p>
    </div>
  </div>
</body>
</html>
  `.trim()
}

export async function POST(request: Request) {
  try {
    // Debug: env vars are read inside the route handler (required in Next.js App Router)
    console.log('[Invite API] POST called - checking env vars:')
    console.log('[Invite API] RESEND_API_KEY present:', !!process.env.RESEND_API_KEY)
    console.log('[Invite API] RESEND_API_KEY value starts with:', process.env.RESEND_API_KEY?.substring(0, 10) ?? '(undefined)')
    console.log('[Invite API] RESEND_FROM present:', !!process.env.RESEND_FROM)
    console.log('[Invite API] RESEND_FROM value:', process.env.RESEND_FROM ?? '(undefined)')

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { error: 'SUPABASE_SERVICE_ROLE_KEY not found in .env.local' },
        { status: 500 }
      )
    }

    const body = await request.json()
    const { email, fullName, orgId, orgName, inviterName, role, venueIds, role_ids, primary_venue_id, employment_type } = body as {
      email: string
      fullName: string
      orgId: string
      orgName: string
      inviterName?: string
      role?: 'employee' | 'manager'
      venueIds?: string[]
      role_ids?: string[]
      primary_venue_id?: string
      employment_type?: 'full_time' | 'part_time'
    }

    if (!email?.trim() || !orgId) {
      return NextResponse.json({ error: 'email and orgId are required' }, { status: 400 })
    }

    const inviteCode = generateInviteCode()
    const raw = (process.env.NEXT_PUBLIC_APP_URL ?? '').trim()
    const baseUrl =
      raw && raw.toLowerCase() !== 'null' && (raw.startsWith('http://') || raw.startsWith('https://'))
        ? raw
        : 'http://localhost:3000'

    const memberType = role === 'manager' ? 'manager' : 'employee'
    const redirectTo =
      memberType === 'employee'
        ? `${baseUrl}/accept-invite?code=${inviteCode}&type=team`
        : `${baseUrl}/accept-invite?code=${inviteCode}`

    let supabaseAdmin: ReturnType<typeof getSupabaseAdmin>
    try {
      supabaseAdmin = getSupabaseAdmin()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[Invite API] Supabase admin failed:', msg)
      return NextResponse.json(
        { error: 'Database configuration error. Set SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL in .env.local' },
        { status: 500 }
      )
    }

    const employment = employment_type ?? (memberType === 'manager' ? 'full_time' : 'part_time')
    const primaryVenue = primary_venue_id ?? (venueIds?.length ? venueIds[0] : null)

    const { data: teamMember, error: dbError } = await supabaseAdmin
      .from('team_members')
      .insert({
        organisation_id: orgId,
        user_id: null,
        member_type: memberType,
        employment_type: employment,
        status: 'pending',
        primary_venue_id: primaryVenue || null,
        invite_code: inviteCode,
        email: email?.trim() || null,
        full_name: fullName?.trim() || null,
      })
      .select()
      .single()

    if (dbError) {
      console.error('[Invite API] team_members insert error:', dbError)
      return NextResponse.json({ error: dbError.message || 'Failed to create invite record' }, { status: 500 })
    }

    if (venueIds?.length) {
      const venueRows = venueIds.map((venueId: string) => ({
        team_member_id: teamMember.id,
        venue_id: venueId,
        is_primary: venueId === primaryVenue,
      }))
      await supabaseAdmin.from('team_member_venues').insert(venueRows)
    }

    if (role_ids?.length) {
      const roleRows = role_ids.map((roleId: string, idx: number) => ({
        team_member_id: teamMember.id,
        role_id: roleId,
        is_primary: idx === 0,
      }))
      await supabaseAdmin.from('team_member_roles').insert(roleRows)
    }

    const apiKey = (process.env.RESEND_API_KEY ?? '').trim()
    const fromAddress = (process.env.RESEND_FROM ?? 'FlexiWork Rosta <onboarding@resend.dev>').trim()

    console.log('[Invite API] After trim - apiKey length:', apiKey.length, 'fromAddress length:', fromAddress.length, 'will use Resend:', !!(apiKey && fromAddress))

    if (apiKey && fromAddress) {
      try {
        const resend = new Resend(apiKey)
        const html = buildInviteEmailHtml({
          inviteeEmail: email.trim(),
          inviterName: inviterName || undefined,
          organisationName: orgName || undefined,
          role: memberType,
          acceptUrl: redirectTo,
        })
        const { error: resendError } = await resend.emails.send({
          from: fromAddress,
          to: email.trim(),
          subject: `You're invited to join ${orgName || 'FlexiWork Rosta'}`,
          html,
        })
        if (resendError) {
          console.error('[Invite API] Resend error:', resendError)
          return NextResponse.json({
            success: true,
            teamMember,
            message: 'Invite created. Email could not be sent. Share this link manually:',
            manualLink: redirectTo,
          })
        }
        return NextResponse.json({ success: true, teamMember, message: `Invite sent to ${email}` })
      } catch (resendErr: unknown) {
        console.error('[Invite API] Resend exception:', resendErr)
        return NextResponse.json({
          success: true,
          teamMember,
          message: 'Invite created. Email could not be sent. Share this link manually:',
          manualLink: redirectTo,
        })
      }
    }

    console.log('[Invite API] Using fallback: RESEND not configured (apiKey or RESEND_FROM missing). Returning manualLink.')
    return NextResponse.json({
      success: true,
      teamMember,
      message: 'Invite created. Set RESEND_API_KEY and RESEND_FROM to send emails. Share this link manually:',
      manualLink: redirectTo,
    })
  } catch (err: unknown) {
    console.error('[Invite API] error:', err)
    const message = err instanceof Error ? err.message : 'Failed to send invite'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
