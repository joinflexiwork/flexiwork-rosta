import { useState, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native'
import * as Location from 'expo-location'
import { getMyShifts, clockIn, clockOut, getActiveTimekeeping } from '../../../lib/services/shifts'
import { getUserId } from '../../../lib/services/auth'
import type { ShiftAllocationRow, TimekeepingRecordRow } from '../../../lib/types'

function formatDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

function isShiftNow(shiftDate: string, startTime: string, endTime: string): boolean {
  const now = new Date()
  const [sh, sm] = startTime.split(':').map(Number)
  const [eh, em] = endTime.split(':').map(Number)
  const start = new Date(shiftDate)
  start.setHours(sh, sm, 0, 0)
  const end = new Date(shiftDate)
  end.setHours(eh, em, 0, 0)
  const thirtyMins = 30 * 60 * 1000
  return now.getTime() >= start.getTime() - thirtyMins && now.getTime() <= end.getTime()
}

export default function ShiftsScreen() {
  const [shifts, setShifts] = useState<ShiftAllocationRow[]>([])
  const [activeRecord, setActiveRecord] = useState<TimekeepingRecordRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [clocking, setClocking] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const uid = await getUserId()
    setUserId(uid)
    if (!uid) {
      setLoading(false)
      return
    }
    try {
      const [list, active] = await Promise.all([getMyShifts(uid), getActiveTimekeeping(uid)])
      setShifts(list)
      setActiveRecord(active)
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to load shifts')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function handleClockIn(allocation: ShiftAllocationRow) {
    const shift = allocation.shift
    if (!shift?.id || !shift.venue?.id) {
      Alert.alert('Error', 'Missing shift or venue')
      return
    }
    setClocking(true)
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        Alert.alert('Location required', 'Allow location to clock in.')
        setClocking(false)
        return
      }
      const { coords } = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.BestForNavigation,
      })
      const location = coords.latitude + ',' + coords.longitude
      await clockIn({
        rota_shift_id: shift.id,
        team_member_id: allocation.team_member_id,
        venue_id: shift.venue.id,
        location,
      })
      await load()
    } catch (e) {
      Alert.alert('Clock-in failed', e instanceof Error ? e.message : 'Please try again')
    } finally {
      setClocking(false)
    }
  }

  async function handleClockOut() {
    if (!activeRecord || !userId) return
    setClocking(true)
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      let location: string | undefined
      if (status === 'granted') {
        const { coords } = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.BestForNavigation,
        })
        location = coords.latitude + ',' + coords.longitude
      }
      await clockOut({
        timekeeping_record_id: activeRecord.id,
        location,
      })
      await load()
    } catch (e) {
      Alert.alert('Clock-out failed', e instanceof Error ? e.message : 'Please try again')
    } finally {
      setClocking(false)
    }
  }

  const currentShiftForAllocation = userId
    ? shifts.find((a) => {
        const s = a.shift
        if (!s) return false
        return isShiftNow(s.shift_date, s.start_time, s.end_time) && a.team_member_id
      })
    : null

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6366f1" />
        <Text style={styles.loadingText}>Loading shifts...</Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      {activeRecord ? (
        <View style={styles.clockCard}>
          <Text style={styles.clockTitle}>Clocked in</Text>
          <TouchableOpacity
            style={[styles.clockOutBtn, clocking && styles.btnDisabled]}
            onPress={handleClockOut}
            disabled={clocking}
          >
            <Text style={styles.clockOutBtnText}>{clocking ? '...' : 'Clock out'}</Text>
          </TouchableOpacity>
        </View>
      ) : currentShiftForAllocation ? (
        <View style={styles.clockCard}>
          <Text style={styles.clockTitle}>Shift now</Text>
          <Text style={styles.clockSub}>
            {currentShiftForAllocation.shift?.venue?.name} - {currentShiftForAllocation.shift?.role?.name}
          </Text>
          <TouchableOpacity
            style={[styles.clockInBtn, clocking && styles.btnDisabled]}
            onPress={() => handleClockIn(currentShiftForAllocation)}
            disabled={clocking}
          >
            <Text style={styles.clockInBtnText}>{clocking ? '...' : 'Clock in'}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.clockCard}>
          <Text style={styles.clockSub}>No shift in the next 30 mins.</Text>
        </View>
      )}

      <Text style={styles.sectionTitle}>Upcoming shifts</Text>
      {shifts.length === 0 ? (
        <Text style={styles.empty}>No shifts allocated.</Text>
      ) : (
        <FlatList
          data={shifts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const s = item.shift
            if (!s) return null
            const canClock = isShiftNow(s.shift_date, s.start_time, s.end_time)
            const isActive = activeRecord?.rota_shift_id === s.id
            return (
              <View style={styles.card}>
                <Text style={styles.venue}>{s.venue?.name ?? '-'}</Text>
                <Text style={styles.role}>{s.role?.name ?? '-'}</Text>
                <Text style={styles.dateTime}>
                  {formatDate(s.shift_date)} - {s.start_time} to {s.end_time}
                </Text>
                {canClock && !activeRecord && (
                  <TouchableOpacity
                    style={[styles.smallClockBtn, clocking && styles.btnDisabled]}
                    onPress={() => handleClockIn(item)}
                    disabled={clocking}
                  >
                    <Text style={styles.smallClockBtnText}>Clock in</Text>
                  </TouchableOpacity>
                )}
                {isActive && (
                  <TouchableOpacity
                    style={[styles.smallClockOutBtn, clocking && styles.btnDisabled]}
                    onPress={handleClockOut}
                    disabled={clocking}
                  >
                    <Text style={styles.smallClockOutBtnText}>Clock out</Text>
                  </TouchableOpacity>
                )}
              </View>
            )
          }}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#f9fafb' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  loadingText: { marginTop: 12, fontSize: 16, color: '#6b7280' },
  clockCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  clockTitle: { fontSize: 18, fontWeight: '700', color: '#111' },
  clockSub: { fontSize: 14, color: '#6b7280', marginTop: 4 },
  clockInBtn: {
    marginTop: 12,
    backgroundColor: '#22c55e',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  clockInBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  clockOutBtn: {
    marginTop: 12,
    backgroundColor: '#ef4444',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  clockOutBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  btnDisabled: { opacity: 0.6 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#374151', marginBottom: 12 },
  empty: { fontSize: 14, color: '#6b7280' },
  list: { paddingBottom: 32 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  venue: { fontSize: 16, fontWeight: '700', color: '#111' },
  role: { fontSize: 14, color: '#6366f1', marginTop: 4 },
  dateTime: { fontSize: 14, color: '#6b7280', marginTop: 4 },
  smallClockBtn: {
    marginTop: 10,
    alignSelf: 'flex-start',
    backgroundColor: '#22c55e',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 6,
  },
  smallClockBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  smallClockOutBtn: {
    marginTop: 10,
    alignSelf: 'flex-start',
    backgroundColor: '#ef4444',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 6,
  },
  smallClockOutBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
})
