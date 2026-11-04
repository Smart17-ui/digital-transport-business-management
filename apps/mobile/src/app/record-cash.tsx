import { randomUUID } from 'expo-crypto';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AmountPad, typedAmount } from '@/components/amount-pad';
import { Text } from '@/components/text';
import { BottomActions, Button } from '@/components/ui';
import { kwacha } from '@/lib/arrangements';
import { useAuth } from '@/lib/auth';
import { enqueue } from '@/lib/queue';
import { colors, space } from '@/lib/theme';

export default function RecordCash() {
  const params = useLocalSearchParams<{ day: string; kind: string }>();
  const takings = params.kind === 'takings';
  const { userId, account } = useAuth();
  const [typed, setTyped] = useState('');
  const [saving, setSaving] = useState(false);
  const newEntry = useRef({ entryId: randomUUID(), clientId: randomUUID() });
  const amount = typedAmount(typed);

  const save = async () => {
    const businessId = account?.business?.id;
    if (!userId || !businessId) return;
    setSaving(true);
    await enqueue(
      userId,
      'record_handover',
      businessId,
      {
        entryId: newEntry.current.entryId,
        tripDayId: params.day,
        kind: takings ? 'takings' : 'remittance',
        amount,
        method: 'cash',
        // The server works out who these people are from their roles.
        giver: { kind: takings ? 'conductor' : 'driver', userId: null },
        receiver: { kind: takings ? 'driver' : 'owner', userId: null },
      },
      newEntry.current.clientId,
    );
    router.back();
  };

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ title: takings ? 'Takings collected' : 'Cash to the owner' }} />
      <View style={styles.body}>
        <Text style={styles.amount} adjustsFontSizeToFit numberOfLines={1} accessibilityLiveRegion="polite">
          K{typed || '0'}
        </Text>
        <Text style={styles.helper}>
          {takings
            ? 'Fares collected, by you or the conductor. The owner checks this in the app.'
            : 'Cash you gave the owner. The owner checks this in the app.'}
        </Text>
        <AmountPad onChange={setTyped} />
      </View>
      <BottomActions>
        <Button
          disabled={amount <= 0 || saving}
          label={saving ? 'Saving...' : amount > 0 ? `Record ${kwacha(amount)}` : 'Enter an amount'}
          onPress={save}
        />
      </BottomActions>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { flex: 1, padding: space(4) },
  amount: { fontSize: 52, fontWeight: '800', color: colors.text, textAlign: 'center', marginTop: space(4), fontVariant: ['tabular-nums'] },
  helper: { fontSize: 14, lineHeight: 20, color: colors.muted, textAlign: 'center', marginTop: space(1), marginBottom: space(4) },
});
