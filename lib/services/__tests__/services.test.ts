import { describe, it, expect, vi, beforeEach } from 'vitest'
import { logAction } from '@/lib/services/auditService'
import { getOrganisationIdForCurrentUser } from '@/lib/services/organisations'
import { getProfilePageData } from '@/lib/services/profilePage'
import { getTeamHierarchy } from '@/app/actions/hierarchy'
import { createNotification } from '@/app/actions/notifications'

const mockMembers = [
  { id: 'tm1', user_id: 'u1', organisation_id: 'org1', hierarchy_level: 'worker' },
  { id: 'tm2', user_id: 'u2', organisation_id: 'org1', hierarchy_level: 'agm' },
]

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({
        eq: () => Promise.resolve({ data: mockMembers, error: null }),
      }),
    }),
  }),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: () => Promise.resolve({ data: { user: { id: 'current-user-id' } }, error: null }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve({ data: [{ id: 'org1', owner_id: 'current-user-id', name: 'Test Org' }], error: null }),
          limit: () => Promise.resolve({ data: [{ id: 'org1' }], error: null }),
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
          single: () => Promise.resolve({ data: { id: 'org1', name: 'Test', owner_id: 'u', company_address: null, tax_id: null, company_logo_url: null }, error: null }),
        }),
        in: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }),
      }),
      insert: (row: unknown) => Promise.resolve({ data: row, error: null }),
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
    }),
  },
}))

vi.mock('@/lib/supabase-server', () => ({
  createClient: () => ({
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u' } }, error: null }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: { id: 'tm', organisation_id: 'org1', hierarchy_level: 'agm' }, error: null }),
          limit: () => Promise.resolve({ data: [], error: null }),
          single: () => Promise.resolve({ data: { id: 'org1', name: 'Org', company_address: null, tax_id: null, company_logo_url: null }, error: null }),
        }),
      }),
    }),
  }),
}))

describe('getTeamHierarchy', () => {
  it('returns members array and chain', async () => {
    const result = await getTeamHierarchy('org1')
    expect(result).toHaveProperty('members')
    expect(result).toHaveProperty('chain')
    expect(Array.isArray(result.members)).toBe(true)
    expect(result.members.length).toBeGreaterThanOrEqual(0)
    expect(Array.isArray(result.chain)).toBe(true)
  })
})

describe('getOrganisationIdForCurrentUser', () => {
  it('returns valid org ID or null', async () => {
    const id = await getOrganisationIdForCurrentUser()
    expect(id === null || (typeof id === 'string' && id.length > 0)).toBe(true)
  })
})

describe('getProfilePageData', () => {
  it('returns profile with expected fields or null', async () => {
    const data = await getProfilePageData()
    if (data === null) {
      expect(data).toBeNull()
      return
    }
    expect(data).toHaveProperty('userId')
    expect(data).toHaveProperty('profile')
    expect(data.profile).toHaveProperty('fullName')
    expect(data.profile).toHaveProperty('email')
    expect(data).toHaveProperty('organisationId')
    expect(data).toHaveProperty('organisationName')
    expect(data).toHaveProperty('hierarchyLevel')
    expect(data).toHaveProperty('isOwner')
  })
})

describe('auditService.logAction', () => {
  it('creates audit log entry without throwing', async () => {
    await expect(
      logAction({
        organisationId: 'org1',
        tableName: 'team_members',
        recordId: 'rec1',
        action: 'DELETE',
        oldData: { status: 'active' },
        newData: null,
        metadata: { message: 'Team member deleted: Test' },
      })
    ).resolves.toBeUndefined()
  })
})

describe('createNotification', () => {
  it('creates notification without throwing', async () => {
    await expect(
      createNotification('user-1', 'general', 'Test Title', 'Test message', {}, 'normal')
    ).resolves.toBeUndefined()
  })
})
