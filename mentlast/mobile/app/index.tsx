import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { getSession, getUserId } from '../lib/services/auth';
import { acceptTeamInvite } from '../lib/services/team';

export default function Index() {
  const router = useRouter();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const handleDeepLink = async () => {
      try {
        const url = await Linking.getInitialURL();
        const params = url ? Linking.parse(url).queryParams : undefined;
        const code = params?.code ?? '';
        const type = params?.type ?? 'team';

        if (code && (url?.includes('invite') || type)) {
          const session = await getSession();

          if (!session) {
            router.replace(`/auth/register?code=${code}&type=${type}`);
            return;
          }

          if (type === 'team') {
            const userId = await getUserId();
            if (userId) await acceptTeamInvite(code, userId);
          }

          router.replace('/invites');
          return;
        }

        const session = await getSession();
        if (session) {
          router.replace('/invites');
        } else {
          router.replace('/auth/login');
        }
      } catch (error) {
        console.error('Deep link error:', error);
        router.replace('/auth/login');
      } finally {
        setIsReady(true);
      }
    };

    handleDeepLink();
  }, []);

  if (!isReady) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return null;
}
