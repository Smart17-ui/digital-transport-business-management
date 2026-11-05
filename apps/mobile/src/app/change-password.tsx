import { passwordProblem } from '@dt/domain';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { PasswordField } from '@/components/form';
import { Text } from '@/components/text';
import { BottomActions, Button } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { PASSWORD_PROBLEMS, setPasswordErrorMessage, signInErrorMessage } from '@/lib/auth-errors';
import { supabase } from '@/lib/supabase';
import { colors, space, themedStyles, type } from '@/lib/theme';

export default function ChangePassword() {
  const { account, setPassword } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const problem = passwordProblem(next, account?.phone ?? null);
    if (problem) {
      setError(PASSWORD_PROBLEMS[problem]);
      return;
    }
    setError(null);
    setSaving(true);
    // Someone holding an unlocked phone must not be able to take over the account.
    const check = await supabase.auth.signInWithPassword({ phone: account?.phone ?? '', password: current });
    if (check.error) {
      setError(check.error.code === 'invalid_credentials' ? 'Your current password is wrong.' : signInErrorMessage(check.error));
      setSaving(false);
      return;
    }
    const failed = await setPassword(next);
    if (failed) {
      setError(setPasswordErrorMessage(failed));
      setSaving(false);
      return;
    }
    await supabase.auth.signOut({ scope: 'others' });
    router.back();
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'Change password' }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.intro}>Any other phone signed in to your account will be signed out.</Text>
        <PasswordField label="Current password" value={current} onChange={setCurrent} autoComplete="current-password" />
        <PasswordField
          label="New password"
          value={next}
          onChange={setNext}
          autoComplete="new-password"
          hint="At least 8 characters. Words and numbers are fine."
        />
        {error ? (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
      </ScrollView>
      <BottomActions>
        <Button label={saving ? 'Saving...' : 'Change password'} disabled={saving || current === '' || next === ''} onPress={save} />
      </BottomActions>
    </KeyboardAvoidingView>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: space(4), paddingBottom: space(8) },
  intro: { ...type.body, color: colors.muted, marginBottom: space(5) },
  error: { ...type.small, color: colors.owes },
}));
