'use client'

import React, { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, User } from 'lucide-react'
import { getAuditLogs, type AuditLogEntry, type AuditFilters } from '@/lib/services/auditService'

const ACTION_LABELS: Record<string, string> = {
  INSERT: 'Created',
  UPDATE: 'Updated',
  DELETE: 'Deleted',
  INVITE_SENT: 'Invite sent',
  ROLE_CHANGED: 'Role changed',
  SHIFT_ASSIGNED: 'Shift assigned',
}

const TABLE_LABELS: Record<string, string> = {
  team_members: 'Team members',
  rota_shifts: 'Shifts',
  invites: 'Invites',
  shift_invites: 'Shift invites',
  shift_allocations: 'Allocations',
  venues: 'Venues',
  organisation_audit_logs: 'Audit',
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('en-GB', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function displayName(entry: AuditLogEntry): string {
  const u = entry.user
  if (u?.full_name?.trim()) return u.full_name.trim()
  if (u?.email) return u.email
  return '—'
}

function description(entry: AuditLogEntry): string {
  const msg = entry.metadata && typeof entry.metadata === 'object' && 'message' in entry.metadata
    ? String((entry.metadata as { message?: string }).message ?? '')
    : ''
  if (msg.trim()) return msg.trim()
  const actionLabel = ACTION_LABELS[entry.action] ?? entry.action
  const tableLabel = TABLE_LABELS[entry.table_name] ?? entry.table_name
  return `${actionLabel} · ${tableLabel}`
}

type Props = {
  organisationId: string
  /** List of team members for the "user" filter dropdown (id, profile.full_name or email). */
  teamMembersForFilter?: { id: string; label: string }[]
  /** Only render if user is allowed to see audit (employer/gm/agm). Caller should hide entire section otherwise. */
  canView: boolean
}

export default function AuditLogViewer({
  organisationId,
  teamMembersForFilter = [],
  canView,
}: Props) {
  const [logs, setLogs] = useState<AuditLogEntry[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** Draft filter values (what the inputs show). */
  const [draftFilters, setDraftFilters] = useState<AuditFilters>({})
  /** Applied filters (what we actually query with). Set when user clicks Filter. */
  const [appliedFilters, setAppliedFilters] = useState<AuditFilters>({})
  const limit = 20

  useEffect(() => {
    if (!canView || !organisationId) {
      setLoading(false)
      setError(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    getAuditLogs(organisationId, appliedFilters, { page, limit })
      .then((res) => {
        if (cancelled) return
        setLogs(res.logs)
        setTotal(res.total)
        setTotalPages(res.totalPages)
      })
      .catch((err) => {
        if (!cancelled) {
          setLogs([])
          setTotal(0)
          setTotalPages(1)
          setError(err instanceof Error ? err.message : 'Failed to load audit log')
          console.error('[AuditLogViewer] getAuditLogs error:', err)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [organisationId, canView, page, limit, appliedFilters.tableName, appliedFilters.action, appliedFilters.userId, appliedFilters.dateFrom, appliedFilters.dateTo])

  if (!canView) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 text-center text-gray-600">
        You don&apos;t have permission to view the audit log.
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden text-gray-900">
      <div className="p-4 border-b border-gray-100">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Audit log</h2>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">From date</label>
            <input
              type="date"
              value={draftFilters.dateFrom ?? ''}
              onChange={(e) =>
                setDraftFilters((f) => ({ ...f, dateFrom: e.target.value || undefined }))
              }
              className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">To date</label>
            <input
              type="date"
              value={draftFilters.dateTo ?? ''}
              onChange={(e) =>
                setDraftFilters((f) => ({ ...f, dateTo: e.target.value || undefined }))
              }
              className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Action</label>
            <select
              value={draftFilters.action ?? ''}
              onChange={(e) =>
                setDraftFilters((f) => ({ ...f, action: e.target.value || undefined }))
              }
              className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white"
            >
              <option value="">All</option>
              {Object.entries(ACTION_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          {teamMembersForFilter.length > 0 && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">User</label>
              <select
                value={draftFilters.userId ?? ''}
                onChange={(e) =>
                  setDraftFilters((f) => ({ ...f, userId: e.target.value || undefined }))
                }
                className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white min-w-[160px]"
              >
                <option value="">All</option>
                {teamMembersForFilter.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              setAppliedFilters({ ...draftFilters })
              setPage(1)
            }}
            className="px-3 py-1.5 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700"
          >
            Filter
          </button>
        </div>
      </div>

      {error ? (
        <div className="p-8 text-center text-red-600">
          <p className="font-medium">{error}</p>
          <p className="text-sm mt-1">Check the console for details.</p>
        </div>
      ) : loading ? (
        <div className="p-8 text-center text-gray-500">Loading...</div>
      ) : logs.length === 0 ? (
        <div className="p-12 text-center text-gray-500">
          <p className="mb-1">No entries</p>
          <p className="text-sm">No audit log entries match the current filters.</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left py-3 px-4 font-medium text-gray-700">When</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-700">Who</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-700">Action</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-700">Description</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-700 w-24">Details</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((entry) => {
                  const hasDetails =
                    (entry.old_data && Object.keys(entry.old_data).length > 0) ||
                    (entry.new_data && Object.keys(entry.new_data).length > 0)
                  const isExpanded = expandedId === entry.id
                  const hasOld = entry.old_data && Object.keys(entry.old_data).length > 0
                  const hasNew = entry.new_data && Object.keys(entry.new_data).length > 0
                  return (
                    <React.Fragment key={entry.id}>
                      <tr
                        className="border-b border-gray-100 hover:bg-gray-50/50"
                      >
                        <td className="py-3 px-4 text-gray-600 whitespace-nowrap">
                          {formatDate(entry.created_at)}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <span className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
                              {entry.user?.avatar_url ? (
                                <img
                                  src={entry.user.avatar_url}
                                  alt=""
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <User className="w-4 h-4 text-purple-600" />
                              )}
                            </span>
                            <span className="font-medium text-gray-900">
                              {displayName(entry)}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                            {ACTION_LABELS[entry.action] ?? entry.action}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-gray-700">
                          {description(entry)}
                        </td>
                        <td className="py-3 px-4">
                          {hasDetails ? (
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedId(isExpanded ? null : entry.id)
                              }
                              className="inline-flex items-center gap-1 text-purple-600 hover:text-purple-700 font-medium"
                            >
                              {isExpanded ? (
                                <>
                                  <ChevronDown className="w-4 h-4" />
                                  Collapse
                                </>
                              ) : (
                                <>
                                  <ChevronRight className="w-4 h-4" />
                                  Details
                                </>
                              )}
                            </button>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr key={`expanded-${entry.id}`}>
                          <td colSpan={5} className="bg-gray-50 p-4 border-b border-gray-200">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                              {hasOld && (
                                <div>
                                  <p className="font-medium text-gray-700 mb-2">Old values</p>
                                  <pre className="bg-white border border-gray-200 rounded-lg p-3 overflow-auto max-h-48 text-xs">
                                    {JSON.stringify(entry.old_data, null, 2)}
                                  </pre>
                                </div>
                              )}
                              {hasNew && (
                                <div>
                                  <p className="font-medium text-gray-700 mb-2">New values</p>
                                  <pre className="bg-white border border-gray-200 rounded-lg p-3 overflow-auto max-h-48 text-xs">
                                    {JSON.stringify(entry.new_data, null, 2)}
                                  </pre>
                                </div>
                              )}
                              {!hasOld && !hasNew && (
                                <p className="text-gray-500">No diff data.</p>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50">
              <p className="text-sm text-gray-600">
                Total {total} entries
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm disabled:opacity-50 hover:bg-gray-100"
                >
                  Previous
                </button>
                <span className="px-2 py-1.5 text-sm text-gray-700">
                  {page} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm disabled:opacity-50 hover:bg-gray-100"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
