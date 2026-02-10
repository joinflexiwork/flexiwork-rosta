import { useState, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native'
import { useRouter, useFocusEffect } from 'expo-router'
import { supabase } from '../../../lib/supabase'
import { getPendingInvites, acceptShiftInvite, declineShiftInvite } from '../../../lib/services/invites'
import { getUserId } from '../../../lib/services/auth'
import type { ShiftInviteRow } from '../../../lib/types'

export default function InvitesScreen() {
  const router = useRouter()
  const [invites, setInvites] = useState<ShiftInviteRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [acceptingId, setAcceptingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const userId = await getUserId()
    if (!userId) {
      setInvites([])
      setLoading(false)
      return
    }
    try {
      const list = await getPendingInvites(userId)
      setInvites(list)
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to load invites')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const channel = supabase
      .channel('shift_invites')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shift_invites' },
        () => { load() }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [load])

  useFocusEffect(
    useCallback(() => {
      load()
    }, [load])
  )

  async function handleAccept(inv: ShiftInviteRow) {
    setAcceptingId(inv.id)
    try {
      await acceptShiftInvite(inv.id, inv.team_member_id)
      setInvites((prev) => prev.filter((i) => i.id !== inv.id))
      Alert.alert('Accepted', 'You are now on this shift.', [
        { text: 'OK', onPress: () => router.push('/shifts') },
      ])
    } catch (e) {
      const msg = e instanceof Error ? e.message : ''
      if (msg.includes('filled') || msg.includes('taken')) {
        Alert.alert('Too late', 'Sorry, this shift was just taken by another employee.')
      } else {
        Alert.alert('Error', msg || 'Failed to accept')
      }
      setInvites((prev) => prev.filter((i) => i.id !== inv.id))
    } finally {
      setAcceptingId(null)
    }
  }

  async function handleDecline(inv: ShiftInviteRow) {
    try {
      await declineShiftInvite(inv.id)
      setInvites((prev) => prev.filter((i) => i.id !== inv.id))
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to decline')
    }
  }

  function renderItem({ item }: { item: ShiftInviteRow }) {
    const shift = item.shift
    const venue = shift?.venue?.name ?? '-'
    const role = shift?.role?.name ?? '-'
    const date = shift?.shift_date ?? '-'
    const time = shift ? shift.start_time + ' - ' + shift.end_time : '-'
    const isAccepting = acceptingId === item.id

    return (
      <View style={styles.card}>
        <Text style={styles.venue}>{venue}</Text>
        <Text style={styles.role}>{role}</Text>
        <Text style={styles.dateTime}>{date} / {time}</Text>
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.acceptBtn, isAccepting && styles.btnDisabled]}
            onPress={() => handleAccept(item)}
            disabled={isAccepting}
          >
            <Text style={styles.acceptBtnText}>{isAccepting ? '...' : 'Accept'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.declineBtn}
            onPress={() => handleDecline(item)}
            disabled={isAccepting}
          >
            <Text style={styles.declineBtnText}>Decline</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6366f1" />
        <Text style={styles.loadingText}>Loading invites...</Text>
      </View>
    )
  }

  if (invites.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>No pending invites</Text>
        <Text style={styles.emptySub}>New shift invites will appear here.</Text>
      </View>
    )
  }

  return (
    <FlatList
      data={invites}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      contentContainerStyle={styles.list}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} />
      }
    />
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  loadingText: { marginTop: 12, fontSize: 16, color: '#6b7280' },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#374151' },
  emptySub: { marginTop: 8, fontSize: 14, color: '#6b7280' },
  list: { padding: 16, paddingBottom: 32 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  venue: { fontSize: 18, fontWeight: '700', color: '#111' },
  role: { fontSize: 14, color: '#6366f1', marginTop: 4 },
  dateTime: { fontSize: 14, color: '#6b7280', marginTop: 4 },
  actions: { flexDirection: 'row', marginTop: 12, gap: 12 },
  acceptBtn: {
    flex: 1,
    backgroundColor: '#6366f1',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  acceptBtnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  declineBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    justifyContent: 'center',
  },
  declineBtnText: { color: '#6b7280', fontWeight: '600' },
  btnDisabled: { opacity: 0.6 },
})
