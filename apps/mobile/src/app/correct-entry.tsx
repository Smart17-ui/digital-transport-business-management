import { parseKwacha } from '@dt/domain';
import { randomUUID } from 'expo-crypto';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from 'react-native';
import { MoneyField, TextField } from '@/components/form';
import { BottomActions, Button } from '@/components/ui';
import { kwacha } from '@/lib/arrangements';
import { useAuth } from '@/lib/auth';
import { reasonFor, sendCommand } from '@/lib/commands';
import { colors, space } from '@/lib/theme';

function amountFrom(text: string): number | null {
  try {
    const amount = parseKwacha(text);
    return amount >= 0 ? amount : null;
  } catch {
    return null;
  }
}

export default function CorrectEntry() {
  const params = useLocalSearchParams<{ id: string; type: string; amount: string; label: string }>();
  const original = Number(params.amount);
  const { account } = useAuth();
  const [amountText, setAmountText] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Reused only for the same answer: a retry after lost signal must not be answered with an earlier correction.
  const attempt = useRef({ key: '', reversalId: randomUUID(), replacementId: randomUUID(), clientId: randomUUID() });

  const amount = amountFrom(amountText);
  const ready = amount !== null && reason.trim() !== '' && !saving;

  const save = async () => {
    const businessId = account?.business?.id;
    if (!businessId || amount === null) return;
    const key = JSON.stringify([amount, reason.trim()]);
    if (attempt.current.key !== key) {
      attempt.current = { key, reversalId: randomUUID(), replacementId: randomUUID(), clientId: randomUUID() };
    }
    setError(null);
    setSaving(true);
    try {
      await sendCommand(
        'correct_entry',
        businessId,
        {
          entryType: params.type === 'expense' ? 'expense' : 'income',
          originalId: params.id,
          reversalId: attempt.current.reversalId,
          replacementId: attempt.current.replacementId,
          amount,
          borneBy: null,
          reason: reason.trim(),
        },
        attempt.current.clientId,
      );
      router.back();
    } catch (failure) {
      setError(reasonFor(failure));
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'Correct an entry' }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.original}>
          {params.label}: {kwacha(original)}
        </Text>
        <Text style={styles.intro}>
          The original stays in the record, with your correction and reason beside it. The driver can see both. If you get this
          wrong, you can correct the new amount too, but an entry set to K0 cannot be corrected again.
        </Text>
        <MoneyField
          label="The right amount (K)"
          value={amountText}
          onChange={setAmountText}
          hint="Enter 0 if this entry should not count at all."
        />
        <TextField
          label="Why is it being corrected?"
          value={reason}
          onChange={setReason}
          placeholder="For example, I counted K700 with the driver"
          maxLength={300}
        />
        {error ? (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
      </ScrollView>
      <BottomActions>
        <Button
          disabled={!ready}
          label={saving ? 'Saving...' : amount === null ? 'Enter the right amount' : `Correct to ${kwacha(amount)}`}
          onPress={save}
        />
      </BottomActions>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: space(4), paddingBottom: space(8) },
  original: { fontSize: 20, fontWeight: '800', color: colors.text },
  intro: { fontSize: 15, lineHeight: 22, color: colors.muted, marginTop: space(2), marginBottom: space(5) },
  error: { fontSize: 14, lineHeight: 20, color: colors.owes },
});
