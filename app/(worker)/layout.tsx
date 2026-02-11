'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Calendar, User, LogOut, Settings } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import NotificationBell from '@/components/NotificationBell'

const WORKER_VISIBLE_KEY = 'flexiwork_worker_visible'
const VISIBILITY_EVENT = 'flexiwork_worker_visibility_changed'

function isWorkerVisible(): boolean {
  if (typeof window === 'undefined') return false
  return window.localStorage?.getItem(WORKER_VISIBLE_KEY) === 'true'
}

export default function WorkerLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [visible, setVisible] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)
  const [user, setUser] = useState<{ id: string } | null>(null)

  useEffect(() => {
    setVisible(isWorkerVisible())
    setMounted(true)
  }, [])

  useEffect(() => {
    const onVisibilityChange = () => setVisible(isWorkerVisible())
    window.addEventListener('storage', onVisibilityChange)
    window.addEventListener(VISIBILITY_EVENT, onVisibilityChange)
    return () => {
      window.removeEventListener('storage', onVisibilityChange)
      window.removeEventListener(VISIBILITY_EVENT, onVisibilityChange)
    }
  }, [])

  useEffect(() => {
    if (!mounted) return
    supabase.auth.getUser().then(({ data: { user: u } }) => {
      setUser(u ?? null)
      setAuthChecked(true)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null)
      setAuthChecked(true)
    })
    return () => subscription.unsubscribe()
  }, [mounted])

  if (!mounted || !authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    )
  }

  // Logged-in workers always see the real dashboard (visibility gate only for unauthenticated visitors)
  if (user) {
    return (
      <div className="min-h-screen pb-20">
        <header className="sticky top-0 z-30 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-gray-900">FlexiWork</h1>
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
        </header>
        {children}
        <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-40 safe-area-pb">
          <div className="max-w-4xl mx-auto flex justify-around items-center h-16">
            <Link
              href="/worker/dashboard"
              className={`flex flex-col items-center gap-1 ${pathname === '/worker/dashboard' ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <Home className="w-6 h-6" />
              <span className="text-xs font-medium">Home</span>
            </Link>
            <Link
              href="/worker/shifts"
              className={`flex flex-col items-center gap-1 ${pathname?.startsWith('/worker/shifts') ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <Calendar className="w-6 h-6" />
              <span className="text-xs font-medium">Shifts</span>
            </Link>
            <Link
              href="/worker/profile"
              className={`flex flex-col items-center gap-1 ${pathname === '/worker/profile' ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <User className="w-6 h-6" />
              <span className="text-xs font-medium">Profile</span>
            </Link>
            <Link
              href="/worker/settings"
              className={`flex flex-col items-center gap-1 ${pathname === '/worker/settings' ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <Settings className="w-6 h-6" />
              <span className="text-xs font-medium">Settings</span>
            </Link>
          </div>
        </nav>
      </div>
    )
  }

  if (!visible) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="text-5xl font-bold bg-gradient-primary bg-clip-text text-transparent mb-4">
            FlexiWork
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Worker Portal</h1>
          <p className="text-gray-600 mb-6">Coming soon. Check back later.</p>
          <Link
            href="/auth/login"
            className="inline-block px-6 py-3 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    )
  }

  // Not logged in, visibility ON: show sign-in prompt
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Sign in</h1>
        <p className="text-gray-600 mb-6">Sign in to view your shifts and profile.</p>
        <Link
          href="/auth/login"
          className="inline-block px-6 py-3 bg-gradient-primary text-white rounded-lg font-medium hover:shadow-lg"
        >
          Sign in
        </Link>
      </div>
    </div>
  )
}
