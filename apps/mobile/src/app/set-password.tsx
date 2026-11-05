import { passwordProblem } from '@dt/domain';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet } from 'react-native';
import { PasswordField } from '@/components/form';
import { Text } from '@/components/text';
import { Button } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { PASSWORD_PROBLEMS, setPasswordErrorMessage } from '@/lib/auth-errors';
import { colors, space, themedStyles, type } from '@/lib/theme';

/** Shown after a code, before anything else: for a new account, an older one, or a reset. */
export default function SetPassword() {
  const { account, resettingPassword, setPassword, signOut } = useAuth();
  const [password, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const problem = passwordProblem(password, account?.phone ?? null);
    if (problem) {
      setError(PASSWORD_PROBLEMS[problem]);
      return;
    }
    setError(null);
    setSaving(true);
    const failed = await setPassword(password);
    // On success the root layout moves on from this screen.
    if (failed) {
      setError(setPasswordErrorMessage(failed));
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: resettingPassword ? 'Set a new password' : 'Set your password', headerBackVisible: false }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.intro}>
          {resettingPassword
            ? 'Choose a new password. Any other phone signed in to your account will be signed out.'
            : 'You will use this with your phone number to sign in. You stay signed in on this phone until you sign out.'}
        </Text>
        <PasswordField
          label="Password"
          value={password}
          onChange={setValue}
          onSubmit={save}
          autoComplete="new-password"
          hint="At least 8 characters. Words and numbers are fine."
        />
        {error ? (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
        <Button label={saving ? 'Saving...' : 'Save password'} disabled={saving || password === ''} onPress={save} />
        <Pressable onPress={signOut} accessibilityRole="button" hitSlop={12} style={styles.signOut}>
          <Text style={styles.link}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: space(5) },
  intro: { ...type.body, color: colors.muted, marginBottom: space(5) },
  error: { ...type.small, color: colors.owes, marginBottom: space(3) },
  signOut: { alignItems: 'center', marginTop: space(5) },
  link: { ...type.small, fontWeight: '600', color: colors.text, textDecorationLine: 'underline' },
}));
