import { randomUUID } from 'expo-crypto';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { TextField } from '@/components/form';
import { Text } from '@/components/text';
import { BottomActions, Button } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { reasonFor, sendCommand } from '@/lib/commands';
import { colors, space, themedStyles, type } from '@/lib/theme';

export default function ReopenDay() {
  const params = useLocalSearchParams<{ day: string; odometer: string }>();
  const { account } = useAuth();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Reused only for the same reason: a retry after lost signal must not be answered with an earlier attempt.
  const attempt = useRef({ key: '', clientId: randomUUID() });

  const save = async () => {
    const businessId = account?.business?.id;
    if (!businessId) return;
    const text = reason.trim();
    if (attempt.current.key !== text) attempt.current = { key: text, clientId: randomUUID() };
    setError(null);
    setSaving(true);
    try {
      await sendCommand('reopen_day', businessId, { tripDayId: params.day, reason: text }, attempt.current.clientId);
      router.back();
    } catch (failure) {
      setError(reasonFor(failure));
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'Reopen this day' }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.intro}>
          The day will run again, and the driver must end it again with the right odometer reading. The cash entries stay. Your
          reason and the old reading of {Number(params.odometer).toLocaleString('en-US')} km are kept, and the driver can see them.
        </Text>
        <TextField
          label="Why is this day being reopened?"
          value={reason}
          onChange={setReason}
          placeholder="For example, wrong odometer reading"
          maxLength={300}
        />
        {error ? (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
      </ScrollView>
      <BottomActions>
        <Button label={saving ? 'Reopening...' : 'Reopen this day'} disabled={reason.trim() === '' || saving} onPress={save} />
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
