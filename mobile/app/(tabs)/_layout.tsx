import { Tabs } from 'expo-router'
import { Text } from 'react-native'

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#6366f1',
        tabBarInactiveTintColor: '#6b7280',
        headerStyle: { backgroundColor: '#fff' },
        headerTitleStyle: { fontWeight: '700', fontSize: 18 },
      }}
    >
      <Tabs.Screen name="invites" options={{ title: 'Invites', tabBarLabel: 'Invites' }} />
      <Tabs.Screen name="shifts" options={{ title: 'My Shifts', tabBarLabel: 'Shifts' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarLabel: 'Profile' }} />
    </Tabs>
  )
}
