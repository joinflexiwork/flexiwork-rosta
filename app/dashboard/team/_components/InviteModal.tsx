'use client'

import { useState } from 'react'
import { X, UserPlus } from 'lucide-react'
import { createInvite } from '@/app/actions/invite-actions'
import { getInviteTypeLabel, type HierarchicalInviteType } from '@/lib/services/invites'

interface InviteModalProps {
  isOpen: boolean
  onClose: () => void
  inviteType: HierarchicalInviteType
  inviterId: string
  organisationId: string
  venues: { id: string; name: string }[]
  onSuccess: () => void
}

export default function InviteModal({
  isOpen,
  onClose,
  inviteType,
  organisationId,
  venues,
  onSuccess,
}: InviteModalProps) {
  const [email, setEmail] = useState('')
  const [selectedVenueIds, setSelectedVenueIds] = useState<string[]>([])
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successLink, setSuccessLink] = useState<string | null>(null)

  const title = `Invite ${getInviteTypeLabel(inviteType)}`

  const toggleVenue = (id: string) => {
    setSelectedVenueIds((prev) =>
      prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]
    )
  }

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedEmail = email.trim()
    if (!trimmedEmail) {
      setError('Email is required')
      return
    }
    setError(null)
    setLoading(true)
    setSuccessLink(null)
    try {
      const result = await createInvite(
        trimmedEmail,
        inviteType,
        organisationId,
        selectedVenueIds.length ? selectedVenueIds : undefined
      )
      if (!result.success) {
        setError(result.error ?? 'Failed to send invite')
        return
      }
      setSuccessLink(result.inviteLink ?? (result.code ? `${typeof window !== 'undefined' ? window.location.origin : ''}/invite/accept?token=${encodeURIComponent(result.code)}` : null))
      setEmail('')
      setSelectedVenueIds([])
      setMessage('')
      onSuccess()
      // Keep modal open to show link; user can close or send another
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send invite')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setSuccessLink(null)
    setError(null)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 p-4">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button
            type="button"
            onClick={handleClose}
            className="rounded p-1 hover:bg-gray-100 text-gray-500"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={handleSend} className="p-4 space-y-4">
          {successLink ? (
            <div className="rounded-lg bg-green-50 border border-green-200 p-4 text-sm text-green-800">
              <p className="font-medium mb-1">Invite created successfully.</p>
              <p className="text-xs text-green-700 mt-2 mb-2">Share this link with the invitee:</p>
              <p className="break-all font-mono text-xs bg-white p-2 rounded border border-green-200">
                {successLink}
              </p>
              <p className="text-xs mt-2 text-gray-600">You can close this and send another, or copy the link above.</p>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  placeholder="colleague@example.com"
                />
              </div>
              {venues.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Venues (optional)</label>
                  <p className="text-xs text-gray-500 mb-2">Venues the invitee can access</p>
                  <div className="flex flex-wrap gap-2">
                    {venues.map((v) => (
                      <label
                        key={v.id}
                        className="inline-flex items-center gap-1.5 text-sm cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedVenueIds.includes(v.id)}
                          onChange={() => toggleVenue(v.id)}
                          className="rounded border-gray-300"
                        />
                        {v.name}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Message (optional)</label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={2}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm resize-none"
                  placeholder="Add a short message..."
                />
              </div>
              {error && (
                <p className="text-sm text-red-600">{error}</p>
              )}
            </>
          )}
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50"
            >
              {successLink ? 'Close' : 'Cancel'}
            </button>
            {!successLink && (
              <button
                type="submit"
                disabled={loading}
                className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <UserPlus className="w-4 h-4" />
                {loading ? 'Sending...' : 'Send Invite'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
