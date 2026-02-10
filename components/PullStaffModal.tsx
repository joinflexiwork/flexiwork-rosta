'use client'

import { useState, useEffect } from 'react'
import { X, Users } from 'lucide-react'
import { pullAvailableWorkers, inviteEmployeesToShift } from '@/lib/services/invites'

type PullWorker = {
  team_member_id: string
  full_name: string | null
  email: string | null
  employment_type: string | null
}

export default function PullStaffModal({
  shift,
  venueId,
  roleId,
  onClose,
  onSuccess,
}: {
  shift: Record<string, unknown>
  venueId: string
  roleId?: string
  onClose: () => void
  onSuccess: () => void
}) {
  const [workers, setWorkers] = useState<PullWorker[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const rotaShiftId = String(shift.id)
  const shiftDate = shift.shift_date as string | undefined

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const list = await pullAvailableWorkers({
          venueId,
          roleId: roleId ?? undefined,
          shiftDate,
          shiftId: rotaShiftId,
        })
        if (!cancelled) setWorkers(list)
      } catch (e) {
        console.error(e)
        if (!cancelled) setToast({ type: 'error', message: 'Failed to load available workers' })
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [venueId, roleId, shiftDate, rotaShiftId])

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleSend() {
    if (selectedIds.size === 0) return
    setSending(true)
    setToast(null)
    try {
      await inviteEmployeesToShift({
        rota_shift_id: rotaShiftId,
        team_member_ids: Array.from(selectedIds),
      })
      setToast({ type: 'success', message: `Invitation(s) sent to ${selectedIds.size} worker(s). First to accept gets the shift.` })
      onSuccess()
      setTimeout(() => onClose(), 1800)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to send invitations'
      setToast({ type: 'error', message: msg })
    } finally {
      setSending(false)
    }
  }

  const role = shift.role as Record<string, unknown> | undefined
  const venue = shift.venue as Record<string, unknown> | undefined

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-4 border-b border-gray-200 flex justify-between items-center flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Users className="w-5 h-5 text-purple-600" />
              Pull from other venues
            </h2>
            <p className="text-sm text-gray-600">
              {String(role?.name ?? '')} • {String(shift.shift_date)} • {String(venue?.name ?? '')}
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {toast && (
          <div
            className={`mx-4 mt-2 px-3 py-2 rounded-lg text-sm ${
              toast.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
            }`}
          >
            {toast.message}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 min-h-0">
          {loading ? (
            <div className="text-center py-8 text-gray-500 text-sm">Loading available workers...</div>
          ) : workers.length === 0 ? (
            <div className="text-center py-8 text-gray-500 text-sm">
              No workers available from other venues for this shift. Try inviting from your team list.
            </div>
          ) : (
            <div className="space-y-1">
              <p className="text-xs text-gray-500 mb-2">First-come-first-served: first to accept gets the shift.</p>
              {workers.map((w) => {
                const id = w.team_member_id
                const isSelected = selectedIds.has(id)
                return (
                  <label
                    key={id}
                    className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer ${
                      isSelected ? 'border-purple-500 bg-purple-50' : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggle(id)}
                      className="w-4 h-4 text-purple-600 rounded"
                    />
                    <div className="w-10 h-10 rounded-full bg-gradient-to-r from-purple-500 to-indigo-600 flex items-center justify-center text-white font-bold flex-shrink-0">
                      {(String(w.full_name ?? '').trim() || '?')[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 truncate">{w.full_name ?? w.email ?? 'Unknown'}</div>
                      <div className="text-sm text-gray-500">{w.email ?? '—'}</div>
                      {w.employment_type && (
                        <span className="text-xs text-gray-400 capitalize">{String(w.employment_type).replace('_', '-')}</span>
                      )}
                    </div>
                  </label>
                )
              })}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-200 flex gap-3 flex-shrink-0">
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={selectedIds.size === 0 || sending}
            className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sending ? 'Sending...' : `Send invite (${selectedIds.size})`}
          </button>
        </div>
      </div>
    </div>
  )
}
