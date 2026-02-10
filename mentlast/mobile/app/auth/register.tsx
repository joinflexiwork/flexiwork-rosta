import { useState, useEffect } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, KeyboardAvoidingView, Platform } from 'react-native'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { signUp } from '../../lib/services/auth'
import { acceptTeamInvite } from '../../lib/services/team'

export default function RegisterScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{ code?: string; type?: string }>()
  const codeFromParams = (params?.code ?? '').trim()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [inviteCodeInput, setInviteCodeInput] = useState(codeFromParams)
  const [loading, setLoading] = useState(false)

  const inviteCode = (inviteCodeInput || codeFromParams).trim()

  async function handleRegister() {
    if (!email.trim() || !password) {
      Alert.alert('Error', 'Please enter email and password')
      return
    }
    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters')
      return
    }
    setLoading(true)
    try {
      await signUp(email.trim(), password, fullName.trim() || undefined)
      if (inviteCode) {
        const { supabase } = await import('../../lib/supabase')
        const { data: { user } } = await supabase.auth.getUser()
        if (user) await acceptTeamInvite(inviteCode, user.id)
      }
      router.replace('/invites')
    } catch (e) {
      Alert.alert('Registration failed', e instanceof Error ? e.message : 'Something went wrong')
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
        <Text style={styles.label}>Full name</Text>
        <TextInput
          style={styles.input}
          value={fullName}
          onChangeText={setFullName}
          placeholder="John Doe"
          editable={!loading}
        />
        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          autoCapitalize="none"
          keyboardType="email-address"
          editable={!loading}
        />
        <Text style={styles.label}>Password (min 6)</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          placeholder="••••••••"
          secureTextEntry
          editable={!loading}
        />
        <Text style={styles.label}>Invite code (optional)</Text>
        <TextInput
          style={styles.input}
          value={inviteCodeInput}
          onChangeText={setInviteCodeInput}
          placeholder="e.g. K7X2M9"
          autoCapitalize="characters"
          autoCorrect={false}
          editable={!loading}
        />
        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleRegister}
          disabled={loading}
        >
          <Text style={styles.buttonText}>{loading ? 'Creating account…' : 'Create account'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.link}
          onPress={() => router.push('/auth/login')}
          disabled={loading}
        >
          <Text style={styles.linkText}>Already have an account? Sign in</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.link}
          onPress={() => router.push('/auth/enter-code')}
          disabled={loading}
        >
          <Text style={styles.linkText}>Have an invite code?</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#fff' },
  form: { maxWidth: 400, width: '100%', alignSelf: 'center' },
  label: { fontSize: 16, fontWeight: '600', color: '#374151', marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
    marginBottom: 16,
  },
  button: {
    backgroundColor: '#6366f1',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  link: { marginTop: 16, alignItems: 'center' },
  linkText: { color: '#6366f1', fontSize: 14 },
})
