// ============================================================
// DATABASE TYPES
// ============================================================

export interface Organisation {
  id: string
  owner_id: string
  name: string
  business_reg_number?: string
  industry?: string
  billing_email?: string
  tax_id?: string
  company_address?: string
  company_logo_url?: string
  created_at: string
  updated_at: string
}

export interface Venue {
  id: string
  organisation_id: string
  name: string
  address?: string
  timezone: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Role {
  id: string
  organisation_id: string
  name: string
  colour: string
  description?: string
  is_active: boolean
  created_at: string
}

export type MemberType = 'employee' | 'manager'

export interface TeamMember {
  id: string
  organisation_id: string
  user_id: string | null
  member_type: MemberType
  employment_type: 'full_time' | 'part_time'
  status: 'pending' | 'active' | 'inactive'
  primary_venue_id?: string
  invite_code?: string
  invited_at: string
  joined_at?: string
  created_at: string
}

export interface TeamMemberRole {
  id: string
  team_member_id: string
  role_id: string
  is_primary: boolean
  created_at: string
}

export interface TeamMemberVenue {
  id: string
  team_member_id: string
  venue_id: string
  is_primary: boolean
  created_at: string
}

export interface RotaShift {
  id: string
  venue_id: string
  role_id: string
  shift_date: string
  start_time: string
  end_time: string
  headcount_needed: number
  status: 'draft' | 'published' | 'in_progress' | 'completed' | 'cancelled'
  notes?: string
  created_by?: string
  published_at?: string
  created_at: string
  updated_at: string
}

export interface ShiftAllocation {
  id: string
  rota_shift_id: string
  team_member_id: string
  allocation_type: 'direct' | 'accepted'
  status: 'allocated' | 'confirmed' | 'in_progress' | 'completed' | 'no_show' | 'cancelled'
  allocated_by?: string
  allocated_at: string
}

export interface ShiftInvite {
  id: string
  rota_shift_id: string
  team_member_id: string
  status: 'pending' | 'accepted' | 'declined' | 'expired' | 'cancelled'
  invited_by?: string
  invited_at: string
  responded_at?: string
  expires_at?: string
  invite_code?: string
}

export interface TimekeepingRecord {
  id: string
  rota_shift_id: string
  team_member_id: string
  venue_id: string
  clock_in?: string
  clock_out?: string
  clock_in_location?: string
  clock_out_location?: string
  break_minutes: number
  total_hours?: number
  regular_hours?: number
  overtime_hours?: number
  status: 'pending' | 'approved' | 'disputed' | 'rejected'
  approved_by?: string
  approved_at?: string
  notes?: string
  created_at: string
}

// ============================================================
// EXTENDED TYPES (with relations)
// ============================================================

export interface TeamMemberWithDetails extends TeamMember {
  profile?: {
    full_name: string
    email: string
    avatar_url?: string
    worker_status?: string
  }
  roles?: { role: Role }[]
  primary_venue?: Venue
}

export interface RotaShiftWithDetails extends RotaShift {
  venue?: Venue
  role?: Role
  allocations?: ShiftAllocationWithMember[]
  invites?: ShiftInviteWithMember[]
  headcount_filled: number
}

export interface ShiftAllocationWithMember extends ShiftAllocation {
  team_member?: TeamMemberWithDetails
}

export interface ShiftInviteWithMember extends ShiftInvite {
  team_member?: TeamMemberWithDetails
}

export interface TimekeepingWithDetails extends TimekeepingRecord {
  team_member?: TeamMemberWithDetails
  shift?: RotaShiftWithDetails
  venue?: Venue
}
