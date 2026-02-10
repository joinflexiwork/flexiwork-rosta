'use client'

import { useState, useEffect, useCallback } from 'react'

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

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setVisible(window.localStorage.getItem(STORAGE_KEY) === 'true')
    }
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
            <h2 className="text-lg font-bold text-gray-900 mb-2">Worker interface</h2>
            <div className="flex items-center justify-between gap-4 py-4">
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
            <p className="text-xs text-gray-500 mb-4">
              {visible ? 'ON – Worker portal is visible at /worker/*' : 'OFF – Worker portal shows “Coming soon”'}
            </p>
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
