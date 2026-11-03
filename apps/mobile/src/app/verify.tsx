import { Redirect, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button } from '@/components/ui';
import { codeErrorMessage } from '@/lib/auth-errors';
import { supabase } from '@/lib/supabase';
import { colors, radius, space, TAP_TARGET } from '@/lib/theme';

const CODE_LENGTH = 6;
const RESEND_SECONDS = 60;

export default function Verify() {
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [wait, setWait] = useState(RESEND_SECONDS);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  // On success the auth state changes and the root layout moves on from this screen.
  const check = async (token: string) => {
    setError(null);
    setChecking(true);
    const { error: failed } = await supabase.auth.verifyOtp({ phone, token, type: 'sms' });
    setChecking(false);
    if (failed) {
      setCode('');
      setError(codeErrorMessage(failed));
    }
  };

  const change = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, CODE_LENGTH);
    setCode(digits);
    if (digits.length === CODE_LENGTH && !checking) void check(digits);
  };

  const resend = async () => {
    setError(null);
    setWait(RESEND_SECONDS);
    const { error: failed } = await supabase.auth.signInWithOtp({ phone });
    if (failed) setError(codeErrorMessage(failed));
  };

  if (!phone) return <Redirect href="/sign-in" />;

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'Enter your code' }} />
      <View style={styles.body}>
        <Text style={styles.intro}>We sent a {CODE_LENGTH}-digit code to +{phone}.</Text>
        <TextInput
          style={styles.input}
          value={code}
          onChangeText={change}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="sms-otp"
          maxLength={CODE_LENGTH}
          accessibilityLabel="Code"
          editable={!checking}
          autoFocus
        />
        {error ? (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
        <Button
          label={checking ? 'Checking...' : 'Continue'}
          disabled={checking || code.length < CODE_LENGTH}
          onPress={() => check(code)}
        />
        {wait > 0 ? (
          <Text style={styles.resendWait}>You can ask for a new code in {wait} seconds.</Text>
        ) : (
          <Pressable onPress={resend} accessibilityRole="button" hitSlop={12} style={styles.resend}>
            <Text style={styles.resendLink}>Send a new code</Text>
          </Pressable>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { flex: 1, padding: space(5) },
  intro: { fontSize: 16, lineHeight: 23, color: colors.muted, marginBottom: space(5) },
  input: {
    minHeight: TAP_TARGET + 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.muted,
    borderRadius: radius.control,
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: 8,
    textAlign: 'center',
    color: colors.text,
    marginBottom: space(3),
    fontVariant: ['tabular-nums'],
  },
  error: { fontSize: 14, lineHeight: 20, color: colors.owes, marginBottom: space(3) },
  resendWait: { fontSize: 14, color: colors.muted, textAlign: 'center', marginTop: space(4) },
  resend: { alignItems: 'center', marginTop: space(4) },
  resendLink: { fontSize: 15, fontWeight: '600', color: colors.text, textDecorationLine: 'underline' },
});
