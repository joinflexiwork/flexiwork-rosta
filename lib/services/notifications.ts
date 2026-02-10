import { supabase } from '@/lib/supabase'

export type NotificationRow = {
  id: string
  user_id: string
  type: string
  title: string
  message: string | null
  data: Record<string, unknown>
  read: boolean
  created_at: string
}

export type ShiftNotificationRow = {
  id: string
  recipient_id: string
  sender_id: string | null
  type: string
  title: string | null
  message: string | null
  data: Record<string, unknown>
  is_read: boolean
  created_at: string
}

export async function getUnreadNotificationCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('read', false)

  if (error) return 0
  return count ?? 0
}

export async function getRecentNotifications(userId: string, limit = 10): Promise<NotificationRow[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('id, type, title, message, data, read, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) return []
  return (data ?? []) as NotificationRow[]
}

export async function markNotificationRead(id: string): Promise<void> {
  await supabase
    .from('notifications')
    .update({ read: true })
    .eq('id', id)
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  await supabase
    .from('notifications')
    .update({ read: true })
    .eq('user_id', userId)
    .eq('read', false)
}

/** Shift notifications (time submitted, approved, rejected, etc.) */
export async function getUnreadShiftNotificationCount(recipientId: string): Promise<number> {
  const { count, error } = await supabase
    .from('shift_notifications')
    .select('*', { count: 'exact', head: true })
    .eq('recipient_id', recipientId)
    .eq('is_read', false)
  if (error) return 0
  return count ?? 0
}

export async function getShiftNotifications(recipientId: string, limit = 20): Promise<ShiftNotificationRow[]> {
  const { data, error } = await supabase
    .from('shift_notifications')
    .select('*')
    .eq('recipient_id', recipientId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) return []
  return (data ?? []) as ShiftNotificationRow[]
}

export async function markShiftNotificationRead(id: string): Promise<void> {
  await supabase
    .from('shift_notifications')
    .update({ is_read: true })
    .eq('id', id)
}

export async function markAllShiftNotificationsRead(recipientId: string): Promise<void> {
  await supabase
    .from('shift_notifications')
    .update({ is_read: true })
    .eq('recipient_id', recipientId)
    .eq('is_read', false)
}
