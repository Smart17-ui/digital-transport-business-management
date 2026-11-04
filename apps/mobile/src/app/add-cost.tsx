import { parseKwacha } from '@dt/domain';
import { randomUUID } from 'expo-crypto';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { Choice, MoneyField, TextField } from '@/components/form';
import { Text } from '@/components/text';
import { BottomActions, Button } from '@/components/ui';
import { kwacha } from '@/lib/arrangements';
import { useAuth } from '@/lib/auth';
import { COST_CATEGORIES, type CostCategory } from '@/lib/business';
import { enqueue } from '@/lib/queue';
import { colors, space } from '@/lib/theme';

function amountFrom(text: string): number {
  try {
    return parseKwacha(text);
  } catch {
    return 0;
  }
}

/** Empty means no litres given; null means what was typed is not a usable number. */
function litresFrom(text: string): number | undefined | null {
  if (text.trim() === '') return undefined;
  const litres = Number(text);
  return Number.isFinite(litres) && litres > 0 && litres < 100_000 ? Math.round(litres * 100) / 100 : null;
}

export default function AddCost() {
  const params = useLocalSearchParams<{ day: string; bus: string }>();
  const { userId, account } = useAuth();
  const [category, setCategory] = useState<CostCategory | null>(null);
  const [amountText, setAmountText] = useState('');
  const [litresText, setLitresText] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const newCost = useRef({ expenseId: randomUUID(), clientId: randomUUID() });

  const amount = amountFrom(amountText);
  const fuel = category === 'fuel';
  const litres = fuel ? litresFrom(litresText) : undefined;
  const ready = !!category && amount > 0 && litres !== null && !saving;

  const save = async () => {
    const businessId = account?.business?.id;
    if (!userId || !businessId || !category || litres === null) return;
    setSaving(true);
    await enqueue(
      userId,
      'log_expense',
      businessId,
      {
        expenseId: newCost.current.expenseId,
        tripDayId: params.day,
        vehicleId: params.bus,
        category,
        amount,
        litres: litres ?? null,
        paidBy: 'driver_cash',
        note: note.trim(),
        receiptPath: null,
        borneByOverride: null,
      },
      newCost.current.clientId,
    );
    router.back();
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'Add a cost' }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.intro}>Record money you spent from the day's cash.</Text>
        <Text style={styles.label}>What was it for?</Text>
        <Choice wrap options={COST_CATEGORIES} value={category} onChange={setCategory} />
        <MoneyField label="Amount (K)" value={amountText} onChange={setAmountText} />
        {fuel ? (
          <MoneyField
            label="Litres (optional)"
            value={litresText}
            onChange={setLitresText}
            hint={litres === null ? 'Enter the litres as a number, or leave this empty.' : undefined}
          />
        ) : null}
        <TextField
          label="Note (optional)"
          value={note}
          onChange={setNote}
          placeholder="For example, front left tyre"
          maxLength={500}
          autoCapitalize="words"
        />
      </ScrollView>
      <BottomActions>
        <Button
          disabled={!ready}
          label={saving ? 'Saving...' : amount > 0 ? `Record ${kwacha(amount)}` : 'Enter an amount'}
          onPress={save}
        />
      </BottomActions>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: space(4), paddingBottom: space(8) },
  intro: { fontSize: 16, lineHeight: 23, color: colors.muted, marginBottom: space(5) },
  label: { fontSize: 15, fontWeight: '600', color: colors.text, marginBottom: space(1.5) },
});
