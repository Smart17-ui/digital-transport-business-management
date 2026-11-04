import { randomUUID } from 'expo-crypto';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AmountPad, typedAmount } from '@/components/amount-pad';
import { Text } from '@/components/text';
import { BottomActions, Button } from '@/components/ui';
import { kwacha } from '@/lib/arrangements';
import { useAuth } from '@/lib/auth';
import { reasonFor, sendCommand } from '@/lib/commands';
import { colors, radius, space } from '@/lib/theme';

function typedFrom(amount: number): string {
  return (amount / 100).toFixed(amount % 100 === 0 ? 0 : 2);
}

export default function Pay() {
  const params = useLocalSearchParams<{ day: string; owed: string; to: string }>();
  const owed = Number(params.owed);
  const { account } = useAuth();
  const [typed, setTyped] = useState(typedFrom(owed));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Reused only for the same amount: a retry after lost signal must not record a second payment.
  const attempt = useRef({ amount: 0, paymentId: randomUUID(), clientId: randomUUID() });
  const amount = typedAmount(typed);
  const tooMuch = amount > owed;

  const save = async () => {
    const businessId = account?.business?.id;
    if (!businessId) return;
    if (attempt.current.amount !== amount) attempt.current = { amount, paymentId: randomUUID(), clientId: randomUUID() };
    setError(null);
    setSaving(true);
    try {
      await sendCommand(
        'claim_payment',
        businessId,
        { paymentId: attempt.current.paymentId, tripDayId: params.day, amount, method: 'cash' },
        attempt.current.clientId,
      );
      router.back();
    } catch (failure) {
      setError(reasonFor(failure));
      setSaving(false);
    }
  };

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ title: 'Record a payment' }} />
      <View style={styles.body}>
        <Text style={styles.amount} adjustsFontSizeToFit numberOfLines={1} accessibilityLiveRegion="polite">
          K{typed || '0'}
        </Text>
        <Text style={styles.helper}>
          Cash you paid {params.to}. It only counts once they confirm it. {kwacha(owed)} is owed.
        </Text>
        {tooMuch || error ? (
          <Text style={styles.error} accessibilityRole="alert">
            {tooMuch ? `That is more than the ${kwacha(owed)} owed.` : error}
          </Text>
        ) : null}
        <Pressable
          accessibilityRole="button"
          onPress={() => setTyped(typedFrom(owed))}
          style={({ pressed }) => [styles.all, pressed && styles.pressed]}
        >
          <Text style={styles.allText}>All {kwacha(owed)}</Text>
        </Pressable>
        <AmountPad onChange={setTyped} />
      </View>
      <BottomActions>
        <Button
          disabled={amount <= 0 || tooMuch || saving}
          label={saving ? 'Sending...' : amount > 0 ? `I paid ${kwacha(amount)}` : 'Enter an amount'}
          onPress={save}
        />
      </BottomActions>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { flex: 1, padding: space(4) },
  amount: { fontSize: 52, fontWeight: '800', color: colors.text, textAlign: 'center', marginTop: space(2), fontVariant: ['tabular-nums'] },
  helper: { fontSize: 14, lineHeight: 20, color: colors.muted, textAlign: 'center', marginTop: space(1), marginBottom: space(3) },
  error: { fontSize: 14, lineHeight: 20, color: colors.owes, textAlign: 'center', marginBottom: space(3) },
  all: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.tint,
    marginBottom: space(3),
  },
  allText: { fontSize: 14, fontWeight: '700', color: colors.text },
  pressed: { opacity: 0.6 },
});
