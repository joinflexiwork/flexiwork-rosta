'use client'

import { X } from 'lucide-react'

export interface RoleItem {
  id: string
  name: string
  colour?: string
}

export interface RolesListProps {
  roles: RoleItem[]
  /** All available roles for dropdown (employer edit mode) */
  allRoles?: RoleItem[]
  maxRoles?: number
  editable?: boolean
  selectedRoleIds?: string[]
  onAddRole?: (roleId: string) => void
  onRemoveRole?: (roleId: string) => void
}

export function RolesList({
  roles,
  allRoles = [],
  maxRoles = 5,
  editable = false,
  selectedRoleIds = [],
  onAddRole,
  onRemoveRole,
}: RolesListProps) {
  const displayRoles = editable && selectedRoleIds.length > 0
    ? selectedRoleIds.map((rid) => {
        const r = roles.find((x) => String(x.id) === rid) || allRoles.find((x) => String(x.id) === rid)
        return r ? { id: rid, name: r.name, colour: r.colour } : null
      }).filter(Boolean) as RoleItem[]
    : roles

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <h2 className="text-lg font-bold text-gray-900 mb-4">Roles (max {maxRoles})</h2>
      <div className="flex flex-wrap gap-2 mb-2">
        {displayRoles.map((r) => (
          <span
            key={r.id}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium text-white"
            style={{ backgroundColor: r.colour || '#6b7280' }}
          >
            {r.name}
            {editable && onRemoveRole && (
              <button
                type="button"
                onClick={() => onRemoveRole(r.id)}
                className="ml-0.5 hover:opacity-80"
                aria-label="Remove role"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </span>
        ))}
      </div>
      {editable && allRoles.length > 0 && onAddRole && displayRoles.length < maxRoles && (
        <>
          <label className="block text-sm font-medium text-gray-700 mb-1">Add role</label>
          <select
            value=""
            onChange={(e) => {
              const v = e.target.value
              if (v) onAddRole(v)
              e.target.value = ''
            }}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm max-w-xs"
          >
            <option value="">— Select role —</option>
            {allRoles
              .filter((r) => !selectedRoleIds.includes(String(r.id)))
              .map((r) => (
                <option key={String(r.id)} value={String(r.id)}>
                  {r.name}
                </option>
              ))}
          </select>
          {displayRoles.length >= maxRoles && <p className="text-xs text-amber-600 mt-1">Maximum {maxRoles} roles.</p>}
        </>
      )}
      {displayRoles.length === 0 && (
        <p className="text-sm text-gray-500">No roles assigned</p>
      )}
    </div>
  )
}
