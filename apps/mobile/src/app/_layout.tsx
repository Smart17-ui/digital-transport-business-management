import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import { Button } from '@/components/ui';
import { AuthProvider, useAuth } from '@/lib/auth';
import { colors, space, type } from '@/lib/theme';

export default function RootLayout() {
  const [loaded, error] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  // Should the fonts fail, the app still works with the phone's own.
  if (!loaded && !error) return null;

  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <Routes />
    </AuthProvider>
  );
}

function Routes() {
  const { status, account, refresh, signOut } = useAuth();

  if (status === 'loading') {
    return (
      <View style={styles.centre}>
        <ActivityIndicator size="large" color={colors.muted} />
      </View>
    );
  }
  if (status === 'unavailable') {
    return (
      <View style={styles.centre}>
        <Text style={styles.message}>Could not load your account. Check your signal and try again.</Text>
        <Button label="Try again" onPress={refresh} />
        <Button variant="secondary" label="Sign out" onPress={signOut} />
      </View>
    );
  }

  const signedIn = status === 'ready';
  const consented = signedIn && !!account?.consented;
  const setUp = consented && !!account?.displayName && !!account.business;
  // Named outright: without it the router falls back to the shortest route name, which is /verify.
  const start = !signedIn ? '/sign-in' : !consented ? '/consent' : !setUp ? '/setup' : '/';

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        headerTitleStyle: { fontFamily: 'Inter_600SemiBold', fontSize: 17 },
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Protected guard={!signedIn} redirectTo={start}>
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="verify" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !consented} redirectTo={start}>
        <Stack.Screen name="consent" />
      </Stack.Protected>
      <Stack.Protected guard={consented && !setUp} redirectTo={start}>
        <Stack.Screen name="setup" />
      </Stack.Protected>
      <Stack.Protected guard={setUp} redirectTo={start}>
        <Stack.Screen name="index" />
        <Stack.Screen name="bus" />
        <Stack.Screen name="add-bus" />
        <Stack.Screen name="invite" />
        <Stack.Screen name="assign" />
        <Stack.Screen name="offer" />
        <Stack.Screen name="start-day" />
        <Stack.Screen name="end-day" />
        <Stack.Screen name="record-cash" />
        <Stack.Screen name="add-cost" />
        <Stack.Screen name="check-cash" />
        <Stack.Screen name="day-settlement" />
        <Stack.Screen name="history" />
        <Stack.Screen name="pay" />
        <Stack.Screen name="correct-entry" />
      </Stack.Protected>
    </Stack>
  );
}

const styles = StyleSheet.create({
  centre: {
    flex: 1,
    alignItems: 'stretch',
    justifyContent: 'center',
    gap: space(3),
    padding: space(6),
    backgroundColor: colors.background,
  },
  message: { ...type.body, color: colors.text, textAlign: 'center' },
});
