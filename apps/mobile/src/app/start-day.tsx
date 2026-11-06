import { startReadingWarning } from '@dt/domain';
import { randomUUID } from 'expo-crypto';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, ScrollView, StyleSheet } from 'react-native';
import { TextField } from '@/components/form';
import { Text } from '@/components/text';
import { BottomActions, Button, Note } from '@/components/ui';
import { localDate } from '@/lib/arrangements';
import { useAuth } from '@/lib/auth';
import { confirmNumber } from '@/lib/confirm-number';
import { enqueue } from '@/lib/queue';
import { colors, space, themedStyles, type } from '@/lib/theme';
import { LOCATION_PROBLEMS, turnOnLocation, type LocationProblem } from '@/lib/tracking';

export default function StartDay() {
  const { bus, plate, last } = useLocalSearchParams<{ bus: string; plate: string; last?: string }>();
  const { userId, account } = useAuth();
  const [reading, setReading] = useState('');
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<LocationProblem | null>(null);
  const newDay = useRef({ tripDayId: randomUUID(), clientId: randomUUID() });

  const save = async () => {
    const businessId = account?.business?.id;
    if (!userId || !businessId) return;
    setSaving(true);
    setProblem(null);
    const { tripDayId, clientId } = newDay.current;
    // First, because a day cannot start without location.
    const refused = await turnOnLocation({ userId, businessId, tripDayId });
    if (refused) {
      setProblem(refused);
      setSaving(false);
      return;
    }
    await enqueue(
      userId,
      'start_day',
      businessId,
      { tripDayId, vehicleId: bus, serviceDate: localDate(), odometerStart: Number(reading) },
      clientId,
    );
    router.back();
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: `Start day on ${plate}` }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.intro}>Read the odometer on the bus before you set off.</Text>
        <TextField
          label="Odometer reading (km)"
          value={reading}
          onChange={(text) => setReading(text.replace(/\D/g, ''))}
          placeholder="For example, 124500"
          maxLength={7}
          keyboardType="number-pad"
        />
        <Note>
          Location must be on to start your day. Your owner can see where the bus is until you end the day, even when the app
          is closed. Location turns off when you end the day.
        </Note>
        {problem ? (
          <Text style={styles.error} accessibilityRole="alert">
            {LOCATION_PROBLEMS[problem]}
          </Text>
        ) : null}
        {problem === 'blocked' ? <Button compact variant="secondary" label="Open phone settings" onPress={() => void Linking.openSettings()} /> : null}
      </ScrollView>
      <BottomActions>
        <Button label={saving ? 'Starting...' : 'Turn on location and start day'} disabled={reading === '' || saving} onPress={() => confirmNumber(startReadingWarning(Number(reading), last ? Number(last) : null), () => void save())} />
      </BottomActions>
    </KeyboardAvoidingView>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: space(4), paddingBottom: space(8) },
  intro: { fontSize: 16, lineHeight: 23, color: colors.muted, marginBottom: space(5) },
  error: { ...type.small, color: colors.owes, marginVertical: space(3) },
}));
