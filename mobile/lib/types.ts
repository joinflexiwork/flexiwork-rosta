export interface ShiftInviteRow {
  id: string
  rota_shift_id: string
  team_member_id: string
  status: string
  invited_at: string
  shift?: {
    id: string
    shift_date: string
    start_time: string
    end_time: string
    venue?: { id: string; name: string; address?: string }
    role?: { id: string; name: string; colour?: string }
  }
}

export interface ShiftAllocationRow {
  id: string
  rota_shift_id: string
  team_member_id: string
  status: string
  shift?: {
    id: string
    shift_date: string
    start_time: string
    end_time: string
    venue?: { id: string; name: string; address?: string }
    role?: { id: string; name: string }
  }
}

export interface TimekeepingRecordRow {
  id: string
  rota_shift_id: string
  team_member_id: string
  venue_id: string
  clock_in?: string
  clock_out?: string
  clock_in_location?: string
  status: string
}
