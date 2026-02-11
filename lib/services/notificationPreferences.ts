import { supabase } from '@/lib/supabase'

export const NOTIFICATION_TYPES = [
  { id: 'shift_changes', label: 'Shift changes' },
  { id: 'new_applications', label: 'New applications' },
  { id: 'timesheet_approvals', label: 'Timesheet approvals' },
  { id: 'roster_published', label: 'Roster published' },
  { id: 'team_updates', label: 'Team updates' },
  { id: 'system_announcements', label: 'System announcements' },
  { id: 'weekly_summary', label: 'Weekly summary emails' },
] as const

export type NotificationTypeId = (typeof NOTIFICATION_TYPES)[number]['id']

export type NotificationPreferenceRow = {
  user_id: string
  type: string
  channels: { enabled?: boolean; email?: boolean; push?: boolean; in_app?: boolean }
}

/** Get all notification preferences for the current user. Returns map of type -> enabled. */
export async function getNotificationPreferences(
  userId: string
): Promise<Record<string, boolean>> {
  const { data, error } = await supabase
    .from('notification_preferences')
    .select('type, channels')
    .eq('user_id', userId)

  if (error) {
    console.error('getNotificationPreferences', error)
    return {}
  }

  const map: Record<string, boolean> = {}
  for (const row of data ?? []) {
    const r = row as { type: string; channels?: { enabled?: boolean } }
    map[r.type] = r.channels?.enabled !== false
  }
  return map
}

/** Set one notification type preference (enabled on/off). */
export async function setNotificationPreference(
  userId: string,
  type: string,
  enabled: boolean
): Promise<void> {
  const { error } = await supabase
    .from('notification_preferences')
    .upsert(
      {
        user_id: userId,
        type,
        channels: { enabled, in_app: enabled, email: enabled, push: enabled },
      },
      { onConflict: 'user_id,type' }
    )

  if (error) throw new Error(error.message)
}
