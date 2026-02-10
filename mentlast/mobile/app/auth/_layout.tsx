import { Stack } from 'expo-router'

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: true, title: 'FlexiWork' }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
      <Stack.Screen name="accept-invite" options={{ title: 'Accept Invite' }} />
      <Stack.Screen name="enter-code" options={{ title: 'Invite Code' }} />
    </Stack>
  )
}
