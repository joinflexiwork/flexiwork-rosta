export type HierarchyLevel = 'employer' | 'gm' | 'agm' | 'shift_leader' | 'worker'

export interface Permissions {
  can_edit_rota: boolean
  can_invite_managers: boolean
  can_invite_workers: boolean
  can_approve_timesheets: boolean
  can_view_cross_branch_analytics: boolean
  can_manage_venue_settings: boolean
}

export interface TeamMemberWithHierarchy {
  id: string
  user_id: string | null
  organisation_id: string
  hierarchy_level: HierarchyLevel
  invited_by?: string | null
  venue_scope?: string[] | null
  permissions?: Permissions | null
  created_at: string
  profile?: {
    email: string
    full_name: string
    avatar_url?: string
  }
}

export interface ManagementChain {
  id: string
  manager_id: string
  subordinate_id: string
  venue_id?: string | null
  created_by: string | null
  created_at: string
  manager?: TeamMemberWithHierarchy
  subordinate?: TeamMemberWithHierarchy
}

export const HIERARCHY_RULES: Record<
  HierarchyLevel,
  { canInvite: HierarchyLevel[]; canEditRota: 'all' | 'scoped' | 'none'; canManageVenue: 'all' | 'scoped' | 'none' }
> = {
  employer: { canInvite: ['gm', 'agm', 'shift_leader', 'worker'], canEditRota: 'all', canManageVenue: 'all' },
  gm: { canInvite: ['agm', 'shift_leader'], canEditRota: 'all', canManageVenue: 'scoped' },
  agm: { canInvite: ['shift_leader', 'worker'], canEditRota: 'scoped', canManageVenue: 'scoped' },
  shift_leader: { canInvite: ['worker'], canEditRota: 'none', canManageVenue: 'none' },
  worker: { canInvite: [], canEditRota: 'none', canManageVenue: 'none' },
}
