import { supabase } from '@/lib/supabase'

export type AuditAction =
  | 'INSERT'
  | 'UPDATE'
  | 'DELETE'
  | 'INVITE_SENT'
  | 'ROLE_CHANGED'
  | 'SHIFT_ASSIGNED'

export interface LogActionParams {
  organisationId: string
  tableName: string
  recordId: string
  action: AuditAction
  oldData?: Record<string, unknown> | null
  newData?: Record<string, unknown> | null
  metadata?: Record<string, unknown>
}

/** Log one organisation-scoped audit event. Does not throw so it does not break the main flow. */
export async function logAction(params: LogActionParams): Promise<void> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    const metadata: Record<string, unknown> = {
      ...params.metadata,
      timestamp: new Date().toISOString(),
    }
    if (typeof navigator !== 'undefined') {
      metadata.user_agent = navigator.userAgent
    }

    const { error } = await supabase.from('organisation_audit_logs').insert({
      organisation_id: params.organisationId,
      user_id: user.id,
      table_name: params.tableName,
      record_id: params.recordId,
      action: params.action,
      old_data: params.oldData ?? null,
      new_data: params.newData ?? null,
      metadata,
    })

    if (error) {
      console.error('[auditService] logAction error:', error)
    }
  } catch (e) {
    console.error('[auditService] logAction exception:', e)
  }
}

export interface AuditFilters {
  tableName?: string
  recordId?: string
  action?: string
  userId?: string
  dateFrom?: string
  dateTo?: string
}

export interface AuditLogEntry {
  id: string
  organisation_id: string
  user_id: string | null
  table_name: string
  record_id: string
  action: string
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
  metadata: Record<string, unknown> | null
  created_at: string
  user?: {
    full_name: string | null
    email: string | null
    avatar_url: string | null
  } | null
}

export interface GetAuditLogsResult {
  logs: AuditLogEntry[]
  total: number
  page: number
  totalPages: number
}

/** Fetch audit logs for an organisation (Employer/GM/AGM). RLS enforces visibility. */
export async function getAuditLogs(
  organisationId: string,
  filters?: AuditFilters,
  pagination?: { page: number; limit: number }
): Promise<GetAuditLogsResult> {
  let query = supabase
    .from('organisation_audit_logs')
    .select('*', { count: 'exact' })
    .eq('organisation_id', organisationId)
    .order('created_at', { ascending: false })

  if (filters?.tableName) {
    query = query.eq('table_name', filters.tableName)
  }
  if (filters?.recordId) {
    query = query.eq('record_id', filters.recordId)
  }
  if (filters?.action) {
    query = query.eq('action', filters.action)
  }
  if (filters?.userId) {
    query = query.eq('user_id', filters.userId)
  }
  if (filters?.dateFrom) {
    const from = filters.dateFrom.includes('T') ? filters.dateFrom : `${filters.dateFrom}T00:00:00.000Z`
    query = query.gte('created_at', from)
  }
  if (filters?.dateTo) {
    const to = filters.dateTo.includes('T') ? filters.dateTo : `${filters.dateTo}T23:59:59.999Z`
    query = query.lte('created_at', to)
  }

  const limit = pagination?.limit ?? 20
  const page = pagination?.page ?? 1
  const from = (page - 1) * limit
  const to = from + limit - 1

  const { data, error, count } = await query.range(from, to)

  if (error) throw new Error(error.message)

  const rows = (data ?? []) as Omit<AuditLogEntry, 'user'>[]
  const total = count ?? 0

  const userIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean) as string[])]
  let profileMap: Record<string, { full_name: string | null; email: string | null; avatar_url: string | null }> = {}
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, email, avatar_url')
      .in('id', userIds)
    for (const p of profiles ?? []) {
      const row = p as { id: string; full_name?: string | null; email?: string | null; avatar_url?: string | null }
      profileMap[row.id] = {
        full_name: row.full_name ?? null,
        email: row.email ?? null,
        avatar_url: row.avatar_url ?? null,
      }
    }
  }

  const logs: AuditLogEntry[] = rows.map((r) => ({
    ...r,
    user: r.user_id ? profileMap[r.user_id] ?? null : null,
  }))

  return {
    logs,
    total,
    page,
    totalPages: Math.ceil(total / limit) || 1,
  }
}
