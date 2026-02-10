'use client'

import { useState, useEffect } from 'react'
import { X, Search } from 'lucide-react'
import { createShiftInvite, getAvailableWorkersForShift } from '@/lib/services/invites'
import { getTeamMembers } from '@/lib/services/team'

type Worker = Record<string, unknown>

export default function InviteWorkerModal({
  shift,
  organisationId,
  onClose,
  onSuccess,
}: {
  shift: Record<string, unknown>
  organisationId: string
  onClose: () => void
  onSuccess: () => void
}) {
  const [workers, setWorkers] = useState<Worker[]>([])
  const [filtered, setFiltered] = useState<Worker[]>([])
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const rotaShiftId = String(shift.id)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const all = await getTeamMembers(organisationId)
        const available = await getAvailableWorkersForShift(rotaShiftId, organisationId, all)
        if (!cancelled) setWorkers(available)
      } catch (e) {
        console.error(e)
        if (!cancelled) setToast({ type: 'error', message: 'Failed to load workers' })
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [rotaShiftId, organisationId])

  useEffect(() => {
    const q = search.trim().toLowerCase()
    if (!q) {
      setFiltered(workers)
      return
    }
    setFiltered(
      workers.filter((w) => {
        const profile = w.profile as Record<string, unknown> | undefined
        const name = String(profile?.full_name ?? '').toLowerCase()
        const email = String(profile?.email ?? w.email ?? '').toLowerCase()
        const venue = (w.primary_venue as Record<string, unknown>)?.name as string
        return name.includes(q) || email.includes(q) || String(venue ?? '').toLowerCase().includes(q)
      })
    )
  }, [workers, search])

  async function handleSend() {
    if (!selectedId) return
    setSending(true)
    setToast(null)
    try {
      await createShiftInvite(rotaShiftId, selectedId)
      const profile = workers.find((w) => String(w.id) === selectedId)?.profile as Record<string, unknown> | undefined
      const name = String(profile?.full_name ?? 'Worker')
      setToast({ type: 'success', message: `Invitation sent to ${name}. They will be notified in their dashboard.` })
      onSuccess()
      setTimeout(() => onClose(), 1500)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to send invitation'
      setToast({ type: 'error', message: msg.includes('already') ? 'Worker may already be invited.' : msg })
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
            <h2 className="text-lg font-bold">Invite registered worker</h2>
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

        <div className="p-4 border-b border-gray-100 flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name or venue..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 min-h-0">
          {loading ? (
            <div className="text-center py-8 text-gray-500 text-sm">Loading workers...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-gray-500 text-sm">
              {workers.length === 0
                ? 'No available workers. All active workers are already allocated or invited to this shift.'
                : 'No workers match your search.'}
            </div>
          ) : (
            <div className="space-y-1">
              {filtered.map((worker) => {
                const profile = worker.profile as Record<string, unknown> | undefined
                const primaryVenue = worker.primary_venue as Record<string, unknown> | undefined
                const roles = worker.roles as { role?: Record<string, unknown> }[] | undefined
                const roleName = roles?.[0]?.role ? String((roles[0].role as Record<string, unknown>).name ?? '') : ''
                const id = String(worker.id)
                const isSelected = selectedId === id
                return (
                  <label
                    key={id}
                    className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer ${
                      isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="invite-worker"
                      checked={isSelected}
                      onChange={() => setSelectedId(id)}
                      className="w-4 h-4 text-blue-600"
                    />
                    <div className="w-10 h-10 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold flex-shrink-0">
                      {(String(profile?.full_name ?? '').trim() || '?')[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 truncate">
                        {String(profile?.full_name ?? worker.email ?? 'Unknown')}
                      </div>
                      <div className="text-sm text-gray-500 flex flex-wrap gap-x-2 gap-y-0">
                        <span>{String(primaryVenue?.name ?? '—')}</span>
                        <span>•</span>
                        <span>{roleName || '—'}</span>
                        <span>•</span>
                        <span className="capitalize">{String(worker.employment_type ?? '').replace('_', '-')}</span>
                      </div>
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
            disabled={!selectedId || sending}
            className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sending ? 'Sending...' : 'Send invitation'}
          </button>
        </div>
      </div>
    </div>
  )
}
