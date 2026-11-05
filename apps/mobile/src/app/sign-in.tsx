import { zambianMsisdn } from '@dt/domain';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PasswordField } from '@/components/form';
import { Logo, RoadBackdrop } from '@/components/logo';
import { Text, TextInput } from '@/components/text';
import { Button } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { signInErrorMessage } from '@/lib/auth-errors';
import { supabase } from '@/lib/supabase';
import { colors, radius, space, TAP_TARGET, themedStyles, type } from '@/lib/theme';

export default function SignIn() {
  const insets = useSafeAreaInsets();
  const { sessionEnded, cancelPasswordReset } = useAuth();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const signIn = async () => {
    const msisdn = zambianMsisdn(phone);
    if (!msisdn) {
      setError('Enter a Zambian mobile number, like 097 123 4567.');
      return;
    }
    if (password === '') {
      setError('Enter your password.');
      return;
    }
    setError(null);
    setSending(true);
    // A reset left unfinished earlier must not get in the way of a correct password.
    await cancelPasswordReset();
    const { error: failed } = await supabase.auth.signInWithPassword({ phone: msisdn, password });
    setSending(false);
    // On success the root layout moves on from this screen.
    if (failed) setError(signInErrorMessage(failed));
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" bounces={false}>
        <View style={[styles.panel, { paddingTop: insets.top + space(8) }]}>
          <RoadBackdrop />
          <Logo />
          <Text style={styles.headline} accessibilityRole="header">
            Every vehicle.{'\n'}Every kwacha.{'\n'}Every day.
          </Text>
          <Text style={styles.tagline}>Cashing, costs and daily records for owners and drivers.</Text>
        </View>
        <View style={styles.accent} />

        <View style={[styles.form, { paddingBottom: insets.bottom + space(6) }]}>
          <Text style={styles.title}>Sign in</Text>
          {sessionEnded ? (
            <Text style={styles.notice} accessibilityRole="alert">
              You were signed out. Sign in again. Anything saved on this phone is safe.
            </Text>
          ) : null}
          <Text style={styles.label}>Phone number</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
            autoComplete="tel"
            placeholder="097 123 4567"
            placeholderTextColor={colors.muted}
            accessibilityLabel="Phone number"
          />
          <PasswordField label="Password" value={password} onChange={setPassword} onSubmit={signIn} autoComplete="current-password" />
          {error ? (
            <Text style={styles.error} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
          <Button label={sending ? 'Signing in...' : 'Sign in'} disabled={sending} onPress={signIn} />
          <Pressable
            onPress={() => router.push({ pathname: '/phone-code', params: { mode: 'reset' } })}
            accessibilityRole="button"
            hitSlop={8}
            style={styles.forgot}
          >
            <Text style={styles.link}>Forgot password?</Text>
          </Pressable>
          <View style={styles.divider} />
          <Text style={styles.newHere}>New here, or have not set a password yet?</Text>
          <Button
            variant="secondary"
            label="Create an account"
            onPress={() => router.push({ pathname: '/phone-code', params: { mode: 'create' } })}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.dark },
  scroll: { flexGrow: 1 },
  panel: { flexGrow: 1, minHeight: 300, backgroundColor: colors.dark, paddingHorizontal: space(5), paddingBottom: space(7), overflow: 'hidden' },
  headline: { fontSize: 34, lineHeight: 41, fontWeight: '700', color: colors.onDark, marginTop: space(9) },
  tagline: { ...type.body, color: colors.onDarkMuted, marginTop: space(3), maxWidth: 300 },
  accent: { height: 4, backgroundColor: colors.primary },
  form: { backgroundColor: colors.surface, paddingHorizontal: space(5), paddingTop: space(6) },
  title: { ...type.title, color: colors.text, marginBottom: space(4) },
  notice: { ...type.small, color: colors.text, marginBottom: space(4) },
  forgot: { alignItems: 'center', marginTop: space(4) },
  link: { ...type.small, fontWeight: '600', color: colors.text, textDecorationLine: 'underline' },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: space(5) },
  newHere: { ...type.small, color: colors.muted, marginBottom: space(3), textAlign: 'center' },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: colors.text, marginBottom: space(1.5) },
  input: {
    minHeight: TAP_TARGET,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.control,
    paddingHorizontal: space(3.5),
    fontSize: 18,
    color: colors.text,
    marginBottom: space(3),
  },
  error: { ...type.small, color: colors.owes, marginBottom: space(3) },
}));
