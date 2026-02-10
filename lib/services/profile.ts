import { supabase } from '@/lib/supabase'

/** Update profile full_name (e.g. by employer for a team member). Requires RLS allowing org owners to update. */
export async function updateProfileFullName(profileId: string, fullName: string): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ full_name: fullName.trim() || null })
    .eq('id', profileId)
  if (error) throw new Error(error.message)
}

export type WorkerProfileData = {
  teamMemberId: string
  userId: string | null
  fullName: string
  email: string
  phone: string | null
  avatarUrl: string | null
  primaryVenue: { id: string; name: string; address?: string } | null
  joinedDate: string | null
  createdAt: string
  employeeId: string
  roles: { id: string; name: string; colour?: string }[]
  certifications: string[]
  organisationId: string
}

/** Fetch full worker profile for current user's team member record (for profile page). */
export async function getWorkerProfile(teamMemberId: string): Promise<WorkerProfileData | null> {
  const { data: member, error: memberErr } = await supabase
    .from('team_members')
    .select(`
      id,
      user_id,
      organisation_id,
      created_at,
      joined_at,
      primary_venue_id,
      rating,
      certifications,
      profile:profiles(full_name, email, avatar_url, phone),
      primary_venue:venues(id, name, address),
      roles:team_member_roles(
        role:roles(id, name, colour)
      )
    `)
    .eq('id', teamMemberId)
    .single()

  if (memberErr || !member) return null

  const profile = member.profile as { full_name?: string; email?: string; avatar_url?: string; phone?: string } | null
  const primaryVenue = member.primary_venue as { id: string; name: string; address?: string } | null
  const rolesData = (member.roles ?? []) as Array<{ role: { id: string; name: string; colour?: string } | null }>
  const certs = member.certifications as string[] | null
  const certList = Array.isArray(certs) ? certs : []

  return {
    teamMemberId: member.id,
    userId: member.user_id ?? null,
    fullName: profile?.full_name ?? '',
    email: profile?.email ?? '',
    phone: profile?.phone ?? null,
    avatarUrl: profile?.avatar_url ?? null,
    primaryVenue,
    joinedDate: member.joined_at ?? null,
    createdAt: member.created_at,
    employeeId: String(member.id).slice(0, 8).toUpperCase(),
    roles: rolesData.map((r) => r.role).filter(Boolean) as { id: string; name: string; colour?: string }[],
    certifications: certList,
    organisationId: member.organisation_id,
  }
}

export type WorkerStats = {
  attendanceRatePercent: number
  averageRating: number | null
  averageResponseTimeMinutes: number | null
  hoursWorked: number
}

/** Calculate worker stats: attendance %, rating, avg response time, hours worked. */
export async function getWorkerStats(
  teamMemberId: string,
  options?: { last30DaysOnly?: boolean }
): Promise<WorkerStats> {
  const last30 = options?.last30DaysOnly ?? true
  const startDate = last30
    ? new Date()
        .setDate(new Date().getDate() - 30)
        .valueOf()
    : 0
  const startISO = last30 ? new Date(startDate).toISOString().split('T')[0] + 'T00:00:00Z' : null

  const [allocationsRes, timekeepingRes, invitesRes, hoursRes] = await Promise.all([
    supabase
      .from('shift_allocations')
      .select('id, allocated_at')
      .eq('team_member_id', teamMemberId)
      .in('status', ['allocated', 'confirmed', 'in_progress', 'completed', 'no_show']),
    supabase
      .from('timekeeping_records')
      .select('id, clock_in, status')
      .eq('team_member_id', teamMemberId)
      .eq('status', 'approved'),
    supabase
      .from('shift_invites')
      .select('invited_at, responded_at, status')
      .eq('team_member_id', teamMemberId)
      .in('status', ['accepted', 'declined']),
    supabase
      .from('timekeeping_records')
      .select('total_hours')
      .eq('team_member_id', teamMemberId)
      .eq('status', 'approved'),
  ])

  let allocations = (allocationsRes.data ?? []) as { id: string; allocated_at: string }[]
  let timekeeping = (timekeepingRes.data ?? []) as { id: string; clock_in?: string }[]
  const invites = (invitesRes.data ?? []) as { invited_at: string; responded_at?: string }[]
  const hoursRows = (hoursRes.data ?? []) as { total_hours?: number }[]

  if (startISO) {
    allocations = allocations.filter((a) => a.allocated_at >= startISO)
    timekeeping = timekeeping.filter((t) => (t.clock_in ?? '') >= startISO)
  }

  const totalShifts = allocations.length
  const attendedCount = timekeeping.length
  const attendanceRatePercent = totalShifts > 0 ? Math.round((attendedCount / totalShifts) * 100) : 0

  let averageResponseTimeMinutes: number | null = null
  const withResponse = invites.filter((i) => i.responded_at)
  if (withResponse.length > 0) {
    const totalMs = withResponse.reduce((sum, i) => {
      const invited = new Date(i.invited_at).getTime()
      const responded = new Date(i.responded_at!).getTime()
      return sum + (responded - invited)
    }, 0)
    averageResponseTimeMinutes = Math.round(totalMs / withResponse.length / (60 * 1000))
  }

  const hoursWorked = hoursRows.reduce((sum, r) => sum + (Number(r.total_hours) || 0), 0)

  const { data: ratingRow } = await supabase
    .from('team_members')
    .select('rating')
    .eq('id', teamMemberId)
    .single()
  const averageRating =
    ratingRow && typeof (ratingRow as { rating?: number }).rating === 'number'
      ? (ratingRow as { rating: number }).rating
      : null

  return {
    attendanceRatePercent,
    averageRating,
    averageResponseTimeMinutes,
    hoursWorked,
  }
}

const AVATAR_BUCKET = 'avatars'
const MAX_AVATAR_SIZE = 2 * 1024 * 1024
const ALLOWED_TYPES = ['image/jpeg', 'image/png']

/** Upload avatar and update profiles.avatar_url. Returns new public URL or throws. */
export async function updateProfilePicture(userId: string, file: File): Promise<string> {
  if (file.size > MAX_AVATAR_SIZE) throw new Error('File must be 2MB or smaller')
  if (!ALLOWED_TYPES.includes(file.type)) throw new Error('Only JPEG and PNG are allowed')

  const ext = file.type === 'image/png' ? 'png' : 'jpg'
  const path = `profiles/${userId}.${ext}`

  const { error: uploadError } = await supabase.storage.from(AVATAR_BUCKET).upload(path, file, {
    upsert: true,
    contentType: file.type,
  })
  if (uploadError) throw new Error(uploadError.message)

  const { data: urlData } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path)
  const publicUrl = urlData?.publicUrl ?? ''

  const { error: updateError } = await supabase
    .from('profiles')
    .update({ avatar_url: publicUrl })
    .eq('id', userId)
  if (updateError) throw new Error(updateError.message)

  return publicUrl
}
