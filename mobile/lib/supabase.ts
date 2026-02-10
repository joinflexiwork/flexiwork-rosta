import { AppState, Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim()
const supabaseAnonKey = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').trim()

const hasValidUrl = supabaseUrl.startsWith('https://') && supabaseUrl.length > 20
const hasValidKey = supabaseAnonKey.length > 50

if (!hasValidUrl || !hasValidKey) {
  const msg =
    'Supabase env missing or invalid. In mobile/.env set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY, then restart Expo (npx expo start --clear).'
  if (__DEV__) {
    console.error('[Supabase]', msg)
  }
  throw new Error(msg)
}

const secureStorage = {
  getItem: async (key: string) => {
    try {
      return await SecureStore.getItemAsync(key)
    } catch {
      return null
    }
  },
  setItem: async (key: string, value: string) => {
    try {
      await SecureStore.setItemAsync(key, value)
    } catch {
      // SecureStore has size limits; ignore
    }
  },
  removeItem: async (key: string) => {
    try {
      await SecureStore.deleteItemAsync(key)
    } catch {
      // ignore
    }
  },
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: Platform.OS !== 'web' ? secureStorage : undefined,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})

if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh()
    } else {
      supabase.auth.stopAutoRefresh()
    }
  })
}
