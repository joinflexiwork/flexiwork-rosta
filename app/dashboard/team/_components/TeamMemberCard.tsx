'use client'

import RoleBadge from './RoleBadge'
import type { HierarchyLevel } from '@/lib/types/hierarchy'

type Member = {
  id: string
  hierarchy_level?: HierarchyLevel | null
  member_type?: string
  profile?: { full_name?: string; email?: string } | null
  roles?: { role?: { name?: string } }[]
}

type Props = {
  member: Member
  children?: React.ReactNode
}

export default function TeamMemberCard({ member, children }: Props) {
  const profile = member.profile
  const name = profile?.full_name || profile?.email || 'Pending'
  const level = (member.hierarchy_level as HierarchyLevel) || (member.member_type === 'manager' ? 'gm' : 'worker')

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="font-medium text-gray-900">{name}</p>
          <div className="mt-1 flex items-center gap-2">
            <RoleBadge level={level} />
            {member.roles?.map((r, i) => (
              <span key={i} className="text-xs text-gray-500">
                {r.role?.name}
              </span>
            ))}
          </div>
        </div>
        {children}
      </div>
    </div>
  )
}
