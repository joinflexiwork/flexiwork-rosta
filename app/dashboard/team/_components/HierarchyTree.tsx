'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import RoleBadge from './RoleBadge'
import type { HierarchyLevel } from '@/lib/types/hierarchy'

type Member = Record<string, unknown> & {
  id: string
  hierarchy_level?: HierarchyLevel | null
  profile?: { full_name?: string; email?: string } | null
}

type Chain = { manager_id: string; subordinate_id: string }

type Props = { members: Member[]; chain: Chain[] }

function TreeNode({
  memberId,
  membersById,
  chainByManager,
  level,
}: {
  memberId: string
  membersById: Map<string, Member>
  chainByManager: Map<string, Chain[]>
  level: number
}) {
  const member = membersById.get(memberId)
  const subs = chainByManager.get(memberId) ?? []
  const [open, setOpen] = useState(level < 2)
  if (!member) return null
  const profile = member.profile as { full_name?: string; email?: string } | undefined
  const name = profile?.full_name || profile?.email || 'Pending'
  const hierarchyLevel = (member.hierarchy_level as HierarchyLevel) || 'worker'
  return (
    <div className="ml-4 border-l border-gray-200 pl-3">
      <div className="flex items-center gap-2 py-1" role="button" tabIndex={0} onClick={() => setOpen((o) => !o)}>
        {subs.length > 0 ? (open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />) : <span className="w-4" />}
        <RoleBadge level={hierarchyLevel} />
        <span className="text-sm font-medium">{name}</span>
      </div>
      {open && subs.length > 0 && subs.map((c) => <TreeNode key={c.subordinate_id} memberId={c.subordinate_id} membersById={membersById} chainByManager={chainByManager} level={level + 1} />)}
    </div>
  )
}

export default function HierarchyTree({ members, chain }: Props) {
  const membersById = new Map(members.map((m) => [m.id, m]))
  const chainByManager = new Map<string, Chain[]>()
  chain.forEach((c) => {
    const list = chainByManager.get(c.manager_id) ?? []
    list.push(c)
    chainByManager.set(c.manager_id, list)
  })
  const employers = members.filter((m) => (m.hierarchy_level as string) === 'employer')
  const roots = employers.length ? employers : members.filter((m) => !chain.some((c) => c.subordinate_id === m.id)).slice(0, 5)
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-gray-700">Team hierarchy</h3>
      {roots.length === 0 ? <p className="text-sm text-gray-500">No hierarchy data yet.</p> : roots.map((m) => <TreeNode key={m.id} memberId={m.id} membersById={membersById} chainByManager={chainByManager} level={0} />)}
    </div>
  )
}
