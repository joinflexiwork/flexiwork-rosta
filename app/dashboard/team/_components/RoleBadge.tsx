'use client'

import type { HierarchyLevel } from '@/lib/types/hierarchy'

const STYLES: Record<HierarchyLevel, string> = {
  employer: 'bg-yellow-100 text-yellow-800',
  gm: 'bg-purple-100 text-purple-800',
  agm: 'bg-blue-100 text-blue-800',
  shift_leader: 'bg-green-100 text-green-800',
  worker: 'bg-gray-100 text-gray-800',
}

const LABELS: Record<HierarchyLevel, string> = {
  employer: 'Employer',
  gm: 'GM',
  agm: 'AGM',
  shift_leader: 'Shift Leader',
  worker: 'Worker',
}

type Props = { level: HierarchyLevel; className?: string }

export default function RoleBadge({ level, className = '' }: Props) {
  const style = STYLES[level] ?? STYLES.worker
  const label = LABELS[level] ?? level
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${style} ${className}`}>
      {label}
    </span>
  )
}
