import 'react-native-url-polyfill/auto'
import { Stack } from 'expo-router'

export default function RootLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="auth/login" />
      <Stack.Screen name="auth/register" />
      <Stack.Screen name="auth/accept-invite" />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  )
}
