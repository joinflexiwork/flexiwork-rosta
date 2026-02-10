import Link from 'next/link'
import NotificationBell from '@/components/NotificationBell'

export default function Navigation() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-6 py-3">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-primary flex items-center justify-center">
              <div className="w-4 h-4 bg-white rounded-full" />
            </div>
            <span className="font-bold text-lg bg-gradient-primary bg-clip-text text-transparent">
              FlexiWork Rosta
            </span>
          </Link>

          {/* User Menu */}
          <div className="flex items-center gap-4">
            <NotificationBell />
            <div className="w-10 h-10 bg-gradient-primary rounded-full" />
          </div>
        </div>
      </div>
    </nav>
  )
}
