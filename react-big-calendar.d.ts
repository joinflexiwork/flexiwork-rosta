declare module 'react-big-calendar' {
  import type { ComponentType } from 'react'
  export const Calendar: ComponentType<Record<string, unknown>>
  export function dateFnsLocalizer(config: unknown): unknown
}
