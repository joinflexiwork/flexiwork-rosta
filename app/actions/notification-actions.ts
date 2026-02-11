'use server'

import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { revalidatePath } from 'next/cache'

// ============================================
// TYPES
// ============================================

export type NotificationCategory = 'hierarchy' | 'shift' | 'approval' | 'system'
export type NotificationPriority = 'low' | 'normal' | 'high' | 'critical'

export interface NotificationChannelSettings {
  in_app: boolean
  email: boolean
  push: boolean
}

export interface NotificationPreferences {
  hierarchy_changes: NotificationChannelSettings
  shift_changes: NotificationChannelSettings
  approvals: NotificationChannelSettings
  system_alerts: NotificationChannelSettings
  quiet_hours_start?: string
  quiet_hours_end?: string
  timezone?: string
}

export interface CreateNotificationPayload {
  organisationId: string
  actorId: string | null
  recipientId: string
  category: NotificationCategory
  eventType: string
  title: string
  body: string
  priority?: NotificationPriority
  actionLink?: string
  expiresAt?: Date
}

// ============================================
// PREFERENCES: Check if notification should be sent
// ============================================

export async function shouldSendNotification(
  profileId: string,
  organisationId: string,
  category: NotificationCategory,
  channel: 'in_app' | 'email' | 'push' = 'in_app'
): Promise<boolean> {
  const supabase = getSupabaseAdmin()

  const { data: prefs } = await supabase
    .from('notification_preferences')
    .select('hierarchy_changes, shift_changes, approvals, system_alerts, quiet_hours_start, quiet_hours_end')
    .eq('profile_id', profileId)
    .eq('organisation_id', organisationId)
    .maybeSingle()

  if (!prefs) return true

  const categoryKey =
    category === 'hierarchy'
      ? 'hierarchy_changes'
      : category === 'shift'
        ? 'shift_changes'
        : category === 'approval'
          ? 'approvals'
          : 'system_alerts'

  const cat = prefs[categoryKey as keyof typeof prefs] as { in_app?: boolean; email?: boolean; push?: boolean } | undefined
  const enabled = cat?.[channel] ?? true
  if (!enabled) return false

  if (channel === 'push') {
    const start = prefs.quiet_hours_start as string | null
    const end = prefs.quiet_hours_end as string | null
    if (start && end) {
      const now = new Date()
      const tz = prefs.timezone as string | undefined
      const nowTime = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz || 'Europe/Budapest' })
      const [h, m] = nowTime.split(':').map(Number)
      const nowMinutes = h * 60 + m
      const [sh, sm] = start.slice(0, 5).split(':').map(Number)
      const [eh, em] = end.slice(0, 5).split(':').map(Number)
      const startMinutes = sh * 60 + sm
      const endMinutes = eh * 60 + em
      if (startMinutes > endMinutes) {
        if (nowMinutes >= startMinutes || nowMinutes < endMinutes) return false
      } else if (nowMinutes >= startMinutes && nowMinutes < endMinutes) {
        return false
      }
    }
  }

  return true
}

// ============================================
// CORE: Create Notification
// ============================================

export async function createNotification(
  payload: CreateNotificationPayload
): Promise<{ success: boolean; id?: string; error?: string }> {
  const supabase = getSupabaseAdmin()

  try {
    const { data: recipient, error: recipientError } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', payload.recipientId)
      .single()

    if (recipientError || !recipient) {
      throw new Error(`Recipient not found: ${payload.recipientId}`)
    }

    // Ensure recipient has notification preferences (create default if missing)
    const { data: prefs } = await supabase
      .from('notification_preferences')
      .select('id')
      .eq('profile_id', payload.recipientId)
      .eq('organisation_id', payload.organisationId)
      .maybeSingle()

    if (!prefs) {
      await supabase.from('notification_preferences').insert({
        profile_id: payload.recipientId,
        organisation_id: payload.organisationId,
        hierarchy_changes: { in_app: true, email: true, push: true },
        shift_changes: { in_app: true, email: false, push: true },
        approvals: { in_app: true, email: true, push: false },
        system_alerts: { in_app: true, email: true, push: false },
      })
    }

    const { data, error } = await supabase
      .from('notifications')
      .insert({
        organisation_id: payload.organisationId,
        actor_id: payload.actorId,
        recipient_id: payload.recipientId,
        category: payload.category,
        event_type: payload.eventType,
        title: payload.title,
        body: payload.body,
        priority: payload.priority || 'normal',
        action_link: payload.actionLink,
        expires_at: payload.expiresAt?.toISOString(),
      })
      .select('id')
      .single()

    if (error) {
      console.error('Notification insert error:', error)
      throw new Error(`Failed to create notification: ${error.message}`)
    }

    return { success: true, id: data.id }
  } catch (error) {
    console.error('createNotification error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

// ============================================
// CORE: Get User Notifications
// ============================================

export async function getUserNotifications(
  userId: string,
  options?: {
    unreadOnly?: boolean
    limit?: number
    category?: NotificationCategory
  }
) {
  const supabase = getSupabaseAdmin()

  try {
    let query = supabase
      .from('notifications')
      .select('*')
      .eq('recipient_id', userId)
      .order('created_at', { ascending: false })
      .limit(options?.limit || 50)

    if (options?.unreadOnly) {
      query = query.eq('is_read', false)
    }

    if (options?.category) {
      query = query.eq('category', options.category)
    }

    query = query.or('expires_at.is.null,expires_at.gte.now()')

    const { data, error } = await query

    if (error) throw error

    return { success: true, data: data || [] }
  } catch (error) {
    console.error('getUserNotifications error:', error)
    return { success: false, error: 'Failed to fetch notifications', data: [] }
  }
}

// ============================================
// CORE: Mark as Read
// ============================================

export async function markNotificationAsRead(
  notificationId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabaseAdmin()

  try {
    const { error } = await supabase
      .from('notifications')
      .update({
        is_read: true,
        read_at: new Date().toISOString(),
      })
      .eq('id', notificationId)
      .eq('recipient_id', userId)

    if (error) throw error

    return { success: true }
  } catch (error) {
    console.error('markNotificationAsRead error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to mark as read',
    }
  }
}

// ============================================
// CORE: Unread Count
// ============================================

export async function getUnreadNotificationCount(userId: string): Promise<number> {
  const supabase = getSupabaseAdmin()

  const { count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('recipient_id', userId)
    .eq('is_read', false)
    .or('expires_at.is.null,expires_at.gte.now()')

  if (error) {
    console.error('getUnreadNotificationCount error:', error)
    return 0
  }

  return count || 0
}

// ============================================
// PREFERENCES: Get
// ============================================

export async function getNotificationPreferences(
  userId: string,
  organisationId: string
): Promise<{ success: boolean; data?: NotificationPreferences; error?: string }> {
  const supabase = getSupabaseAdmin()

  try {
    let { data, error } = await supabase
      .from('notification_preferences')
      .select('*')
      .eq('profile_id', userId)
      .eq('organisation_id', organisationId)
      .maybeSingle()

    if (!data) {
      const { data: newData, error: insertError } = await supabase
        .from('notification_preferences')
        .insert({
          profile_id: userId,
          organisation_id: organisationId,
          hierarchy_changes: { in_app: true, email: true, push: true },
          shift_changes: { in_app: true, email: false, push: true },
          approvals: { in_app: true, email: true, push: false },
          system_alerts: { in_app: true, email: true, push: false },
        })
        .select()
        .single()

      if (insertError) throw insertError
      data = newData
    }

    if (error && error.code !== 'PGRST116') throw error

    return {
      success: true,
      data: {
        hierarchy_changes: data.hierarchy_changes,
        shift_changes: data.shift_changes,
        approvals: data.approvals,
        system_alerts: data.system_alerts,
        quiet_hours_start: data.quiet_hours_start,
        quiet_hours_end: data.quiet_hours_end,
        timezone: data.timezone,
      },
    }
  } catch (error) {
    console.error('getNotificationPreferences error:', error)
    return { success: false, error: 'Failed to fetch preferences' }
  }
}

// ============================================
// PREFERENCES: Update (FIX FOR "Failed to save")
// ============================================

export async function updateNotificationPreferences(
  userId: string,
  organisationId: string,
  preferences: NotificationPreferences
): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabaseAdmin()

  try {
    const { error } = await supabase
      .from('notification_preferences')
      .upsert(
        {
          profile_id: userId,
          organisation_id: organisationId,
          hierarchy_changes: preferences.hierarchy_changes,
          shift_changes: preferences.shift_changes,
          approvals: preferences.approvals,
          system_alerts: preferences.system_alerts,
          quiet_hours_start: preferences.quiet_hours_start || null,
          quiet_hours_end: preferences.quiet_hours_end || null,
          timezone: preferences.timezone || 'Europe/Budapest',
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'profile_id,organisation_id',
        }
      )

    if (error) {
      console.error('updateNotificationPreferences upsert error:', error)
      throw new Error(`Failed to save preferences: ${error.message}`)
    }

    revalidatePath('/dashboard/profile')
    revalidatePath('/dashboard/settings/notifications')
    revalidatePath('/worker/settings')

    return { success: true }
  } catch (error) {
    console.error('updateNotificationPreferences error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save notification preferences',
    }
  }
}

// ============================================
// HIERARCHY: Notify on hierarchy change
// ============================================

export async function notifyHierarchyChange(
  organisationId: string,
  actorId: string,
  targetUserId: string,
  changeType: 'promoted' | 'demoted' | 'activated' | 'deactivated' | 'joined',
  oldPosition: string,
  newPosition: string,
  targetName: string,
  actorName: string
): Promise<void> {
  const supabase = getSupabaseAdmin()

  const { data: org } = await supabase
    .from('organisations')
    .select('owner_id')
    .eq('id', organisationId)
    .single()

  const { data: targetMember } = await supabase
    .from('team_members')
    .select('id')
    .eq('user_id', targetUserId)
    .eq('organisation_id', organisationId)
    .single()

  const notifications: Promise<{ success: boolean }>[] = []

  if (targetUserId !== actorId) {
    notifications.push(
      createNotification({
        organisationId,
        actorId: null,
        recipientId: targetUserId,
        category: 'hierarchy',
        eventType: `you_were_${changeType}`,
        title: `You were ${changeType}`,
        body:
          changeType === 'joined'
            ? `Welcome! You have been added as ${newPosition}`
            : `Your position changed from ${oldPosition} to ${newPosition}`,
        priority: 'high',
        actionLink: '/dashboard/profile',
      })
    )
  }

  if (org?.owner_id && org.owner_id !== actorId) {
    notifications.push(
      createNotification({
        organisationId,
        actorId,
        recipientId: org.owner_id,
        category: 'hierarchy',
        eventType: `team_member_${changeType}`,
        title: `Team member ${changeType}`,
        body: `${actorName} ${changeType} ${targetName} to ${newPosition}`,
        priority: changeType === 'demoted' || changeType === 'deactivated' ? 'high' : 'normal',
        actionLink: `/dashboard/team`,
      })
    )
  }

  if (targetMember?.id) {
    const { data: managerChain } = await supabase
      .from('management_chain')
      .select('manager_id')
      .eq('subordinate_id', targetMember.id)
      .limit(1)
      .maybeSingle()

    if (managerChain?.manager_id) {
      const { data: managerTm } = await supabase
        .from('team_members')
        .select('user_id')
        .eq('id', managerChain.manager_id)
        .single()

      if (
        managerTm?.user_id &&
        managerTm.user_id !== actorId &&
        managerTm.user_id !== org?.owner_id
      ) {
        notifications.push(
          createNotification({
            organisationId,
            actorId,
            recipientId: managerTm.user_id,
            category: 'hierarchy',
            eventType: `subordinate_${changeType}`,
            title: `Your team member was ${changeType}`,
            body: `${targetName} (${newPosition}) was ${changeType} by ${actorName}`,
            priority: 'normal',
            actionLink: `/dashboard/team`,
          })
        )
      }
    }
  }

  await Promise.all(notifications)
}

// ============================================
// SHIFT: Notify on shift changes
// ============================================

export async function notifyShiftChange(
  organisationId: string,
  shiftId: string,
  changeType: 'created' | 'updated' | 'deleted' | 'assigned',
  actorId: string,
  shiftDetails: {
    venueName: string
    date: string
    time?: string
    workerName?: string
    workerId?: string
  }
): Promise<void> {
  const supabase = getSupabaseAdmin()
  const notifications: Promise<{ success: boolean }>[] = []

  if (shiftDetails.workerId && shiftDetails.workerId !== actorId) {
    notifications.push(
      createNotification({
        organisationId,
        actorId,
        recipientId: shiftDetails.workerId,
        category: 'shift',
        eventType: `shift_${changeType}`,
        title: `Shift ${changeType}`,
        body:
          changeType === 'assigned'
            ? `You were assigned to ${shiftDetails.venueName} on ${shiftDetails.date}`
            : `Your shift at ${shiftDetails.venueName} on ${shiftDetails.date} was ${changeType}`,
        priority: changeType === 'deleted' ? 'high' : 'normal',
        actionLink: '/dashboard/roster',
      })
    )
  }

  if (changeType === 'deleted' || (changeType === 'updated' && !shiftDetails.workerId)) {
    const { data: org } = await supabase
      .from('organisations')
      .select('owner_id')
      .eq('id', organisationId)
      .single()

    if (org?.owner_id && org.owner_id !== actorId) {
      notifications.push(
        createNotification({
          organisationId,
          actorId,
          recipientId: org.owner_id,
          category: 'shift',
          eventType: 'shift_coverage_alert',
          title: changeType === 'deleted' ? 'Shift cancelled' : 'Shift coverage needed',
          body: `${shiftDetails.venueName} on ${shiftDetails.date} needs staff`,
          priority: 'critical',
          actionLink: '/dashboard/roster',
        })
      )
    }
  }

  await Promise.all(notifications)
}
