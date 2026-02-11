'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { inviteManager } from '@/app/actions/hierarchy'
import type { HierarchyLevel } from '@/lib/types/hierarchy'
import RoleBadge from './RoleBadge'
import { HIERARCHY_RULES } from '@/lib/types/hierarchy'

type Props = {
  orgId: string
  venues: { id: string; name: string }[]
  inviterLevel: HierarchyLevel
  onClose: () => void
  onSuccess: () => void
}

const MANAGER_LEVELS: HierarchyLevel[] = ['gm', 'agm', 'shift_leader']

export default function ManagerInviteModal({ orgId, venues, inviterLevel, onClose, onSuccess }: Props) {
  const [step, setStep] = useState(1)
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [level, setLevel] = useState<HierarchyLevel>('agm')
  const [venueIds, setVenueIds] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const rules = HIERARCHY_RULES[inviterLevel]
  const allowedLevels = MANAGER_LEVELS.filter((l) => rules.canInvite.includes(l))

  const toggleVenue = (id: string) => {
    setVenueIds((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]))
  }

  const handleSubmit = async () => {
    setError(null)
    setLoading(true)
    try {
      await inviteManager(orgId, email.trim(), fullName.trim(), level, venueIds)
      onSuccess()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send invite')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 p-4">
          <h2 className="text-lg font-semibold">Invite manager</h2>
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-4">
          {step === 1 && (
            <>
              <label className="block text-sm font-medium text-gray-700">Email *</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                placeholder="manager@example.com"
              />
              <label className="mt-3 block text-sm font-medium text-gray-700">Full name</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                placeholder="Jane Doe"
              />
              <label className="mt-3 block text-sm font-medium text-gray-700">Role level</label>
              <div className="mt-1 flex flex-wrap gap-2">
                {allowedLevels.map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setLevel(l)}
                    className={`rounded-lg border px-3 py-1.5 text-sm ${level === l ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-gray-300 hover:bg-gray-50'}`}
                  >
                    <RoleBadge level={l} />
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setStep(2)}
                disabled={!email.trim()}
                className="mt-4 w-full rounded-lg bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                Next
              </button>
            </>
          )}
          {step === 2 && (
            <>
              <p className="text-sm text-gray-600">Assign venues (optional for GM).</p>
              <div className="mt-2 space-y-2">
                {venues.map((v) => (
                  <label key={v.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={venueIds.includes(v.id)}
                      onChange={() => toggleVenue(v.id)}
                      className="rounded border-gray-300"
                    />
                    <span>{v.name}</span>
                  </label>
                ))}
              </div>
              <p className="mt-3 text-xs text-gray-500">
                Permission preview: {level === 'gm' ? 'Can edit rota (all), manage venues (scoped).' : level === 'agm' ? 'Can edit rota (scoped), invite workers.' : 'Can invite workers only.'}
              </p>
              {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="flex-1 rounded-lg border border-gray-300 px-4 py-2 hover:bg-gray-50"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={loading}
                  className="flex-1 rounded-lg bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {loading ? 'Sending…' : 'Send invite'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
