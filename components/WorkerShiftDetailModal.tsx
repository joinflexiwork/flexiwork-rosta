'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { X } from 'lucide-react'
import { getWorkerShiftDetails } from '@/lib/services/allocations'
import type { WorkerShiftAllocation } from '@/components/WorkerShiftCard'
import WorkerShiftCard from '@/components/WorkerShiftCard'

type Props = {
  allocationId: string | null
  onClose: () => void
}

export default function WorkerShiftDetailModal({ allocationId, onClose }: Props) {
  const [allocation, setAllocation] = useState<WorkerShiftAllocation | null>(null)
  const [loading, setLoading] = useState(!!allocationId)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!allocationId) {
      setAllocation(null)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    getWorkerShiftDetails(allocationId)
      .then((data) => {
        setAllocation(data as WorkerShiftAllocation)
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load shift')
        setAllocation(null)
      })
      .finally(() => setLoading(false))
  }, [allocationId])

  if (!allocationId) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-hidden flex flex-col border border-gray-100"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-gradient-to-r from-indigo-500 to-purple-600 px-4 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Shift details</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/20 text-white transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto flex-1">
          {loading && <p className="text-gray-500 text-sm">Loading...</p>}
          {error && <p className="text-red-600 text-sm">{error}</p>}
          {!loading && !error && allocation && (
            <>
              <WorkerShiftCard allocation={allocation} showViewDetails={false} />
              <div className="mt-6 space-y-3">
                <Link
                  href={`/employee/clock?shift=${allocation.rota_shift_id}`}
                  className="block w-full text-center px-4 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-lg font-medium hover:shadow-lg transition-all"
                >
                  Clock in / View details
                </Link>
                <Link
                  href={`/employee/dock?shift=${allocation.rota_shift_id}`}
                  className="block w-full text-center px-4 py-3 border border-indigo-500 text-indigo-600 rounded-lg font-medium hover:bg-indigo-50 transition-all"
                >
                  Enter time manually (submit for approval)
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
