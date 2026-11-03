import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui';
import { AuthProvider, useAuth } from '@/lib/auth';
import { SampleProvider } from '@/lib/sample';
import { colors, space } from '@/lib/theme';

export default function RootLayout() {
  return (
    <AuthProvider>
      <SampleProvider>
        <StatusBar style="dark" />
        <Routes />
      </SampleProvider>
    </AuthProvider>
  );
}

function Routes() {
  const { status, account, refresh, signOut } = useAuth();

  if (status === 'loading') {
    return (
      <View style={styles.centre}>
        <ActivityIndicator size="large" color={colors.primary} />
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
  const setUp = signedIn && !!account?.displayName && !!account.business;
  // Named outright: without it the router falls back to the shortest route name, which is /verify.
  const start = !signedIn ? '/sign-in' : !setUp ? '/setup' : '/';

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Protected guard={!signedIn} redirectTo={start}>
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="verify" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !setUp} redirectTo={start}>
        <Stack.Screen name="setup" />
      </Stack.Protected>
      <Stack.Protected guard={setUp} redirectTo={start}>
        <Stack.Screen name="index" />
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
        <Stack.Screen name="demo" />
        <Stack.Screen name="owner" />
        <Stack.Screen name="driver" />
        <Stack.Screen name="confirm" />
        <Stack.Screen name="settlement" />
        <Stack.Screen name="handover" />
        <Stack.Screen name="calculator" />
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
  message: { fontSize: 16, lineHeight: 23, color: colors.text, textAlign: 'center' },
});
