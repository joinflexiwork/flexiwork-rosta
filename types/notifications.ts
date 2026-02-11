export type NotificationType =
  | 'manager_invite_received'
  | 'shift_invite_received'
  | 'shift_reminder'
  | 'rota_published'
  | 'timesheet_submitted'
  | 'hierarchy_changed'
  | 'shift_accepted'

export type NotificationPriority = 'low' | 'normal' | 'high'

export interface Notification {
  id: string
  user_id: string
  type: string
  title: string
  message: string
  metadata: Record<string, unknown>
  read_at?: string | null
  priority: NotificationPriority
  created_at: string
}

export interface NotificationPreferences {
  type: string
  channels: {
    email: boolean
    push: boolean
    in_app: boolean
  }
  quiet_hours_start: string
  quiet_hours_end: string
}

export interface PushSubscription {
  id: string
  user_id: string
  platform: 'web' | 'ios' | 'android'
  subscription: Record<string, unknown>
  device_info?: string | null
}
