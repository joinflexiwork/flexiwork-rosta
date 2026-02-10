import { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, KeyboardAvoidingView, Platform } from 'react-native'
import { useRouter } from 'expo-router'
import { getUserId } from '../../lib/services/auth'
import { acceptTeamInvite } from '../../lib/services/team'

export default function EnterCodeScreen() {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleJoinTeam() {
    const trimmed = code.trim()
    if (!trimmed) {
      Alert.alert('Error', 'Please enter your invite code')
      return
    }
    setLoading(true)
    try {
      const userId = await getUserId()
      if (!userId) {
        router.replace({ pathname: '/auth/register', params: { code: trimmed, type: 'team' } })
        return
      }
      await acceptTeamInvite(trimmed, userId)
      Alert.alert('Success', 'You have joined the team.', [
        { text: 'OK', onPress: () => router.replace('/invites') },
      ])
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Invalid or expired invite code')
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <View style={styles.form}>
        <Text style={styles.title}>Enter Invite Code</Text>
        <Text style={styles.hint}>Enter the code from your manager or invite email.</Text>
        <TextInput
          style={styles.input}
          value={code}
          onChangeText={setCode}
          placeholder="e.g. ABC123XYZ"
          autoCapitalize="characters"
          autoCorrect={false}
          editable={!loading}
        />
        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleJoinTeam}
          disabled={loading}
        >
          <Text style={styles.buttonText}>{loading ? 'Joining…' : 'Join Team'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.link}
          onPress={() => router.back()}
          disabled={loading}
        >
          <Text style={styles.linkText}>Back to sign in</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#fff' },
  form: { maxWidth: 400, width: '100%', alignSelf: 'center' },
  title: { fontSize: 22, fontWeight: '700', color: '#111', marginBottom: 8 },
  hint: { fontSize: 14, color: '#6b7280', marginBottom: 20 },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 14,
    fontSize: 18,
    marginBottom: 20,
    letterSpacing: 1,
  },
  button: {
    backgroundColor: '#6366f1',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  link: { marginTop: 16, alignItems: 'center' },
  linkText: { color: '#6366f1', fontSize: 14 },
})
