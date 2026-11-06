import { endReadingWarning } from '@dt/domain';
import { randomUUID } from 'expo-crypto';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { TextField } from '@/components/form';
import { Text } from '@/components/text';
import { BottomActions, Button } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { confirmNumber } from '@/lib/confirm-number';
import { enqueue } from '@/lib/queue';
import { colors, space, themedStyles } from '@/lib/theme';
import { stopTracking } from '@/lib/tracking';

export default function EndDay() {
  const params = useLocalSearchParams<{ day: string; plate: string; start: string }>();
  const start = Number(params.start);
  const { userId, account } = useAuth();
  const [reading, setReading] = useState('');
  const [saving, setSaving] = useState(false);
  const clientId = useRef(randomUUID());

  const end = Number(reading);
  const tooLow = reading !== '' && end < start;
  const ready = reading !== '' && !tooLow;

  const save = async () => {
    const businessId = account?.business?.id;
    if (!userId || !businessId) return;
    setSaving(true);
    await enqueue(userId, 'end_day', businessId, { tripDayId: params.day, odometerEnd: end }, clientId.current);
    await stopTracking();
    router.back();
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: `End day on ${params.plate}` }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.intro}>Read the odometer on the bus now that you have finished.</Text>
        <TextField
          label="Odometer reading (km)"
          value={reading}
          onChange={(text) => setReading(text.replace(/\D/g, ''))}
          placeholder="For example, 124750"
          maxLength={7}
          keyboardType="number-pad"
          hint={`You started at ${start.toLocaleString('en-US')} km.`}
        />
        {tooLow ? (
          <Text style={styles.error} accessibilityRole="alert">
            This is lower than the reading when you started.
          </Text>
        ) : null}
        {ready ? <Text style={styles.distance}>You drove {(end - start).toLocaleString('en-US')} km.</Text> : null}
        <Text style={styles.small}>
          Once you end the day, only your owner can reopen it. Check the reading before you continue. Location turns off when you
          end the day.
        </Text>
      </ScrollView>
      <BottomActions>
        <Button label={saving ? 'Saving...' : 'End day'} disabled={!ready || saving} onPress={() => confirmNumber(endReadingWarning(start, end), () => void save())} />
      </BottomActions>
    </KeyboardAvoidingView>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: space(4), paddingBottom: space(8) },
  intro: { fontSize: 16, lineHeight: 23, color: colors.muted, marginBottom: space(5) },
  error: { fontSize: 14, lineHeight: 20, color: colors.owes },
  distance: { fontSize: 18, fontWeight: '700', color: colors.text },
  small: { fontSize: 14, lineHeight: 20, color: colors.muted, marginTop: space(4) },
}));
