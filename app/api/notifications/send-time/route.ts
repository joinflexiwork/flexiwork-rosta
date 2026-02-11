import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

const FROM = (process.env.RESEND_FROM ?? 'FlexiWork Rosta <onboarding@resend.dev>').trim()

function buildTimeSubmittedHtml(opts: { managerName?: string; workerName: string; approvalsUrl: string }) {
  const { workerName, approvalsUrl } = opts
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Time submitted for approval</title></head>
<body style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f9fafb;padding:24px;">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,0.1);padding:24px;">
    <h2 style="margin:0 0 16px;color:#111;">Time submitted for approval</h2>
    <p style="margin:0 0 20px;color:#374151;line-height:1.5;">
      <strong>${escapeHtml(workerName)}</strong> has submitted clock-in/clock-out times for your review.
    </p>
    <p style="margin:0 0 24px;text-align:center;">
      <a href="${escapeHtml(approvalsUrl)}" style="display:inline-block;background:linear-gradient(135deg,#3b82f6 0%,#8b5cf6 100%);color:#fff;text-decoration:none;font-weight:600;padding:12px 24px;border-radius:8px;">Review submissions</a>
    </p>
    <p style="margin:0;color:#6b7280;font-size:13px;">FlexiWork Rosta – Manual time approvals</p>
  </div>
</body>
</html>`.trim()
}

function buildTimeReviewedHtml(opts: { workerName?: string; action: string; notes?: string | null; appUrl: string }) {
  const { action, notes, appUrl } = opts
  const actionLabel = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'modified'
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Your time has been ${actionLabel}</title></head>
<body style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f9fafb;padding:24px;">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,0.1);padding:24px;">
    <h2 style="margin:0 0 16px;color:#111;">Your time has been ${actionLabel}</h2>
    <p style="margin:0 0 20px;color:#374151;line-height:1.5;">
      Your submitted clock-in/clock-out times have been <strong>${actionLabel}</strong> by your manager.
      ${notes ? `<br><br>Note: ${escapeHtml(notes)}` : ''}
    </p>
    <p style="margin:0 0 24px;text-align:center;">
      <a href="${escapeHtml(appUrl)}" style="display:inline-block;background:linear-gradient(135deg,#3b82f6 0%,#8b5cf6 100%);color:#fff;text-decoration:none;font-weight:600;padding:12px 24px;border-radius:8px;">View timesheets</a>
    </p>
    <p style="margin:0;color:#6b7280;font-size:13px;">FlexiWork Rosta</p>
  </div>
</body>
</html>`.trim()
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export async function POST(request: Request) {
  try {
    const apiKey = (process.env.RESEND_API_KEY ?? '').trim()
    if (!apiKey) {
      return NextResponse.json({ sent: false, reason: 'RESEND_API_KEY not set' }, { status: 200 })
    }

    const body = await request.json().catch(() => ({}))
    const { type, recordId, timekeepingId, shiftId, action, notes } = body as {
      type?: string
      recordId?: string
      timekeepingId?: string
      shiftId?: string
      action?: string
      notes?: string | null
    }

    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').trim()
    const approvalsUrl = `${baseUrl.replace(/\/$/, '')}/dashboard/timekeeping?tab=approvals`
    const employeeUrl = `${baseUrl.replace(/\/$/, '')}/employee/timesheets`

    const supabase = getSupabaseAdmin()

    if (type === 'time_submitted' && (recordId || timekeepingId) && shiftId) {
      const tkId = recordId ?? timekeepingId
      const { data: rec } = await supabase
        .from('timekeeping_records')
        .select('id, rota_shift_id, team_member:team_members(user_id, profile:profiles!team_members_user_id_fkey(full_name))')
        .eq('id', tkId)
        .single()

      if (!rec) return NextResponse.json({ sent: false, reason: 'Record not found' }, { status: 200 })
      const teamMember = (rec as { team_member?: { user_id?: string; profile?: { full_name?: string } } })?.team_member
      const workerName = teamMember?.profile?.full_name ?? 'A worker'

      const shiftIdVal = (rec as { rota_shift_id?: string }).rota_shift_id ?? shiftId
      const { data: shiftRow } = await supabase.from('rota_shifts').select('venue_id').eq('id', shiftIdVal).single()
      const venueId = (shiftRow as { venue_id?: string } | null)?.venue_id
      if (!venueId) return NextResponse.json({ sent: false, reason: 'Venue not found' }, { status: 200 })
      const { data: venueRow } = await supabase.from('venues').select('organisation_id').eq('id', venueId).single()
      const orgId = (venueRow as { organisation_id?: string } | null)?.organisation_id
      if (!orgId) return NextResponse.json({ sent: false, reason: 'Organisation not found' }, { status: 200 })
      const { data: orgRow } = await supabase.from('organisations').select('owner_id').eq('id', orgId).single()
      const ownerId = (orgRow as { owner_id?: string } | null)?.owner_id
      if (!ownerId) return NextResponse.json({ sent: false, reason: 'No manager' }, { status: 200 })
      const { data: ownerProfile } = await supabase.from('profiles').select('email').eq('id', ownerId).single()
      const to = (ownerProfile as { email?: string } | undefined)?.email
      if (!to) return NextResponse.json({ sent: false, reason: 'Manager has no email' }, { status: 200 })

      const resend = new Resend(apiKey)
      const { error } = await resend.emails.send({
        from: FROM,
        to,
        subject: 'Time submitted for approval – FlexiWork Rosta',
        html: buildTimeSubmittedHtml({ workerName, approvalsUrl }),
      })
      if (error) {
        console.error('[send-time] Resend error:', error)
        return NextResponse.json({ sent: false, error: error.message }, { status: 200 })
      }
      return NextResponse.json({ sent: true })
    }

    if ((type === 'time_approved' || type === 'time_rejected' || type === 'time_modified') && (recordId || timekeepingId)) {
      const tkId = recordId ?? timekeepingId
      const { data: rec } = await supabase
        .from('timekeeping_records')
        .select('team_member:team_members(user_id)')
        .eq('id', tkId)
        .single()

      if (!rec) return NextResponse.json({ sent: false, reason: 'Record not found' }, { status: 200 })
      const teamMember = (rec as any).team_member
      const userId = teamMember?.user_id
      if (!userId) return NextResponse.json({ sent: false, reason: 'Worker not found' }, { status: 200 })

      const { data: workerProfile } = await supabase.from('profiles').select('email, full_name').eq('id', userId).single()
      const to = (workerProfile as { email?: string } | undefined)?.email
      if (!to) return NextResponse.json({ sent: false, reason: 'Worker has no email' }, { status: 200 })

      const act = action ?? (type === 'time_approved' ? 'approve' : type === 'time_rejected' ? 'reject' : 'modify')
      const resend = new Resend(apiKey)
      const { error } = await resend.emails.send({
        from: FROM,
        to,
        subject: `Your time has been ${act === 'approve' ? 'approved' : act === 'reject' ? 'rejected' : 'modified'} – FlexiWork Rosta`,
        html: buildTimeReviewedHtml({ action: act, notes, appUrl: employeeUrl }),
      })
      if (error) {
        console.error('[send-time] Resend error:', error)
        return NextResponse.json({ sent: false, error: error.message }, { status: 200 })
      }
      return NextResponse.json({ sent: true })
    }

    return NextResponse.json({ sent: false, reason: 'Invalid type or missing ids' }, { status: 400 })
  } catch (e) {
    console.error('[send-time]', e)
    return NextResponse.json({ sent: false, error: String(e) }, { status: 500 })
  }
}
