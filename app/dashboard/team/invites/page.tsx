'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, UserPlus, Mail, Trash2 } from 'lucide-react'
import { createInvite, listOrganisationInvites, revokeInvitation, type InvitePosition } from '@/app/actions/invite-actions'
import { getOrganisationIdForCurrentUser } from '@/lib/services/organisations'
import { supabase } from '@/lib/supabase'

const POSITION_LABELS: Record<InvitePosition, string> = {
  employer: 'Employer',
  gm: 'General Manager',
  agm: 'Assistant GM',
  shift_leader: 'Shift Leader',
  worker: 'Worker',
}

// Owner/Employer can invite gm, agm, shift_leader, worker (not employer – owner is employer)
const AVAILABLE_POSITIONS: InvitePosition[] = ['gm', 'agm', 'shift_leader', 'worker']

export default function TeamInvitesPage() {
  const [organisationId, setOrganisationId] = useState<string>('')
  const [currentUserId, setCurrentUserId] = useState<string>('')
  const [invites, setInvites] = useState<Array<{
    id: string
    email: string
    hierarchy_level: string
    token: string
    expires_at: string
    created_at: string
    creator?: { full_name?: string; email?: string }
  }>>([])
  const [email, setEmail] = useState('')
  const [position, setPosition] = useState<InvitePosition>('worker')
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setIsLoading(true)
    try {
      const orgId = await getOrganisationIdForCurrentUser()
      if (!orgId) {
        setToast({ type: 'error', message: 'No organisation found' })
        setIsLoading(false)
        return
      }
      setOrganisationId(orgId)

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setToast({ type: 'error', message: 'Not authenticated' })
        setIsLoading(false)
        return
      }
      setCurrentUserId(user.id)

      const data = await listOrganisationInvites(orgId, user.id, 'pending')
      setInvites(data)
    } catch (err) {
      console.error('Load invites error:', err)
      setToast({ type: 'error', message: err instanceof Error ? err.message : 'Failed to load invites' })
    } finally {
      setIsLoading(false)
    }
  }

  async function handleCreateInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!organisationId || !currentUserId) return
    const trimmedEmail = email.trim().toLowerCase()
    if (!trimmedEmail) {
      setToast({ type: 'error', message: 'Email is required' })
      return
    }

    setIsSaving(true)
    setToast(null)
    try {
      const result = await createInvite(trimmedEmail, position, organisationId)

      if (!result.success) {
        setToast({ type: 'error', message: result.error ?? 'Failed to create invite' })
        return
      }

      setToast({
        type: 'success',
        message: result.inviteLink
          ? `Invitation sent! Share this link: ${result.inviteLink}`
          : `Invitation created. Code: ${result.code}`,
      })
      setEmail('')
      setPosition('worker')
      loadData()
    } catch (err) {
      setToast({ type: 'error', message: err instanceof Error ? err.message : 'Failed to send invite' })
    } finally {
      setIsSaving(false)
    }
  }

  async function handleRevoke(inviteId: string) {
    if (!organisationId || !currentUserId) return
    if (!confirm('Revoke this invitation?')) return

    const result = await revokeInvitation(inviteId, currentUserId, organisationId)
    if (result.success) {
      setToast({ type: 'success', message: 'Invitation revoked' })
      loadData()
    } else {
      setToast({ type: 'error', message: result.error ?? 'Failed to revoke' })
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-600">Loading invitations...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-4xl mx-auto px-6 py-6">
        <Link
          href="/dashboard/team"
          className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 mb-6"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Team
        </Link>

        <h1 className="text-2xl font-bold text-gray-900 mb-6">Team Invitations</h1>

        {toast && (
          <div
            className={`mb-6 p-4 rounded-lg ${
              toast.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
            }`}
          >
            {toast.message}
          </div>
        )}

        {/* Create Invite Form */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 mb-8">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <UserPlus className="w-5 h-5" />
            Send New Invitation
          </h2>
          <form onSubmit={handleCreateInvite} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Mail className="w-4 h-4 inline mr-1" />
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900"
                placeholder="colleague@example.com"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Position Level</label>
              <select
                value={position}
                onChange={(e) => setPosition(e.target.value as InvitePosition)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900"
              >
                {AVAILABLE_POSITIONS.map((pos) => (
                  <option key={pos} value={pos}>
                    {POSITION_LABELS[pos]}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                You can only invite positions below your authority level
              </p>
            </div>

            <button
              type="submit"
              disabled={isSaving}
              className="px-6 py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
            >
              {isSaving ? 'Sending...' : 'Send Invitation'}
            </button>
          </form>
        </div>

        {/* Pending Invites List */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <h2 className="text-lg font-semibold p-6 border-b border-gray-200">Pending Invitations</h2>
          <div className="divide-y divide-gray-100">
            {invites.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                No pending invitations. Create one above to invite new team members.
              </div>
            ) : (
              invites.map((inv) => (
                <div
                  key={inv.id}
                  className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                >
                  <div>
                    <p className="font-medium text-gray-900">{inv.email}</p>
                    <p className="text-sm text-gray-500">
                      Position: {POSITION_LABELS[inv.hierarchy_level as InvitePosition] ?? inv.hierarchy_level} •{' '}
                      Expires: {new Date(inv.expires_at).toLocaleDateString()}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      Code: {inv.token} • Invite link: /invite/accept?token={inv.token}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRevoke(inv.id)}
                    className="inline-flex items-center gap-1 text-sm text-red-600 hover:text-red-800"
                  >
                    <Trash2 className="w-4 h-4" />
                    Revoke
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
