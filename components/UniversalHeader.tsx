'use client'

import { usePathname } from 'next/navigation'
import BackButton from './BackButton'
import CenteredLogo from './CenteredLogo'

type Props = {
  /** Fallback route when user has no history (e.g. /dashboard, /employee/dashboard, /) */
  backFallbackHref?: string
  /** Optional right slot (e.g. NotificationBell) */
  rightSlot?: React.ReactNode
}

/** Fixed header: back button (top-left), centered logo, optional right slot. No back button on login. */
export default function UniversalHeader({ backFallbackHref, rightSlot }: Props) {
  const pathname = usePathname()
  const isLoginPage = pathname === '/login'

  return (
    <div className="fixed top-0 left-0 right-0 z-50 h-20 pointer-events-none">
      {!isLoginPage && (
        <div className="pointer-events-auto">
          <BackButton fallbackHref={backFallbackHref} />
        </div>
      )}
      <CenteredLogo />
      {rightSlot != null && (
        <div className="absolute right-4 top-4 pointer-events-auto z-50">
          {rightSlot}
        </div>
      )}
    </div>
  )
}
