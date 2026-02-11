'use server'

import {
  createNotification as createNotificationNew,
  getUnreadNotificationCount,
  markNotificationAsRead,
} from '@/app/actions/notification-actions'
import { updateNotificationPreferences } from '@/app/actions/notification-actions'
import type { NotificationType, NotificationPriority } from '@/types/notifications'

/** Legacy adapter: create notification (requires organisationId). */
export async function createNotification(
  organisationId: string,
  recipientId: string,
  type: NotificationType | string,
  title: string,
  message: string,
  metadata: Record<string, unknown> = {},
  priority: NotificationPriority = 'normal'
) {
  const result = await createNotificationNew({
    organisationId,
    actorId: null,
    recipientId,
    category: 'hierarchy',
    eventType: type,
    title,
    body: message,
    priority: priority as 'low' | 'normal' | 'high' | 'critical',
  })
  if (!result.success) throw new Error(result.error)
}

export async function markAsRead(notificationId: string) {
  const { createClient } = await import('@/lib/supabase-server')
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const result = await markNotificationAsRead(notificationId, user.id)
  if (!result.success) throw new Error(result.error)
}

export async function getUnreadCount(userId: string): Promise<number> {
  return getUnreadNotificationCount(userId)
}

export async function markAllAsRead(userId: string) {
  const { createClient } = await import('@/lib/supabase-server')
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || user.id !== userId) throw new Error('Not authenticated')

  const { getSupabaseAdmin } = await import('@/lib/supabase-admin')
  const admin = getSupabaseAdmin()
  await admin
    .from('notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('recipient_id', userId)
}

/** Legacy: update notification preferences. Use notification-actions for new schema. */
export async function updatePreferences(
  userId: string,
  organisationId: string,
  type: string,
  channels: { email: boolean; push: boolean; in_app: boolean },
  quietHoursStart?: string,
  quietHoursEnd?: string
) {
  const prefs = {
    hierarchy_changes: channels,
    shift_changes: channels,
    approvals: channels,
    system_alerts: channels,
    quiet_hours_start: quietHoursStart,
    quiet_hours_end: quietHoursEnd,
  }
  const result = await updateNotificationPreferences(userId, organisationId, prefs)
  if (!result.success) throw new Error(result.error)
}
