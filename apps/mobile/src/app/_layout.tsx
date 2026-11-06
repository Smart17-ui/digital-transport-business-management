import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LogoMark } from '@/components/logo';
import { Text } from '@/components/text';
import { Button } from '@/components/ui';
import { AuthProvider, useAuth } from '@/lib/auth';
import { useCategoryChosen } from '@/lib/category';
import { colors, space, themedStyles, type, useThemeMode } from '@/lib/theme';

// Held until the fonts are in, so no blank screen shows between the splash and the app.
void SplashScreen.preventAutoHideAsync();

/** Looks the same as the splash screen, so a slow account read carries on from it without a jump. */
function LoadingScreen() {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.splash} accessibilityLabel="Digital Transport is loading">
      <StatusBar style="light" />
      <LogoMark size={200} />
      <ActivityIndicator style={[styles.spinner, { bottom: insets.bottom + space(12) }]} size="small" color={colors.primary} />
    </View>
  );
}

export default function RootLayout() {
  const [loaded, error] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  // Should the fonts fail, the app still works with the phone's own.
  const ready = loaded || !!error;
  const { version, dark } = useThemeMode();

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(colors.background);
  }, [version]);

  if (!ready) return null;

  return (
    <AuthProvider>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Routes key={version} />
    </AuthProvider>
  );
}

function Routes() {
  const { status, account, needsPassword, refresh, signOut } = useAuth();
  const categoryChosen = useCategoryChosen();

  if (status === 'loading') return <LoadingScreen />;
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
  const hasPassword = signedIn && !needsPassword;
  const consented = hasPassword && !!account?.consented;
  const setUp = consented && !!account?.displayName && !!account.business;
  // Named outright: without it the router falls back to the shortest route name, which is /verify.
  const start = !signedIn ? (categoryChosen ? '/sign-in' : '/category') : !hasPassword ? '/set-password' : !consented ? '/consent' : !setUp ? '/setup' : '/';

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
      <Stack.Protected guard={!signedIn && !categoryChosen} redirectTo={start}>
        <Stack.Screen name="category" />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn && categoryChosen} redirectTo={start}>
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="phone-code" />
        <Stack.Screen name="verify" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !hasPassword} redirectTo={start}>
        <Stack.Screen name="set-password" />
      </Stack.Protected>
      <Stack.Protected guard={hasPassword && !consented} redirectTo={start}>
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
        <Stack.Screen name="check-cost" />
        <Stack.Screen name="report-day" />
        <Stack.Screen name="check-report" />
        <Stack.Screen name="calendar" />
        <Stack.Screen name="day-settlement" />
        <Stack.Screen name="history" />
        <Stack.Screen name="driver" />
        <Stack.Screen name="map" />
        <Stack.Screen name="trip" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="change-password" />
        <Stack.Screen name="reopen-day" />
        <Stack.Screen name="pay" />
        <Stack.Screen name="correct-entry" />
      </Stack.Protected>
    </Stack>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  splash: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.dark },
  spinner: { position: 'absolute' },
  centre: {
    flex: 1,
    alignItems: 'stretch',
    justifyContent: 'center',
    gap: space(3),
    padding: space(6),
    backgroundColor: colors.background,
  },
  message: { ...type.body, color: colors.text, textAlign: 'center' },
}));
