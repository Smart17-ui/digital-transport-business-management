import { zambianMsisdn } from '@dt/domain';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { TextField } from '@/components/form';
import { Text } from '@/components/text';
import { Button } from '@/components/ui';
import { codeErrorMessage } from '@/lib/auth-errors';
import { supabase } from '@/lib/supabase';
import { colors, space, themedStyles, type } from '@/lib/theme';

/** The first step of creating an account or resetting a password: prove the phone number is yours. */
export default function PhoneCode() {
  const params = useLocalSearchParams<{ mode: string }>();
  const reset = params.mode === 'reset';
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
    const { error: failed } = await supabase.auth.signInWithOtp({
      phone: msisdn,
      // A reset must never quietly create an account for a mistyped number.
      options: { shouldCreateUser: !reset },
    });
    setSending(false);
    if (failed) {
      setError(codeErrorMessage(failed));
      return;
    }
    router.push({ pathname: '/verify', params: { phone: msisdn, mode: reset ? 'reset' : 'create' } });
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: reset ? 'Reset your password' : 'Create an account' }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.intro}>
          {reset
            ? 'Enter your phone number. We will text you a code, then you can set a new password.'
            : 'Enter your phone number. We will text you a code to check it is yours, then you can set a password.'}
        </Text>
        <TextField
          label="Phone number"
          value={phone}
          onChange={setPhone}
          placeholder="097 123 4567"
          maxLength={16}
          keyboardType="phone-pad"
        />
        {error ? (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
        <Button label={sending ? 'Sending...' : 'Send me a code'} disabled={sending} onPress={send} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: space(5) },
  intro: { ...type.body, color: colors.muted, marginBottom: space(5) },
  error: { ...type.small, color: colors.owes, marginBottom: space(3) },
}));
