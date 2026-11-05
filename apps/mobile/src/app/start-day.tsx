import { randomUUID } from 'expo-crypto';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { TextField } from '@/components/form';
import { Text } from '@/components/text';
import { BottomActions, Button } from '@/components/ui';
import { localDate } from '@/lib/arrangements';
import { useAuth } from '@/lib/auth';
import { enqueue } from '@/lib/queue';
import { colors, space, themedStyles } from '@/lib/theme';

export default function StartDay() {
  const { bus, plate } = useLocalSearchParams<{ bus: string; plate: string }>();
  const { userId, account } = useAuth();
  const [reading, setReading] = useState('');
  const [saving, setSaving] = useState(false);
  const newDay = useRef({ tripDayId: randomUUID(), clientId: randomUUID() });

  const save = async () => {
    const businessId = account?.business?.id;
    if (!userId || !businessId) return;
    setSaving(true);
    const { tripDayId, clientId } = newDay.current;
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
      </ScrollView>
      <BottomActions>
        <Button label={saving ? 'Saving...' : 'Start day'} disabled={reading === '' || saving} onPress={save} />
      </BottomActions>
    </KeyboardAvoidingView>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: space(4), paddingBottom: space(8) },
  intro: { fontSize: 16, lineHeight: 23, color: colors.muted, marginBottom: space(5) },
}));
