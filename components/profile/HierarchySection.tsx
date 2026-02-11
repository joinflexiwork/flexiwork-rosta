'use client'

import { UserCog } from 'lucide-react'

const POSITION_LABELS: Record<string, string> = {
  worker: 'Worker',
  shift_leader: 'Shift Leader',
  agm: 'AGM',
  gm: 'GM',
}

export interface HierarchySectionProps {
  hierarchyLevel: string
  status: string
  /** When true, show edit controls (position dropdown, status radio). Used by employer view. */
  editable?: boolean
  selectedPosition?: string
  selectedStatus?: string
  allowedPositions?: string[]
  onPositionChange?: (value: string) => void
  onStatusChange?: (value: string) => void
  /** Optional: reset password button (employer only) */
  resetPasswordButton?: React.ReactNode
  /** Optional: delete worker button (employer only) */
  deleteButton?: React.ReactNode
}

export function HierarchySection({
  hierarchyLevel,
  status,
  editable = false,
  selectedPosition = 'worker',
  selectedStatus = 'active',
  allowedPositions = [],
  onPositionChange,
  onStatusChange,
  resetPasswordButton,
  deleteButton,
}: HierarchySectionProps) {
  const pos = selectedPosition || hierarchyLevel
  const st = selectedStatus || status

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
        <UserCog className="w-5 h-5 text-indigo-600" />
        Hierarchy &amp; status
      </h2>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Current position</label>
          {editable && allowedPositions.length > 0 && onPositionChange ? (
            <select
              value={pos}
              onChange={(e) => onPositionChange(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full max-w-xs bg-white"
            >
              {allowedPositions.map((level) => (
                <option key={level} value={level}>
                  {POSITION_LABELS[level] ?? level}
                </option>
              ))}
            </select>
          ) : (
            <p className="text-gray-700 capitalize">{POSITION_LABELS[hierarchyLevel] ?? hierarchyLevel}</p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
          {editable && onStatusChange ? (
            <div className="flex gap-4">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="status"
                  checked={st === 'active'}
                  onChange={() => onStatusChange('active')}
                  className="rounded-full border-gray-300"
                />
                <span>Active</span>
              </label>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="status"
                  checked={st === 'inactive'}
                  onChange={() => onStatusChange('inactive')}
                  className="rounded-full border-gray-300"
                />
                <span>Inactive</span>
              </label>
            </div>
          ) : (
            <span
              className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${
                status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'
              }`}
            >
              {status === 'active' ? 'Active' : 'Inactive'}
            </span>
          )}
        </div>
        {resetPasswordButton}
        {deleteButton}
      </div>
    </div>
  )
}
