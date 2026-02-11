'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { getUnreadCount, markAsRead, markAllAsRead } from '@/app/actions/notifications'
import { getRecentNotifications, type NotificationRow } from '@/lib/services/notifications'

export function useNotifications(userId: string | null) {
  const [unreadCount, setUnreadCount] = useState(0)
  const [list, setList] = useState<NotificationRow[]>([])
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    try {
      const [count, notifications] = await Promise.all([
        getUnreadCount(userId),
        getRecentNotifications(userId, 15),
      ])
      setUnreadCount(count)
      setList(notifications)
    } catch (e) {
      console.error('[useNotifications] refresh failed:', e)
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    if (!userId) return
    refresh()
  }, [userId, refresh])

  useEffect(() => {
    if (!userId) return
    const channel = supabase
      .channel('notifications-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${userId}` }, () => {
        refresh()
      })
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId, refresh])

  const markOneAsRead = useCallback(
    async (id: string) => {
      await markAsRead(id)
      setList((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)))
      setUnreadCount((c) => Math.max(0, c - 1))
    },
    []
  )

  const markAllRead = useCallback(async () => {
    if (!userId) return
    await markAllAsRead(userId)
    setUnreadCount(0)
    setList((prev) => prev.map((n) => ({ ...n, is_read: true })))
  }, [userId])

  return { unreadCount, list, loading, refresh, markOneAsRead, markAllRead }
}
