import { randomUUID } from 'expo-crypto';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '@/components/text';
import { BottomActions, Button } from '@/components/ui';
import { kwacha } from '@/lib/arrangements';
import { useAuth } from '@/lib/auth';
import { fetchEntryToCheck, useScreenData } from '@/lib/business';
import { reasonFor, sendCommand } from '@/lib/commands';
import { colors, radius, space, themedStyles } from '@/lib/theme';

export default function CheckCash() {
  const { entry: entryId } = useLocalSearchParams<{ entry: string }>();
  const { account } = useAuth();
  const load = useCallback(() => fetchEntryToCheck(entryId), [entryId]);
  const { data, failed, reload } = useScreenData(load);

  const [disputing, setDisputing] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // One per answer, so a retry after lost signal repeats that answer and a change of mind is a new command.
  const attempt = useRef({ confirm: randomUUID(), dispute: randomUUID() });

  const entry = data?.entry;
  const open = entry?.status === 'pending';
  const driver = data?.driverName ?? 'The driver';

  const decide = async (decision: 'confirm' | 'dispute') => {
    const businessId = account?.business?.id;
    if (!businessId) return;
    setError(null);
    setSaving(true);
    try {
      await sendCommand(
        'decide_handover',
        businessId,
        { entryId, decision, reason: decision === 'dispute' ? reason.trim() : null },
        attempt.current[decision],
      );
      router.back();
    } catch (failure) {
      setError(reasonFor(failure));
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'Check cash' }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {failed && !data ? (
          <View style={styles.problem}>
            <Text style={styles.small}>Could not load this entry. Check your signal and try again.</Text>
            <Button variant="secondary" label="Try again" onPress={reload} />
          </View>
        ) : null}

        {data && !open ? <Text style={styles.line}>This entry has already been checked.</Text> : null}

        {entry && open ? (
          <>
            <Text style={styles.line}>
              {entry.kind === 'remittance' ? `${driver} recorded handing you` : `${driver} recorded collecting`}
            </Text>
            <Text style={styles.amount} adjustsFontSizeToFit numberOfLines={1}>
              {kwacha(entry.amount)}
            </Text>
            <Text style={styles.detail}>Cash · {data?.plate}</Text>
            <Text style={styles.small}>Once you answer, this entry is locked.</Text>

            {disputing ? (
              <View style={styles.dispute}>
                <Text style={styles.label}>What is wrong?</Text>
                <TextInput
                  style={styles.input}
                  value={reason}
                  onChangeText={setReason}
                  placeholder="For example, I only received K400"
                  placeholderTextColor={colors.muted}
                  maxLength={300}
                  multiline
                  autoFocus
                  accessibilityLabel="What is wrong"
                />
              </View>
            ) : null}

            {error ? (
              <Text style={styles.error} accessibilityRole="alert">
                {error}
              </Text>
            ) : null}
          </>
        ) : null}
      </ScrollView>

      {entry && open ? (
        <BottomActions>
          {disputing ? (
            <>
              <Button
                label={saving ? 'Sending...' : `Send to ${driver}`}
                disabled={reason.trim() === '' || saving}
                onPress={() => decide('dispute')}
              />
              <Button variant="secondary" label="Go back" disabled={saving} onPress={() => setDisputing(false)} />
            </>
          ) : (
            <>
              <Button
                label={saving ? 'Sending...' : `Yes, ${kwacha(entry.amount)} is correct`}
                disabled={saving}
                onPress={() => decide('confirm')}
              />
              <Button variant="secondary" label="No, something is wrong" disabled={saving} onPress={() => setDisputing(true)} />
            </>
          )}
        </BottomActions>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: space(4), paddingBottom: space(8), alignItems: 'stretch' },
  problem: { gap: space(3) },
  line: { fontSize: 17, lineHeight: 24, color: colors.muted, textAlign: 'center', marginTop: space(4) },
  amount: { fontSize: 56, fontWeight: '800', color: colors.text, textAlign: 'center', marginVertical: space(1), fontVariant: ['tabular-nums'] },
  detail: { fontSize: 15, color: colors.muted, textAlign: 'center' },
  small: { fontSize: 14, lineHeight: 20, color: colors.muted, textAlign: 'center', marginTop: space(4) },
  dispute: { marginTop: space(5) },
  label: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: space(1.5) },
  input: {
    minHeight: 88,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.control,
    padding: space(3),
    fontSize: 16,
    color: colors.text,
    textAlignVertical: 'top',
  },
  error: { fontSize: 14, lineHeight: 20, color: colors.owes, marginTop: space(3), textAlign: 'center' },
}));
