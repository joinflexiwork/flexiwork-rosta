'use client'

import dynamic from 'next/dynamic'
import UniversalHeader from '@/components/UniversalHeader'

const NotificationBell = dynamic(
  () => import('@/components/NotificationBell').then((m) => m.default),
  { ssr: false }
)

export default function EmployeePageHeader() {
  return (
    <UniversalHeader
      backFallbackHref="/employee/dashboard"
      rightSlot={<NotificationBell />}
    />
  )
}
