'use client'

import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import {
  NOTIFICATION_TYPES,
  getNotificationPreferences,
  setNotificationPreference,
  type NotificationTypeId,
} from '@/lib/services/notificationPreferences'

type TabId = 'notifications' | 'account' | 'privacy'

export default function SettingsModal({
  userId,
  onClose,
}: {
  userId: string
  onClose: () => void
}) {
  const [activeTab, setActiveTab] = useState<TabId>('notifications')
  const [prefs, setPrefs] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    getNotificationPreferences(userId).then((map) => {
      if (!cancelled) {
        const defaults: Record<string, boolean> = {}
        NOTIFICATION_TYPES.forEach(({ id }) => {
          defaults[id] = map[id] !== false
        })
        setPrefs(defaults)
      }
    }).catch(() => {
      if (!cancelled) setToast({ type: 'error', message: 'Failed to load preferences' })
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [userId])

  async function handleToggle(type: NotificationTypeId, enabled: boolean) {
    setPrefs((p) => ({ ...p, [type]: enabled }))
    setSaving(type)
    setToast(null)
    try {
      await setNotificationPreference(userId, type, enabled)
      setToast({ type: 'success', message: 'Preferences saved.' })
    } catch {
      setToast({ type: 'error', message: 'Failed to save.' })
      setPrefs((p) => ({ ...p, [type]: !enabled }))
    } finally {
      setSaving(null)
    }
  }

  const tabs: { id: TabId; label: string }[] = [
    { id: 'notifications', label: 'Notifications' },
    { id: 'account', label: 'Account' },
    { id: 'privacy', label: 'Privacy' },
  ]

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-4 border-b border-gray-200 flex justify-between items-center flex-shrink-0">
          <h2 className="text-lg font-bold">Settings</h2>
          <button type="button" onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg" aria-label="Close">
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

        <div className="flex border-b border-gray-200 flex-shrink-0">
          {tabs.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px ${
                activeTab === id
                  ? 'border-purple-600 text-purple-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="p-4 flex-1 overflow-y-auto min-h-0">
          {activeTab === 'notifications' && (
            <>
              {loading ? (
                <div className="text-sm text-gray-500 py-4">Loading...</div>
              ) : (
                <ul className="space-y-3">
                  {NOTIFICATION_TYPES.map(({ id, label }) => (
                    <li key={id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                      <span className="text-sm text-gray-900">{label}</span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={prefs[id] !== false}
                        disabled={saving === id}
                        onClick={() => handleToggle(id, prefs[id] === false)}
                        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 disabled:opacity-50 ${
                          prefs[id] !== false ? 'bg-purple-600' : 'bg-gray-200'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition ${
                            prefs[id] !== false ? 'translate-x-5' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          {activeTab === 'account' && (
            <div className="text-sm text-gray-500 py-4">Account settings coming soon.</div>
          )}
          {activeTab === 'privacy' && (
            <div className="text-sm text-gray-500 py-4">Privacy settings coming soon.</div>
          )}
        </div>
      </div>
    </div>
  )
}
