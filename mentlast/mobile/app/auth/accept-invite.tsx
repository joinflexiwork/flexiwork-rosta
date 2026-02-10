import { useState, useEffect } from 'react'
import { View, Text, StyleSheet, Alert } from 'react-native'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { acceptTeamInvite } from '../../lib/services/team'
import { getUserId } from '../../lib/services/auth'

export default function AcceptInviteScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{ code?: string; type?: string }>()
  const code = (params?.code ?? '').trim()
  const type = (params?.type ?? 'team') as 'team' | 'shift'
  const [status, setStatus] = useState<'idle' | 'processing' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!code) {
      setStatus('error')
      setMessage('No invite code in link.')
      return
    }
    let cancelled = false
    async function run() {
      setStatus('processing')
      const userId = await getUserId()
      if (!userId) {
        if (!cancelled) {
          setStatus('error')
          setMessage('Not signed in. Please register or log in first.')
          router.replace({ pathname: '/auth/register', params: { code, type } })
        }
        return
      }
      try {
        if (type === 'shift') {
          setMessage('Shift invites are accepted from the Invites tab.')
          setStatus('done')
          if (!cancelled) setTimeout(() => router.replace('/invites'), 2000)
          return
        }
        await acceptTeamInvite(code, userId)
        if (!cancelled) {
          setStatus('done')
          setMessage('You have joined the team.')
          setTimeout(() => router.replace('/invites'), 1500)
        }
      } catch (e) {
        if (!cancelled) {
          setStatus('error')
          setMessage(e instanceof Error ? e.message : 'Failed to accept invite')
        }
      }
    }
    run()
    return () => { cancelled = true }
  }, [code, type, router])

  if (status === 'processing') {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Accepting invite…</Text>
      </View>
    )
  }

  if (status === 'done') {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Success</Text>
        <Text style={styles.message}>{message}</Text>
      </View>
    )
  }

  if (status === 'error') {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Invite problem</Text>
        <Text style={styles.message}>{message}</Text>
        <Text style={styles.hint} onPress={() => router.replace('/invites')}>
          Go to app
        </Text>
      </View>
    )
  }

  return (
    <View style={styles.center}>
      <Text style={styles.title}>Loading…</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 20, fontWeight: '700', color: '#111', marginBottom: 8 },
  message: { fontSize: 16, color: '#374151', textAlign: 'center' },
  hint: { marginTop: 16, fontSize: 14, color: '#6366f1' },
})
