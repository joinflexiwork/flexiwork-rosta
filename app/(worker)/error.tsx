'use client'

import { useEffect } from 'react'

export default function WorkerErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[Worker] Error boundary:', error)
  }, [error])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gray-50">
      <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
        <h2 className="text-xl font-bold text-gray-900 mb-2">Something went wrong</h2>
        <p className="text-gray-600 text-sm mb-6">
          Please try again or log out.
        </p>
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={reset}
            className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
          >
            Try again
          </button>
          <a
            href="/auth/login?logout=true"
            className="w-full px-4 py-3 border border-red-300 text-red-700 rounded-lg font-medium hover:bg-red-50 text-center"
          >
            Logout
          </a>
        </div>
      </div>
    </div>
  )
}
