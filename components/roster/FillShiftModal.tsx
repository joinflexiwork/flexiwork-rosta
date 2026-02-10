'use client'

import { useState, useEffect, useCallback } from 'react'
import { X, Pencil, Trash2, UserMinus, UserPlus } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import {
  getRolesByOrg,
} from '@/lib/services/roles'
import {
  updateShift,
  deleteRotaShift,
  reallocateWorker,
} from '@/lib/services/rota'
import { getTeamMembers } from '@/lib/services/team'
import { allocateEmployee, removeAllocation } from '@/lib/services/allocations'
import {
  getPendingInvitesForShift,
  cancelShiftInvite,
  inviteEmployeesToShift,
  pullAvailableWorkers,
} from '@/lib/services/invites'
import InviteWorkerModal from '@/components/InviteWorkerModal'
import PullStaffModal from '@/components/PullStaffModal'

export type ShiftRow = Record<string, unknown> & {
  id: string
  shift_date?: string
  start_time?: string
  end_time?: string
  headcount_needed?: number
  headcount_filled?: number
  role_id?: string
  venue_id?: string
  role?: { id?: string; name?: string }
  venue?: { name?: string; address?: string; id?: string }
  creator?: { full_name?: string }
  allocations?: Array<{
    id: string
    team_member_id: string
    team_member?: { profile?: { full_name?: string }; employment_type?: string }
  }>
  invites?: Array<{
    id: string
    team_member_id: string
    status: string
    invited_at?: string
    team_member?: { profile?: { full_name?: string } }
  }>
}

export default function FillShiftModal({
  shift: initialShift,
  organisationId,
  onClose,
  onSuccess,
}: {
  shift: ShiftRow
  organisationId: string
  onClose: () => void
  onSuccess: () => void
}) {
  const [shift, setShift] = useState<ShiftRow>(initialShift)
  const [isEditMode, setIsEditMode] = useState(false)
  const [editForm, setEditForm] = useState({
    role_id: String(initialShift.role_id ?? (initialShift.role as { id?: string })?.id ?? ''),
    shift_date: String(initialShift.shift_date ?? ''),
    start_time: String(initialShift.start_time ?? '09:00'),
    end_time: String(initialShift.end_time ?? '17:00'),
    headcount_needed: Number(initialShift.headcount_needed ?? 1),
  })
  const [roles, setRoles] = useState<Record<string, unknown>[]>([])
  const [employees, setEmployees] = useState<Record<string, unknown>[]>([])
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([])
  const [view, setView] = useState<'allocate' | 'invite'>('allocate')
  const [loading, setLoading] = useState(true)
  const [savingEdit, setSavingEdit] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showReplaceForAllocationId, setShowReplaceForAllocationId] = useState<string | null>(null)
  const [pendingInvites, setPendingInvites] = useState<Record<string, unknown>[]>([])
  const [inviteResult, setInviteResult] = useState<{
    shift: Record<string, unknown>
    invites: { invite_code: string; team_member_id: string }[]
  } | null>(null)
  const [showInviteWorkerModal, setShowInviteWorkerModal] = useState(false)
  const [showPullStaffModal, setShowPullStaffModal] = useState(false)
  const [replaceSaving, setReplaceSaving] = useState(false)

  const role = shift.role as { id?: string; name?: string } | undefined
  const allocations = (shift.allocations ?? []) as ShiftRow['allocations']

  const loadPendingInvites = useCallback(async () => {
    try {
      const list = await getPendingInvitesForShift(String(shift.id))
      setPendingInvites(list)
    } catch (e) {
      console.error(e)
    }
  }, [shift.id])

  useEffect(() => {
    setShift(initialShift)
    setEditForm({
      role_id: String(initialShift.role_id ?? (initialShift.role as { id?: string })?.id ?? ''),
      shift_date: String(initialShift.shift_date ?? ''),
      start_time: String(initialShift.start_time ?? '09:00'),
      end_time: String(initialShift.end_time ?? '17:00'),
      headcount_needed: Number(initialShift.headcount_needed ?? 1),
    })
  }, [initialShift])

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [rolesData, employeesData] = await Promise.all([
          getRolesByOrg(organisationId),
          getTeamMembers(organisationId),
        ])
        if (!cancelled) {
          setRoles((rolesData ?? []) as Record<string, unknown>[])
          setEmployees((employeesData ?? []).filter((e: Record<string, unknown>) => e.status === 'active'))
        }
      } catch (e) {
        console.error('Load error', e)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [organisationId])

  useEffect(() => {
    loadPendingInvites()
  }, [loadPendingInvites])

  const isPastShift = shift.shift_date && new Date(shift.shift_date + 'T23:59:59') < new Date()
  const hasAllocatedWorker = allocations && allocations.length > 0

  const handleSaveEdit = async () => {
    const start = editForm.start_time
    const end = editForm.end_time
    if (end < start) {
      alert('End time must be after start time.')
      return
    }
    if (hasAllocatedWorker && (editForm.start_time !== shift.start_time || editForm.end_time !== shift.end_time || editForm.shift_date !== shift.shift_date)) {
      if (!confirm('Changing the shift time may affect the assigned worker. Continue?')) return
    }
    setSavingEdit(true)
    try {
      const updated = await updateShift(String(shift.id), {
        role_id: editForm.role_id,
        shift_date: editForm.shift_date,
        start_time: editForm.start_time,
        end_time: editForm.end_time,
        headcount_needed: editForm.headcount_needed,
      })
      setShift((prev) => ({ ...prev, ...updated }))
      setIsEditMode(false)
      onSuccess()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to update shift')
    } finally {
      setSavingEdit(false)
    }
  }

  const handleDeleteShift = async () => {
    if (isPastShift) {
      alert('Cannot delete a shift that is in the past.')
      return
    }
    setDeleting(true)
    try {
      await deleteRotaShift(String(shift.id))
      setShowDeleteConfirm(false)
      onSuccess()
      onClose()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to delete shift')
    } finally {
      setDeleting(false)
    }
  }

  const handleRemoveWorker = async (allocationId: string) => {
    try {
      await removeAllocation(allocationId)
      setShift((prev) => ({
        ...prev,
        allocations: (prev.allocations ?? []).filter((a: { id: string }) => a.id !== allocationId),
        headcount_filled: Math.max(0, Number(prev.headcount_filled ?? 0) - 1),
      }))
      onSuccess()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to remove worker')
    }
  }

  const handleReplaceWorker = async (allocationId: string, oldWorkerId: string, newWorkerId: string) => {
    if (oldWorkerId === newWorkerId) {
      setShowReplaceForAllocationId(null)
      return
    }
    setReplaceSaving(true)
    try {
      await reallocateWorker(String(shift.id), oldWorkerId, newWorkerId)
      setShowReplaceForAllocationId(null)
      onSuccess()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to replace worker')
    } finally {
      setReplaceSaving(false)
    }
  }

  const handleCancelInvite = async (inviteId: string) => {
    try {
      await cancelShiftInvite(inviteId)
      await loadPendingInvites()
      onSuccess()
    } catch (e) {
      alert('Failed to cancel invitation')
    }
  }

  const ftEmployees = employees.filter((e) => e.employment_type === 'full_time')
  const ptEmployees = employees.filter((e) => e.employment_type === 'part_time')
  const listToShow = view === 'allocate' ? ftEmployees : ptEmployees

  const handleAllocate = async () => {
    try {
      for (const employeeId of selectedEmployees) {
        await allocateEmployee({
          rota_shift_id: String(shift.id),
          team_member_id: employeeId,
        })
      }
      alert('Employees allocated successfully')
      setSelectedEmployees([])
      onSuccess()
      setShift((prev) => ({
        ...prev,
        headcount_filled: Number(prev.headcount_filled ?? 0) + selectedEmployees.length,
        allocations: [...(prev.allocations ?? [])],
      }))
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to allocate')
    }
  }

  const handleInvite = async () => {
    try {
      const created = await inviteEmployeesToShift({
        rota_shift_id: String(shift.id),
        team_member_ids: selectedEmployees,
      })
      const withCodes = created
        .filter((inv) => (inv as { invite_code?: string }).invite_code)
        .map((inv) => ({
          invite_code: (inv as { invite_code: string }).invite_code,
          team_member_id: String((inv as { team_member_id: string }).team_member_id),
        }))
      if (withCodes.length > 0) {
        setInviteResult({ shift, invites: withCodes })
      } else {
        alert(`Invites sent to ${selectedEmployees.length} employees`)
        onSuccess()
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to send invites')
    }
  }

  const closeInviteResult = () => {
    setInviteResult(null)
    onSuccess()
  }

  if (inviteResult) {
    const venue = shift.venue as { name?: string; address?: string } | undefined
    const creator = shift.creator as { full_name?: string } | undefined
    const baseUrl =
      (typeof window !== 'undefined' && (process.env.NEXT_PUBLIC_APP_URL || window.location.origin)) ||
      'http://localhost:3000'
    const body = `Hi!

You've been invited to work a shift.

📍 Venue: ${String(venue?.name ?? '')}
${String(venue?.address ?? '').trim() ? `📍 Address: ${venue?.address}\n` : ''}🕐 Date: ${editForm.shift_date}
⏰ Time: ${editForm.start_time} - ${editForm.end_time}
💼 Role: ${String(role?.name ?? '')}
👨‍💼 Manager: ${String(creator?.full_name ?? 'Your manager')}

To accept:
Invite code: {CODE}
OR visit: {LINK}

This offer expires in 48 hours.

— FlexiWork Rosta`
    const lines: string[] = []
    inviteResult.invites.forEach((inv) => {
      const emp = employees.find((e) => String(e.id) === inv.team_member_id) as { profile?: { email?: string }; email?: string } | undefined
      const workerEmail = emp?.profile?.email ?? emp?.email ?? '(worker email)'
      const link = `${baseUrl}/invite/${inv.invite_code}`
      const workerMessage = body.replace('{CODE}', inv.invite_code).replace('{LINK}', link)
      lines.push(`--- Send to: ${workerEmail} ---`)
      lines.push(workerMessage)
      lines.push('')
    })
    const message = `Copy the block below for each worker:\n\n${lines.join('\n').trim()}\n\nUnique links:\n${inviteResult.invites.map((inv) => `${baseUrl}/invite/${inv.invite_code}`).join('\n')}`

    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
          <div className="p-6 border-b border-gray-200 flex justify-between items-center">
            <h2 className="text-xl font-bold">Share invite links</h2>
            <button type="button" onClick={closeInviteResult}><X className="w-6 h-6" /></button>
          </div>
          <div className="p-6 space-y-4">
            <textarea readOnly value={message} rows={20} className="w-full border rounded-lg p-3 text-sm font-mono bg-gray-50" />
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(message)
                  alert('Copied to clipboard')
                }}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg font-medium"
              >
                Copy to clipboard
              </button>
              <button type="button" onClick={closeInviteResult} className="flex-1 px-6 py-3 border rounded-lg">
                Done
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      {showInviteWorkerModal && (
        <InviteWorkerModal
          shift={shift}
          organisationId={organisationId}
          onClose={() => setShowInviteWorkerModal(false)}
          onSuccess={() => {
            loadPendingInvites()
            onSuccess()
          }}
        />
      )}
      {showPullStaffModal && (
        <PullStaffModal
          shift={shift}
          venueId={String(shift.venue_id ?? (shift.venue as { id?: string })?.id ?? '')}
          roleId={String(shift.role_id ?? (shift.role as { id?: string })?.id ?? '')}
          onClose={() => setShowPullStaffModal(false)}
          onSuccess={() => {
            loadPendingInvites()
            onSuccess()
          }}
        />
      )}

      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
          {/* Header: Shift Details + Edit + Delete */}
          <div className="p-6 border-b border-gray-200 flex justify-between items-center sticky top-0 bg-white z-10">
            <div>
              <h2 className="text-xl font-bold">Shift Details</h2>
              {!isEditMode ? (
                <p className="text-sm text-gray-600">
                  {String(role?.name ?? '')} • {String(shift.shift_date)} • {String(shift.start_time)}–{String(shift.end_time)}
                  {Number(shift.headcount_needed ?? 1) > 0 && ` • Headcount: ${Number(shift.headcount_filled ?? 0)}/${Number(shift.headcount_needed ?? 1)}`}
                </p>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsEditMode(true)}
                className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"
                title="Edit shift details"
              >
                <Pencil className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={!!isPastShift}
                className="p-2 rounded-lg hover:bg-red-50 text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                title={isPastShift ? 'Cannot delete past shift' : 'Cancel/delete shift'}
              >
                <Trash2 className="w-5 h-5" />
              </button>
              <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100">
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>

          {/* Delete confirmation */}
          {showDeleteConfirm && (
            <div className="p-6 border-b border-gray-200 bg-amber-50">
              <p className="text-sm text-gray-800 mb-2">
                Are you sure you want to cancel this shift? This will notify the assigned worker.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg"
                >
                  No, keep shift
                </button>
                <button
                  type="button"
                  onClick={handleDeleteShift}
                  disabled={deleting}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg disabled:opacity-50"
                >
                  {deleting ? 'Deleting...' : 'Yes, cancel shift'}
                </button>
              </div>
            </div>
          )}

          {/* Edit form or view mode */}
          <div className="p-6 border-b border-gray-200">
            {isEditMode ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                  <select
                    value={editForm.role_id}
                    onChange={(e) => setEditForm((f) => ({ ...f, role_id: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg p-2"
                  >
                    {roles.map((r) => (
                      <option key={String(r.id)} value={String(r.id)}>{String(r.name)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                  <input
                    type="date"
                    value={editForm.shift_date}
                    onChange={(e) => setEditForm((f) => ({ ...f, shift_date: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg p-2"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
                    <input
                      type="time"
                      value={editForm.start_time}
                      onChange={(e) => setEditForm((f) => ({ ...f, start_time: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg p-2"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
                    <input
                      type="time"
                      value={editForm.end_time}
                      onChange={(e) => setEditForm((f) => ({ ...f, end_time: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg p-2"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Headcount</label>
                  <input
                    type="number"
                    min={1}
                    value={editForm.headcount_needed}
                    onChange={(e) => setEditForm((f) => ({ ...f, headcount_needed: parseInt(e.target.value, 10) || 1 }))}
                    className="w-full border border-gray-300 rounded-lg p-2"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEditMode(false)}
                    className="px-4 py-2 border border-gray-300 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveEdit}
                    disabled={savingEdit || editForm.end_time < editForm.start_time}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50"
                  >
                    {savingEdit ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-sm text-gray-600">
                View mode: role, date, time and headcount shown in header. Click the pencil to edit.
              </div>
            )}
          </div>

          {/* Assigned Worker section */}
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Assigned Worker(s)</h3>
            {allocations && allocations.length > 0 ? (
              <ul className="space-y-2">
                {allocations.map((alloc) => {
                  const tm = alloc.team_member as { profile?: { full_name?: string } } | undefined
                  const name = String(tm?.profile?.full_name ?? 'Worker')
                  const isReplacing = showReplaceForAllocationId === alloc.id
                  return (
                    <li key={alloc.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                      <div className="font-medium text-gray-900">{name}</div>
                      <div className="flex items-center gap-2">
                        {!isReplacing ? (
                          <>
                            <button
                              type="button"
                              onClick={() => setShowReplaceForAllocationId(alloc.id)}
                              className="flex items-center gap-1 px-2 py-1 text-sm font-medium text-blue-700 bg-blue-100 rounded hover:bg-blue-200"
                            >
                              <UserPlus className="w-4 h-4" />
                              Replace
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveWorker(alloc.id)}
                              className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                              title="Remove worker"
                            >
                              <UserMinus className="w-4 h-4" />
                            </button>
                          </>
                        ) : (
                          <div className="flex items-center gap-2 flex-wrap">
                            <select
                              className="border border-gray-300 rounded-lg p-1.5 text-sm"
                              onChange={(e) => {
                                const id = e.target.value
                                if (id) {
                                  handleReplaceWorker(alloc.id, alloc.team_member_id, id)
                                }
                              }}
                              disabled={replaceSaving}
                            >
                              <option value="">Select worker to assign…</option>
                              {employees
                                .filter((e) => String(e.id) !== alloc.team_member_id)
                                .map((emp) => {
                                  const profile = emp.profile as { full_name?: string } | undefined
                                  return (
                                    <option key={String(emp.id)} value={String(emp.id)}>
                                      {String(profile?.full_name ?? emp.email ?? emp.id)}
                                    </option>
                                  )
                                })}
                            </select>
                            <button
                              type="button"
                              onClick={() => setShowReplaceForAllocationId(null)}
                              className="text-sm text-gray-600"
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="text-gray-500 text-sm">No worker assigned. Use the options below to allocate or invite.</p>
            )}
          </div>

          {/* Allocation options tabs */}
          <div className="p-6 border-b border-gray-200">
            <div className="flex flex-wrap gap-2 mb-4">
              <button
                type="button"
                onClick={() => setView('allocate')}
                className={`flex-1 min-w-[120px] px-4 py-2 rounded-lg font-medium ${view === 'allocate' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}
              >
                Allocate FT ({ftEmployees.length})
              </button>
              <button
                type="button"
                onClick={() => setView('invite')}
                className={`flex-1 min-w-[120px] px-4 py-2 rounded-lg font-medium ${view === 'invite' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}
              >
                Share link ({ptEmployees.length})
              </button>
              <button
                type="button"
                onClick={() => setShowInviteWorkerModal(true)}
                className="px-4 py-2 rounded-lg font-medium bg-green-100 text-green-700 hover:bg-green-200"
              >
                Invite registered worker
              </button>
              <button
                type="button"
                onClick={() => setShowPullStaffModal(true)}
                className="px-4 py-2 rounded-lg font-medium bg-purple-100 text-purple-700 hover:bg-purple-200"
              >
                Pull from other venues
              </button>
            </div>

            {pendingInvites.length > 0 && (
              <div className="mb-4">
                <h4 className="text-sm font-semibold text-gray-700 mb-2">Pending invitations</h4>
                <ul className="space-y-2">
                  {pendingInvites.map((inv: Record<string, unknown>) => {
                    const tm = inv.team_member as Record<string, unknown> | undefined
                    const profile = tm?.profile as Record<string, unknown> | undefined
                    const name = String(profile?.full_name ?? 'Worker')
                    const sentAt = inv.invited_at as string
                    return (
                      <li key={String(inv.id)} className="flex items-center justify-between py-2 px-3 bg-amber-50 rounded-lg border border-amber-200">
                        <span className="font-medium text-gray-900">{name}</span>
                        <span className="text-xs text-gray-500 ml-2">
                          Sent {sentAt ? formatDistanceToNow(new Date(sentAt), { addSuffix: true }) : ''}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCancelInvite(String(inv.id))}
                          className="text-sm text-red-600 hover:text-red-700 font-medium"
                        >
                          Cancel
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}

            {loading ? (
              <p className="text-gray-500 text-sm">Loading employees...</p>
            ) : (
              <div className="space-y-2">
                {listToShow.map((employee) => {
                  const profile = employee.profile as Record<string, unknown> | undefined
                  const primaryVenue = employee.primary_venue as Record<string, unknown> | undefined
                  const isAllocated = (shift.allocations ?? []).some(
                    (a: { team_member_id: string }) => String(a.team_member_id) === String(employee.id)
                  )
                  return (
                    <label
                      key={String(employee.id)}
                      className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer ${isAllocated ? 'bg-gray-50 opacity-75' : 'hover:bg-gray-50'}`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedEmployees.includes(String(employee.id))}
                        disabled={isAllocated}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedEmployees([...selectedEmployees, String(employee.id)])
                          } else {
                            setSelectedEmployees(selectedEmployees.filter((id) => id !== employee.id))
                          }
                        }}
                        className="w-4 h-4"
                      />
                      <div className="w-10 h-10 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold">
                        {(profile?.full_name as string)?.[0] ?? '?'}
                      </div>
                      <div className="flex-1">
                        <div className="font-medium">{String(profile?.full_name ?? '')}</div>
                        <div className="text-sm text-gray-500">{String(primaryVenue?.name ?? '')}</div>
                      </div>
                      {isAllocated && <span className="text-xs text-green-600 font-medium">Allocated</span>}
                    </label>
                  )
                })}
              </div>
            )}

            <div className="flex gap-3 mt-6">
              <button type="button" onClick={onClose} className="flex-1 px-6 py-3 border rounded-lg">
                Close
              </button>
              <button
                type="button"
                onClick={view === 'allocate' ? handleAllocate : handleInvite}
                disabled={selectedEmployees.length === 0}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg font-medium disabled:opacity-50"
              >
                {view === 'allocate' ? `Allocate ${selectedEmployees.length}` : `Invite ${selectedEmployees.length}`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
