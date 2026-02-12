'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bell } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getPendingInvitesCount } from '@/lib/services/invites'
import {
  getUnreadNotificationCount,
  getRecentNotifications,
  getUnreadShiftNotificationCount,
  getShiftNotifications,
  markShiftNotificationRead,
  type NotificationRow,
  type ShiftNotificationRow,
} from '@/lib/services/notifications'

export default function NotificationBell() {
  const pathname = usePathname()
  const isEmployer = pathname?.startsWith('/dashboard')
  const dashboardHref = isEmployer ? '/dashboard' : pathname?.startsWith('/employee') ? '/employee/dashboard' : '/worker/dashboard'
  const [inviteCount, setInviteCount] = useState(0)
  const [notificationCount, setNotificationCount] = useState(0)
  const [shiftNotificationCount, setShiftNotificationCount] = useState(0)
  const [notifications, setNotifications] = useState<NotificationRow[]>([])
  const [shiftNotifications, setShiftNotifications] = useState<ShiftNotificationRow[]>([])
  const [open, setOpen] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [loadError, setLoadError] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const totalCount = inviteCount + notificationCount + shiftNotificationCount

  function clearOnError() {
    setInviteCount(0)
    setNotificationCount(0)
    setShiftNotificationCount(0)
    setNotifications([])
    setShiftNotifications([])
    setLoadError(true)
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUserId(user?.id ?? null)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUserId(session?.user?.id ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  function refresh() {
    if (!userId) return
    setLoadError(false)
    getPendingInvitesCount(userId).then(setInviteCount).catch(clearOnError)
    getUnreadNotificationCount(userId).then(setNotificationCount).catch(() => setNotificationCount(0))
    getUnreadShiftNotificationCount(userId).then(setShiftNotificationCount).catch(() => setShiftNotificationCount(0))
    getRecentNotifications(userId, 5).then(setNotifications).catch(() => setNotifications([]))
    getShiftNotifications(userId, 10).then(setShiftNotifications).catch(() => setShiftNotifications([]))
  }

  useEffect(() => {
    if (!userId) {
      setInviteCount(0)
      setNotificationCount(0)
      setShiftNotificationCount(0)
      setNotifications([])
      setShiftNotifications([])
      setLoadError(false)
      return
    }
    let cancelled = false
    setLoadError(false)
    getPendingInvitesCount(userId).then((n) => { if (!cancelled) setInviteCount(n) }).catch(() => { if (!cancelled) clearOnError() })
    getUnreadNotificationCount(userId).then((n) => { if (!cancelled) setNotificationCount(n) }).catch(() => { if (!cancelled) setNotificationCount(0) })
    getUnreadShiftNotificationCount(userId).then((n) => { if (!cancelled) setShiftNotificationCount(n) }).catch(() => { if (!cancelled) setShiftNotificationCount(0) })
    getRecentNotifications(userId, 5).then((list) => { if (!cancelled) setNotifications(list) }).catch(() => { if (!cancelled) setNotifications([]) })
    getShiftNotifications(userId, 10).then((list) => { if (!cancelled) setShiftNotifications(list) }).catch(() => { if (!cancelled) setShiftNotifications([]) })
    return () => { cancelled = true }
  }, [userId])

  useEffect(() => {
    if (!userId) return
    const channel = supabase
      .channel('shift_invites_notifications')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shift_invites' },
        () => { getPendingInvitesCount(userId).then(setInviteCount) }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [userId])

  useEffect(() => {
    if (!userId) return
    const channel = supabase
      .channel('notifications_table')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        refresh
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [userId])

  useEffect(() => {
    if (!userId) return
    const channel = supabase
      .channel('shift_notifications_realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'shift_notifications', filter: `recipient_id=eq.${userId}` },
        refresh
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [userId])

  async function markShiftAsRead(id: string) {
    await markShiftNotificationRead(id)
    refresh()
  }

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => { setOpen((o) => !o); if (!open) refresh() }}
        className="relative p-2 text-gray-600 hover:text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        aria-label={totalCount > 0 ? `${totalCount} notifications` : 'Notifications'}
      >
        <Bell className="w-6 h-6" />
        {totalCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            {totalCount > 99 ? '99+' : totalCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-72 rounded-lg border border-gray-200 bg-white shadow-lg py-2 z-50 max-h-[80vh] overflow-y-auto">
          {totalCount > 0 ? (
            <>
              {inviteCount > 0 && (
                <>
                  <div className="px-3 py-2 text-sm font-medium text-gray-700 border-b border-gray-100">
                    {inviteCount} pending invite{inviteCount !== 1 ? 's' : ''}
                  </div>
                  {isEmployer && (
                    <Link
                      href="/dashboard/team/invites"
                      onClick={() => setOpen(false)}
                      className="block px-3 py-2 text-sm text-blue-600 hover:bg-blue-50"
                    >
                      View invites
                    </Link>
                  )}
                </>
              )}
              {notificationCount > 0 && (
                <>
                  <div className="px-3 py-2 text-sm font-medium text-gray-700 border-b border-gray-100">
                    Notifications
                  </div>
                  {notifications.slice(0, 5).map((n) => (
                    <div
                      key={n.id}
                      className={`px-3 py-2 text-sm border-b border-gray-50 last:border-0 ${n.is_read ? 'text-gray-500' : 'text-gray-900'}`}
                    >
                      <p className="font-medium">{n.title}</p>
                      {n.body && <p className="text-gray-600 truncate">{n.body}</p>}
                    </div>
                  ))}
                </>
              )}
              {shiftNotificationCount > 0 && (
                <>
                  <div className="px-3 py-2 text-sm font-medium text-gray-700 border-b border-gray-100">
                    Time & shifts
                  </div>
                  {shiftNotifications.slice(0, 5).map((sn) => {
                    const href = isEmployer && sn.type === 'time_submitted'
                      ? '/dashboard/timekeeping?tab=approvals'
                      : '/employee/timesheets'
                    return (
                    <Link
                      key={sn.id}
                      href={href}
                      onClick={() => { markShiftAsRead(sn.id); setOpen(false) }}
                      className={`block px-3 py-2 text-sm border-b border-gray-50 last:border-0 hover:bg-gray-50 ${sn.is_read ? 'text-gray-500' : 'text-gray-900'}`}
                    >
                      <p className="font-medium">{sn.title ?? sn.type}</p>
                      {sn.message && <p className="text-gray-600 truncate">{sn.message}</p>}
                    </Link>
                  )})}
                  {shiftNotificationCount > 5 && (
                    <Link
                      href={isEmployer ? '/dashboard/timekeeping?tab=approvals' : '/employee/timesheets'}
                      onClick={() => setOpen(false)}
                      className="block px-3 py-2 text-sm text-blue-600 hover:bg-blue-50"
                    >
                      View all →
                    </Link>
                  )}
                </>
              )}
            </>
          ) : (
            <div className="px-3 py-4 text-sm text-gray-500 text-center">
              {loadError ? 'Couldn\'t load notifications. Check your connection.' : 'No pending invitations or notifications'}
            </div>
          )}
          <Link
            href={dashboardHref}
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 border-t border-gray-100 font-medium mt-1"
          >
            View dashboard
          </Link>
        </div>
      )}
    </div>
  )
}
