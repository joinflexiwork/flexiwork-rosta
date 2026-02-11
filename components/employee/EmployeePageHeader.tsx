'use client'

import dynamic from 'next/dynamic'
import { LogOut } from 'lucide-react'
import UniversalHeader from '@/components/UniversalHeader'
import { supabase } from '@/lib/supabase'

const NotificationBell = dynamic(
  () => import('@/components/NotificationBell').then((m) => m.default),
  { ssr: false }
)

export default function EmployeePageHeader() {
  return (
    <UniversalHeader
      backFallbackHref="/employee/dashboard"
      rightSlot={
        <div className="flex items-center gap-2">
          <NotificationBell />
          <button
            type="button"
            onClick={async () => {
              await supabase.auth.signOut()
              window.location.href = '/auth/login'
            }}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      }
    />
  )
}
