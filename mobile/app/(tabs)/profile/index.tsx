import { useState, useEffect } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView } from 'react-native'
import { useRouter } from 'expo-router'
import { supabase } from '../../../lib/supabase'
import { signOut } from '../../../lib/services/auth'

export default function ProfileScreen() {
  const router = useRouter()
  const [profile, setProfile] = useState<{
    full_name: string | null
    email: string | null
  } | null>(null)
  const [teamMember, setTeamMember] = useState<{
    id: string
    primary_venue_id: string | null
    employment_type: string
  } | null>(null)
  const [primaryVenue, setPrimaryVenue] = useState<string | null>(null)
  const [roles, setRoles] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function run() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || cancelled) {
        setLoading(false)
        return
      }
      try {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('full_name, email')
          .eq('id', user.id)
          .single()
        if (!cancelled) setProfile(profileData ?? null)

        const { data: tm } = await supabase
          .from('team_members')
          .select('id, primary_venue_id, employment_type')
          .eq('user_id', user.id)
          .limit(1)
          .maybeSingle()
        if (!cancelled && tm) {
          setTeamMember(tm)
          if (tm.primary_venue_id) {
            const { data: venue } = await supabase
              .from('venues')
              .select('name')
              .eq('id', tm.primary_venue_id)
              .single()
            if (!cancelled) setPrimaryVenue(venue?.name ?? null)
          }
          const { data: roleRows } = await supabase
            .from('team_member_roles')
            .select('role:roles(name)')
            .eq('team_member_id', tm.id)
          const names = (roleRows ?? [])
            .map((r: { role?: { name?: string } }) => r.role?.name)
            .filter(Boolean) as string[]
          if (!cancelled) setRoles(names)
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [])

  async function handleLogout() {
    try {
      await signOut()
      router.replace('/auth/login')
    } catch {
      router.replace('/auth/login')
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    )
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.label}>Name</Text>
        <Text style={styles.value}>{profile?.full_name ?? '—'}</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.label}>Email</Text>
        <Text style={styles.value}>{profile?.email ?? '—'}</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.label}>Primary venue</Text>
        <Text style={styles.value}>{primaryVenue ?? '—'}</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.label}>Role(s)</Text>
        <Text style={styles.value}>{roles.length ? roles.join(', ') : '—'}</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.label}>Employment</Text>
        <Text style={styles.value}>{teamMember?.employment_type ?? '—'}</Text>
      </View>
      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <Text style={styles.logoutBtnText}>Log out</Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  content: { padding: 16, paddingBottom: 32 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  label: { fontSize: 12, color: '#6b7280', marginBottom: 4 },
  value: { fontSize: 16, fontWeight: '600', color: '#111' },
  logoutBtn: {
    marginTop: 24,
    backgroundColor: '#ef4444',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  logoutBtnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
})
