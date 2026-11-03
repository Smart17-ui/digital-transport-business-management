import { zambianMsisdn } from '@dt/domain';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button } from '@/components/ui';
import { codeErrorMessage } from '@/lib/auth-errors';
import { supabase } from '@/lib/supabase';
import { colors, radius, space, TAP_TARGET } from '@/lib/theme';

export default function SignIn() {
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const send = async () => {
    const msisdn = zambianMsisdn(phone);
    if (!msisdn) {
      setError('Enter a Zambian mobile number, like 097 123 4567.');
      return;
    }
    setError(null);
    setSending(true);
    const { error: failed } = await supabase.auth.signInWithOtp({ phone: msisdn });
    setSending(false);
    if (failed) {
      setError(codeErrorMessage(failed));
      return;
    }
    router.push({ pathname: '/verify', params: { phone: msisdn } });
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.body}>
        <Text style={styles.title} accessibilityRole="header">
          Sign in
        </Text>
        <Text style={styles.intro}>Enter your phone number. We will text you a code, so there is no password to remember.</Text>
        <Text style={styles.label}>Phone number</Text>
        <TextInput
          style={styles.input}
          value={phone}
          onChangeText={setPhone}
          onSubmitEditing={send}
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          autoComplete="tel"
          placeholder="097 123 4567"
          placeholderTextColor={colors.muted}
          accessibilityLabel="Phone number"
          autoFocus
        />
        {error ? (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
        <Button label={sending ? 'Sending...' : 'Send me a code'} disabled={sending} onPress={send} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { flex: 1, justifyContent: 'center', padding: space(5) },
  title: { fontSize: 30, fontWeight: '800', color: colors.text },
  intro: { fontSize: 16, lineHeight: 23, color: colors.muted, marginTop: space(2), marginBottom: space(6) },
  label: { fontSize: 15, fontWeight: '600', color: colors.text, marginBottom: space(1.5) },
  input: {
    minHeight: TAP_TARGET,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.muted,
    borderRadius: radius.control,
    paddingHorizontal: space(3.5),
    fontSize: 20,
    color: colors.text,
    marginBottom: space(3),
  },
  error: { fontSize: 14, lineHeight: 20, color: colors.owes, marginBottom: space(3) },
});
