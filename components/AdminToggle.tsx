'use client'

import { useState, useEffect, useCallback } from 'react'
import { getMyOrganisations } from '@/lib/services/organisations'
import { getOrganisationSettings, updateOrganisationSetting, updateShowGigFeatures } from '@/lib/services/settings'

const PIN = '1980.10.14'
const STORAGE_KEY = 'flexiwork_worker_visible'
const VISIBILITY_EVENT = 'flexiwork_worker_visibility_changed'

export function AdminToggleListener() {
  const [showModal, setShowModal] = useState(false)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'h') {
        e.preventDefault()
        setShowModal(true)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  if (!showModal) return null
  return (
    <AdminToggleModal
      onClose={() => setShowModal(false)}
    />
  )
}

function AdminToggleModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<'pin' | 'toggle'>('pin')
  const [pinValue, setPinValue] = useState('')
  const [error, setError] = useState('')
  const [visible, setVisible] = useState(false)
  const [orgId, setOrgId] = useState<string | null>(null)
  const [showRatings, setShowRatings] = useState(true)
  const [showGigFeatures, setShowGigFeatures] = useState(false)
  const [ratingSaving, setRatingSaving] = useState(false)
  const [gigSaving, setGigSaving] = useState(false)
  const [orgLoading, setOrgLoading] = useState(true)
  const [settingsSavedToast, setSettingsSavedToast] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setVisible(window.localStorage.getItem(STORAGE_KEY) === 'true')
    }
  }, [step])

  useEffect(() => {
    if (step !== 'toggle') return
    let cancelled = false
    setOrgLoading(true)
    getMyOrganisations()
      .then((orgs) => {
        if (cancelled) return
        const id = (orgs?.[0] as { id?: string })?.id ?? null
        setOrgId(id ?? null)
        if (!id) {
          setOrgLoading(false)
          return
        }
        return getOrganisationSettings(id)
      })
      .then((settings) => {
        if (cancelled) return
        if (settings) {
          setShowRatings(settings.show_ratings !== false)
          setShowGigFeatures(settings.show_gig_features === true)
        }
        setOrgLoading(false)
      })
      .catch(() => {
        if (!cancelled) {
          setOrgId(null)
          setOrgLoading(false)
        }
      })
    return () => { cancelled = true }
  }, [step])

  const handlePinSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    if (pinValue === PIN) {
      setError('')
      setStep('toggle')
    } else {
      setError('Incorrect PIN')
    }
  }, [pinValue])

  const handleToggle = useCallback(() => {
    const next = !visible
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, next ? 'true' : 'false')
      setVisible(next)
      window.dispatchEvent(new CustomEvent(VISIBILITY_EVENT))
    }
  }, [visible])

  const handleRatingToggle = useCallback(async () => {
    if (!orgId || ratingSaving) return
    const next = !showRatings
    setRatingSaving(true)
    try {
      await updateOrganisationSetting(orgId, 'show_ratings', next)
      setShowRatings(next)
      setSettingsSavedToast(true)
      setTimeout(() => setSettingsSavedToast(false), 3000)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to update setting')
    } finally {
      setRatingSaving(false)
    }
  }, [orgId, showRatings, ratingSaving])

  const handleGigToggle = useCallback(async () => {
    if (!orgId || gigSaving) return
    const next = !showGigFeatures
    setGigSaving(true)
    try {
      await updateShowGigFeatures(orgId, next)
      setShowGigFeatures(next)
      setSettingsSavedToast(true)
      setTimeout(() => setSettingsSavedToast(false), 3000)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to update setting')
    } finally {
      setGigSaving(false)
    }
  }, [orgId, showGigFeatures, gigSaving])

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50"
      role="dialog"
      aria-label="Admin toggle"
    >
      <div
        className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {step === 'pin' ? (
          <>
            <h2 className="text-lg font-bold text-gray-900 mb-2">Admin</h2>
            <p className="text-sm text-gray-600 mb-4">Enter PIN to continue</p>
            <form onSubmit={handlePinSubmit}>
              <input
                type="password"
                value={pinValue}
                onChange={(e) => { setPinValue(e.target.value); setError(''); }}
                placeholder="PIN"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg mb-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                autoFocus
              />
              {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
                >
                  Continue
                </button>
              </div>
            </form>
          </>
        ) : (
          <>
            <h2 className="text-lg font-bold text-gray-900 mb-2">Admin panel</h2>

            <section className="mb-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Worker interface</h3>
              <div className="flex items-center justify-between gap-4 py-2">
                <span className="text-sm text-gray-700">Visibility</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={visible}
                  onClick={handleToggle}
                  className={`relative inline-flex h-7 w-12 flex-shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${visible ? 'bg-blue-600' : 'bg-gray-200'}`}
                >
                  <span
                    className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition ${visible ? 'translate-x-5' : 'translate-x-1'}`}
                  />
                </button>
              </div>
              <p className="text-xs text-gray-500">
                {visible ? 'ON – Worker portal is visible at /worker/*' : 'OFF – Worker portal shows “Coming soon”'}
              </p>
            </section>

            <section className="mb-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Feature toggles</h3>
              {settingsSavedToast && (
                <p className="text-xs text-green-600 mb-2 font-medium">Settings saved. Refresh the Team or Worker page to apply.</p>
              )}
              {orgLoading ? (
                <p className="text-xs text-gray-500">Loading…</p>
              ) : !orgId ? (
                <p className="text-xs text-gray-500">No organisation – sign in as an org owner to change feature toggles.</p>
              ) : (
                <div className="border border-gray-200 rounded-lg p-3 space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-medium text-gray-900">Worker Rating System</span>
                      <p className="text-xs text-gray-500 mt-0.5">
                        When ON, managers can rate workers and ratings are visible. When OFF, ratings are hidden everywhere.
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={showRatings}
                      disabled={ratingSaving}
                      onClick={handleRatingToggle}
                      className={`relative inline-flex h-7 w-12 flex-shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 ${showRatings ? 'bg-blue-600' : 'bg-gray-200'}`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition ${showRatings ? 'translate-x-5' : 'translate-x-1'}`}
                      />
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-4 pt-2 border-t border-gray-100">
                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-medium text-gray-900">Gig Platform Features</span>
                      <p className="text-xs text-gray-500 mt-0.5">
                        When ON, workers see “Unlock More Opportunities” and employers see the Gig Platform tab. When OFF, both are hidden.
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={showGigFeatures}
                      disabled={gigSaving}
                      onClick={handleGigToggle}
                      className={`relative inline-flex h-7 w-12 flex-shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 ${showGigFeatures ? 'bg-blue-600' : 'bg-gray-200'}`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition ${showGigFeatures ? 'translate-x-5' : 'translate-x-1'}`}
                      />
                    </button>
                  </div>
                  <p className="text-xs text-gray-500">
                    Rating: {showRatings ? 'Active' : 'Hidden'}
                    {ratingSaving && ' (saving…)'}
                    {' · '}
                    Gig: {showGigFeatures ? 'Visible' : 'Hidden'}
                    {gigSaving && ' (saving…)'}
                  </p>
                </div>
              )}
            </section>

            <button
              type="button"
              onClick={onClose}
              className="w-full px-4 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50"
            >
              Close
            </button>
          </>
        )}
      </div>
    </div>
  )
}
