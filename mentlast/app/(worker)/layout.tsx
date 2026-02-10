'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Calendar, User, Bell } from 'lucide-react'
import { supabase } from '@/lib/supabase'

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
    if (!mounted || !visible) return
    supabase.auth.getUser().then(({ data: { user: u } }) => setUser(u ?? null))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [mounted, visible])

  if (!mounted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    )
  }

  if (!visible) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="text-5xl font-bold bg-gradient-primary bg-clip-text text-transparent mb-4">
            FlexiWork
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Worker Portal</h1>
          <p className="text-gray-600 mb-6">Coming soon. Check back later.</p>
          <Link
            href="/login"
            className="inline-block px-6 py-3 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Sign in</h1>
          <p className="text-gray-600 mb-6">Sign in to view your shifts and profile.</p>
          <Link
            href="/login"
            className="inline-block px-6 py-3 bg-gradient-primary text-white rounded-lg font-medium hover:shadow-lg"
          >
            Sign in
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <header className="sticky top-0 z-30 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">FlexiWork</h1>
        <Link
          href="/worker/dashboard"
          className="relative p-2 text-gray-600 hover:text-gray-900 rounded-lg"
          aria-label="Notifications"
        >
          <Bell className="w-6 h-6" />
        </Link>
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
        </div>
      </nav>
    </div>
  )
}
