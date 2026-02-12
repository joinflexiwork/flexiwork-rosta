'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { getNotificationPreferences, updateNotificationPreferences, type NotificationPreferences } from '@/app/actions/notification-actions'

const DEFAULT_PREFS: NotificationPreferences = {
  hierarchy_changes: { in_app: true, email: true, push: true },
  shift_changes: { in_app: true, email: false, push: true },
  approvals: { in_app: true, email: true, push: false },
  system_alerts: { in_app: true, email: true, push: false },
}

const NOTIFICATION_TYPES = [
  { id: 'hierarchy_changes' as const, label: 'Role/Hierarchy changes' },
  { id: 'shift_changes' as const, label: 'Shift invitations & changes' },
  { id: 'approvals' as const, label: 'Approvals' },
  { id: 'system_alerts' as const, label: 'System alerts' },
]

export default function NotificationSettingsPage() {
  const [userId, setUserId] = useState<string | null>(null)
  const [organisationId, setOrganisationId] = useState<string | null>(null)
  const [prefs, setPrefs] = useState<NotificationPreferences>(DEFAULT_PREFS)
  const [quietStart, setQuietStart] = useState('22:00')
  const [quietEnd, setQuietEnd] = useState('08:00')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUserId(user?.id ?? null))
  }, [])

  useEffect(() => {
    if (!userId) return
    supabase
      .from('team_members')
      .select('organisation_id')
      .eq('user_id', userId)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        const orgId = (data as { organisation_id?: string } | null)?.organisation_id ?? null
        setOrganisationId(orgId)
      })
  }, [userId])

  useEffect(() => {
    if (!userId || !organisationId) return
    getNotificationPreferences(userId, organisationId).then((result) => {
      if (result.success && result.data) {
        setPrefs(result.data)
        if (result.data.quiet_hours_start) setQuietStart(result.data.quiet_hours_start)
        if (result.data.quiet_hours_end) setQuietEnd(result.data.quiet_hours_end)
      }
    })
  }, [userId, organisationId])

  async function handleSave() {
    if (!userId || !organisationId) return
    setSaving(true)
    setSaved(false)
    try {
      const result = await updateNotificationPreferences(userId, organisationId, {
        ...prefs,
        quiet_hours_start: quietStart,
        quiet_hours_end: quietEnd,
      })
      if (result.success) {
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      }
    } finally {
      setSaving(false)
    }
  }

  function updateCategory(
    category: keyof Omit<NotificationPreferences, 'quiet_hours_start' | 'quiet_hours_end' | 'timezone'>,
    channel: 'in_app' | 'email' | 'push',
    value: boolean
  ) {
    setPrefs((prev) => ({
      ...prev,
      [category]: { ...prev[category], [channel]: value },
    }))
  }

  if (!organisationId && userId) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Notification settings</h1>
        <p className="text-gray-600">Join an organisation to manage notification preferences.</p>
        <Link href="/dashboard/profile" className="mt-4 text-purple-600 hover:underline inline-block">
          Go to Profile
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Notification settings</h1>
      <p className="text-gray-600 mb-6">Choose how you receive each type of notification.</p>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left p-3 font-medium text-gray-700">Type</th>
              <th className="text-center p-3 font-medium text-gray-700">Email</th>
              <th className="text-center p-3 font-medium text-gray-700">Push</th>
              <th className="text-center p-3 font-medium text-gray-700">In-app</th>
            </tr>
          </thead>
          <tbody>
            {NOTIFICATION_TYPES.map(({ id, label }) => (
              <tr key={id} className="border-b border-gray-100 last:border-0">
                <td className="p-3">{label}</td>
                <td className="p-3 text-center">
                  <input
                    type="checkbox"
                    checked={prefs[id]?.email ?? true}
                    onChange={(e) => updateCategory(id, 'email', e.target.checked)}
                    className="rounded border-gray-300"
                  />
                </td>
                <td className="p-3 text-center">
                  <input
                    type="checkbox"
                    checked={prefs[id]?.push ?? true}
                    onChange={(e) => updateCategory(id, 'push', e.target.checked)}
                    className="rounded border-gray-300"
                  />
                </td>
                <td className="p-3 text-center">
                  <input
                    type="checkbox"
                    checked={prefs[id]?.in_app ?? true}
                    onChange={(e) => updateCategory(id, 'in_app', e.target.checked)}
                    className="rounded border-gray-300"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 p-4 bg-gray-50 rounded-xl">
        <h2 className="font-medium text-gray-900 mb-2">Quiet hours</h2>
        <p className="text-sm text-gray-600 mb-3">No push notifications during this time (in-app still shown).</p>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2">
            <span className="text-sm text-gray-700">Start</span>
            <input
              type="time"
              value={quietStart}
              onChange={(e) => setQuietStart(e.target.value)}
              className="border border-gray-300 rounded-lg px-2 py-1"
            />
          </label>
          <label className="flex items-center gap-2">
            <span className="text-sm text-gray-700">End</span>
            <input
              type="time"
              value={quietEnd}
              onChange={(e) => setQuietEnd(e.target.value)}
              className="border border-gray-300 rounded-lg px-2 py-1"
            />
          </label>
        </div>
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving ? 'Saving…' : saved ? 'Saved!' : 'Save'}
        </button>
      </div>
    </div>
  )
}
