'use client'

import { useEffect, useState } from 'react'
import { checkPermission } from '@/app/actions/hierarchy'
import type { Permissions } from '@/lib/types/hierarchy'
import { supabase } from '@/lib/supabase'

type PermissionKey = keyof Permissions

type Props = {
  requiredLevel?: import('@/lib/types/hierarchy').HierarchyLevel
  requiredPermission?: PermissionKey
  children: React.ReactNode
  fallback?: React.ReactNode
}

export default function PermissionGuard({ requiredLevel, requiredPermission, children, fallback }: Props) {
  const [allowed, setAllowed] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (cancelled || !user) {
        if (!cancelled) setAllowed(false)
        return
      }
      if (requiredPermission) {
        checkPermission(user.id, requiredPermission).then((ok) => {
          if (!cancelled) setAllowed(ok)
        })
        return
      }
      if (requiredLevel) {
        supabase
          .from('team_members')
          .select('hierarchy_level')
          .eq('user_id', user.id)
          .limit(1)
          .maybeSingle()
          .then(({ data }) => {
            if (cancelled) return
            const level = (data as { hierarchy_level?: string } | null)?.hierarchy_level
            const order = ['employer', 'gm', 'agm', 'shift_leader', 'worker']
            const userRank = order.indexOf(level || 'worker')
            const requiredRank = order.indexOf(requiredLevel)
            setAllowed(userRank <= requiredRank)
          })
        return
      }
      setAllowed(true)
    })
    return () => { cancelled = true }
  }, [requiredLevel, requiredPermission])

  if (allowed === null) return null
  if (!allowed) return <>{fallback ?? <div className="p-4 text-gray-600">Access denied.</div>}</>
  return <>{children}</>
}
