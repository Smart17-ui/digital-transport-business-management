import type { ArrangementType, Bearer } from '@dt/domain';
import { randomUUID } from 'expo-crypto';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Choice, MoneyField, OptionCard } from '@/components/form';
import { BottomActions, Button, Card } from '@/components/ui';
import {
  AMOUNT_LABEL,
  ARRANGEMENT_OPTIONS,
  buildTerms,
  describeCosts,
  describeTerms,
  localDate,
} from '@/lib/arrangements';
import { useAuth } from '@/lib/auth';
import { useOwnerOverview } from '@/lib/business';
import { reasonFor, sendCommand } from '@/lib/commands';
import { colors, space } from '@/lib/theme';

const BEARERS = [
  { value: 'owner', label: 'Owner' },
  { value: 'driver', label: 'Driver' },
] as const;

export default function Assign() {
  const { bus: busId } = useLocalSearchParams<{ bus: string }>();
  const { account } = useAuth();
  const businessId = account?.business?.id ?? '';
  const { data: overview, failed, reload } = useOwnerOverview(businessId);

  const [chosenDriver, setChosenDriver] = useState<string | null>(null);
  const [type, setType] = useState<ArrangementType | null>(null);
  const [amount, setAmount] = useState('');
  const [totalPrice, setTotalPrice] = useState('');
  const [fuelBearer, setFuelBearer] = useState<Bearer | null>(null);
  const [otherCostsBearer, setOtherCostsBearer] = useState<Bearer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Reused only for the same terms: a retry after lost signal must not send a second offer,
  // and changed terms must not be answered with the result of the earlier ones.
  const attempt = useRef({ key: '', arrangementId: randomUUID(), clientId: randomUUID() });

  const bus = overview?.buses.find((b) => b.id === busId);
  const onBus = (overview?.arrangements ?? []).filter((a) => a.vehicleId === busId);
  const waitingOn = (driverId: string) => onBus.some((a) => a.driverId === driverId && a.status === 'proposed');
  const available = (overview?.drivers ?? []).filter((d) => !waitingOn(d.id));
  const driverId = chosenDriver ?? (available.length === 1 ? available[0]!.id : null);
  const driver = overview?.drivers.find((d) => d.id === driverId);
  const terms = type ? buildTerms(type, amount, totalPrice) : null;
  const ready = !!bus && !!driverId && !!type && !!terms && !!fuelBearer && !!otherCostsBearer;

  const chooseType = (next: ArrangementType) => {
    setType(next);
    setAmount('');
    setTotalPrice('');
  };

  const send = async () => {
    if (!busId || !driverId || !type || !terms || !fuelBearer || !otherCostsBearer) return;
    const key = JSON.stringify([busId, driverId, type, terms, fuelBearer, otherCostsBearer]);
    if (attempt.current.key !== key) attempt.current = { key, arrangementId: randomUUID(), clientId: randomUUID() };
    setError(null);
    setSaving(true);
    try {
      await sendCommand(
        'propose_arrangement',
        businessId,
        {
          arrangementId: attempt.current.arrangementId,
          vehicleId: busId,
          driverId,
          type,
          terms,
          fuelBearer,
          otherCostsBearer,
          fuelFloat: null,
          effectiveFrom: localDate(),
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
      <Stack.Screen options={{ title: bus ? `Assign ${bus.plate}` : 'Assign a driver' }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {failed && !overview ? (
          <View style={styles.problem}>
            <Text style={styles.message}>Could not load your business. Check your signal and try again.</Text>
            <Button variant="secondary" label="Try again" onPress={reload} />
          </View>
        ) : null}

        {overview ? (
          <>
            <Text style={styles.section}>Driver</Text>
            <View accessibilityRole="radiogroup">
              {overview.drivers.map((d) => {
                const agreed = onBus.some((a) => a.driverId === d.id && a.status === 'active');
                const detail = waitingOn(d.id)
                  ? 'Still has an offer to answer on this bus.'
                  : agreed
                    ? 'Already agreed on this bus. New terms replace the old ones if they accept.'
                    : `+${d.phone ?? ''}`;
                return (
                  <OptionCard
                    key={d.id}
                    title={d.name ?? 'New driver'}
                    detail={detail}
                    selected={d.id === driverId}
                    disabled={waitingOn(d.id)}
                    onPress={() => setChosenDriver(d.id)}
                  />
                );
              })}
            </View>

            <Text style={styles.section}>How is the money split?</Text>
            <View accessibilityRole="radiogroup">
              {ARRANGEMENT_OPTIONS.map((o) => (
                <OptionCard
                  key={o.value}
                  title={o.title}
                  detail={o.detail}
                  selected={o.value === type}
                  onPress={() => chooseType(o.value)}
                />
              ))}
            </View>

            {type ? <MoneyField label={AMOUNT_LABEL[type]} value={amount} onChange={setAmount} /> : null}
            {type === 'rent_to_own' ? (
              <MoneyField label="Full price of the bus (K)" value={totalPrice} onChange={setTotalPrice} />
            ) : null}

            <Text style={styles.section}>Who pays for fuel?</Text>
            <Choice options={BEARERS} value={fuelBearer} onChange={setFuelBearer} />
            <Text style={styles.section}>Who pays other costs?</Text>
            <Choice options={BEARERS} value={otherCostsBearer} onChange={setOtherCostsBearer} />

            {ready ? (
              <Card>
                <Text style={styles.summaryTitle}>
                  {driver?.name ?? 'The driver'} will be asked to accept this for {bus.plate}, starting today
                </Text>
                <Text style={styles.summary}>{describeTerms(type, terms, 'owner')}</Text>
                <Text style={styles.summary}>{describeCosts(fuelBearer, otherCostsBearer, 'owner')}</Text>
                <Text style={styles.small}>Once sent, you cannot take this back. If it is wrong, the driver can decline it.</Text>
              </Card>
            ) : null}

            {error ? (
              <Text style={styles.error} accessibilityRole="alert">
                {error}
              </Text>
            ) : null}
          </>
        ) : null}
      </ScrollView>

      <BottomActions>
        <Button label={saving ? 'Sending...' : 'Send to driver'} disabled={!ready || saving} onPress={send} />
      </BottomActions>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: space(4), paddingBottom: space(8) },
  problem: { gap: space(3) },
  message: { fontSize: 15, lineHeight: 22, color: colors.text },
  section: { fontSize: 15, fontWeight: '700', color: colors.text, marginTop: space(2), marginBottom: space(2) },
  summaryTitle: { fontSize: 15, fontWeight: '700', lineHeight: 21, color: colors.text },
  summary: { fontSize: 15, lineHeight: 22, color: colors.text, marginTop: space(2) },
  small: { fontSize: 13, lineHeight: 19, color: colors.muted, marginTop: space(3) },
  error: { fontSize: 14, lineHeight: 20, color: colors.owes, marginTop: space(3) },
});
