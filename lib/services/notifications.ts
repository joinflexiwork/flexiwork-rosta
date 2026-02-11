import { supabase } from '@/lib/supabase'

export type NotificationRow = {
  id: string
  recipient_id: string
  category: string
  event_type: string
  title: string
  body: string | null
  is_read: boolean
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
    .eq('recipient_id', userId)
    .eq('is_read', false)

  if (error) {
    if (typeof window !== 'undefined') console.error('[notifications] getUnreadNotificationCount failed:', error.message, error)
    return 0
  }
  return count ?? 0
}

export async function getRecentNotifications(userId: string, limit = 10): Promise<NotificationRow[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('id, recipient_id, category, event_type, title, body, is_read, created_at')
    .eq('recipient_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    if (typeof window !== 'undefined') console.error('[notifications] getRecentNotifications failed:', error.message, error)
    return []
  }
  return (data ?? []).map((r: { id: string; body?: string; is_read?: boolean; [k: string]: unknown }) => ({
    id: r.id,
    recipient_id: (r as { recipient_id: string }).recipient_id,
    category: (r as { category: string }).category,
    event_type: (r as { event_type: string }).event_type,
    title: (r as { title: string }).title,
    body: r.body ?? null,
    is_read: r.is_read ?? false,
    created_at: (r as { created_at: string }).created_at,
  })) as NotificationRow[]
}

export async function markNotificationRead(id: string): Promise<void> {
  await supabase
    .from('notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('id', id)
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  await supabase
    .from('notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('recipient_id', userId)
    .eq('is_read', false)
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
