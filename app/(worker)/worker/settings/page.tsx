'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Bell, Moon, Calendar, CheckCircle, AlertCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  getNotificationPreferences,
  updateNotificationPreferences,
  type NotificationPreferences,
} from '@/app/actions/notification-actions'

const DEFAULT_PREFS: NotificationPreferences = {
  hierarchy_changes: { in_app: true, email: true, push: true },
  shift_changes: { in_app: true, email: false, push: true },
  approvals: { in_app: true, email: true, push: false },
  system_alerts: { in_app: true, email: true, push: false },
}

type PrefCategory = keyof Omit<NotificationPreferences, 'quiet_hours_start' | 'quiet_hours_end' | 'timezone'>

function ToggleItem({
  icon,
  title,
  description,
  checked,
  onChange,
}: {
  icon: React.ReactNode
  title: string
  description: string
  checked: boolean
  onChange: () => void
}) {
  return (
    <div className="flex items-center justify-between p-4 border border-gray-100 rounded-lg hover:bg-gray-50 transition">
      <div className="flex items-center gap-3">
        <div className="text-gray-600">{icon}</div>
        <div>
          <p className="font-medium text-gray-900">{title}</p>
          <p className="text-gray-500 text-sm">{description}</p>
        </div>
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
      />
    </div>
  )
}

export default function WorkerSettingsPage() {
  const [userId, setUserId] = useState<string | null>(null)
  const [organisationId, setOrganisationId] = useState<string | null>(null)
  const [prefs, setPrefs] = useState<NotificationPreferences>(DEFAULT_PREFS)
  const [quietStart, setQuietStart] = useState('22:00')
  const [quietEnd, setQuietEnd] = useState('06:00')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

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
    if (!userId || !organisationId) {
      if (userId && !organisationId) setLoading(false)
      return
    }
    getNotificationPreferences(userId, organisationId).then((result) => {
      if (result.success && result.data) {
        setPrefs(result.data)
        if (result.data.quiet_hours_start) setQuietStart(String(result.data.quiet_hours_start).slice(0, 5))
        if (result.data.quiet_hours_end) setQuietEnd(String(result.data.quiet_hours_end).slice(0, 5))
      }
      setLoading(false)
    })
  }, [userId, organisationId])

  async function handleSave() {
    if (!userId || !organisationId) return
    setSaving(true)
    setMessage(null)
    try {
      const result = await updateNotificationPreferences(userId, organisationId, {
        ...prefs,
        quiet_hours_start: quietStart,
        quiet_hours_end: quietEnd,
      })
      if (result.success) {
        setMessage({ type: 'success', text: 'Settings saved!' })
        setTimeout(() => setMessage(null), 3000)
      } else {
        setMessage({ type: 'error', text: result.error ?? 'An error occurred' })
      }
    } catch (e) {
      setMessage({ type: 'error', text: 'An error occurred: ' + (e instanceof Error ? e.message : 'Unknown error') })
    } finally {
      setSaving(false)
    }
  }

  function isCategoryEnabled(category: PrefCategory): boolean {
    const c = prefs[category]
    return (c?.in_app || c?.email || c?.push) ?? true
  }

  function setCategoryEnabled(category: PrefCategory, enabled: boolean) {
    const def = DEFAULT_PREFS[category]
    setPrefs((prev) => ({
      ...prev,
      [category]: enabled ? def : { in_app: false, email: false, push: false },
    }))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-500 mt-4">Loading...</p>
      </div>
    )
  }

  if (!organisationId && userId) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Notification settings</h1>
        <p className="text-gray-600 mb-4">Join an organisation to manage settings.</p>
        <Link href="/worker/dashboard" className="text-indigo-600 hover:underline">
          Back to dashboard
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto p-4 pb-24">
      <header className="mb-6">
        <Link
          href="/worker/dashboard"
          className="text-gray-600 hover:text-gray-900 text-sm font-medium mb-2 inline-block"
        >
          ← Back
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Notification settings</h1>
        <p className="text-gray-600 text-sm mt-1">Choose which notifications you want to receive</p>
      </header>

      {message && (
        <div
          className={`p-4 rounded-lg mb-6 ${
            message.type === 'error' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Shift notifications */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
            <Calendar className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Shift notifications</h2>
            <p className="text-gray-500 text-sm">Notifications about shifts</p>
          </div>
        </div>

        <div className="space-y-4">
          <ToggleItem
            icon={<Bell className="w-5 h-5" />}
            title="Shift invitations and changes"
            description="Notifications for new shift invitations and updates"
            checked={isCategoryEnabled('shift_changes')}
            onChange={() => setCategoryEnabled('shift_changes', !isCategoryEnabled('shift_changes'))}
          />

          <ToggleItem
            icon={<CheckCircle className="w-5 h-5" />}
            title="Approval notifications"
            description="Notifications for shift approval or rejection"
            checked={isCategoryEnabled('approvals')}
            onChange={() => setCategoryEnabled('approvals', !isCategoryEnabled('approvals'))}
          />
        </div>
      </div>

      {/* Hierarchy and system */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
            <AlertCircle className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">System notifications</h2>
            <p className="text-gray-500 text-sm">Position changes and important announcements</p>
          </div>
        </div>

        <div className="space-y-4">
          <ToggleItem
            icon={<Bell className="w-5 h-5" />}
            title="Position changes"
            description="Notification when your position changes"
            checked={isCategoryEnabled('hierarchy_changes')}
            onChange={() => setCategoryEnabled('hierarchy_changes', !isCategoryEnabled('hierarchy_changes'))}
          />

          <ToggleItem
            icon={<AlertCircle className="w-5 h-5" />}
            title="System messages"
            description="Important announcements and updates"
            checked={isCategoryEnabled('system_alerts')}
            onChange={() => setCategoryEnabled('system_alerts', !isCategoryEnabled('system_alerts'))}
          />
        </div>
      </div>

      {/* Do not disturb */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
            <Moon className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Quiet hours</h2>
            <p className="text-gray-500 text-sm">No push notifications during this period</p>
          </div>
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex-1 min-w-[120px]">
            <label className="block text-sm font-medium text-gray-700 mb-2">Start</label>
            <input
              type="time"
              value={quietStart}
              onChange={(e) => setQuietStart(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2"
            />
          </div>
          <div className="text-gray-400 pt-8">→</div>
          <div className="flex-1 min-w-[120px]">
            <label className="block text-sm font-medium text-gray-700 mb-2">End</label>
            <input
              type="time"
              value={quietEnd}
              onChange={(e) => setQuietEnd(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2"
            />
          </div>
        </div>
      </div>

      {/* Save button */}
      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="w-full bg-indigo-600 text-white py-4 rounded-xl font-semibold text-lg shadow-lg hover:bg-indigo-700 transition disabled:opacity-50"
      >
        {saving ? 'Saving...' : 'Save settings'}
      </button>
    </div>
  )
}
