import { randomUUID } from 'expo-crypto';
import { router, Stack } from 'expo-router';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { Choice, TextField } from '@/components/form';
import { Text } from '@/components/text';
import { BottomActions, Button } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { BUS_TYPES, type BusType } from '@/lib/business';
import { reasonFor, sendCommand } from '@/lib/commands';
import { colors, space } from '@/lib/theme';

export default function AddBus() {
  const { account } = useAuth();
  const [plate, setPlate] = useState('');
  const [type, setType] = useState<BusType>('minibus');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Kept across retries, so a reply lost to bad signal cannot add the bus twice.
  const newBus = useRef({ vehicleId: randomUUID(), clientId: randomUUID() });

  const save = async () => {
    const businessId = account?.business?.id;
    if (!businessId) return;
    setError(null);
    setSaving(true);
    try {
      const { vehicleId, clientId } = newBus.current;
      await sendCommand('register_vehicle', businessId, { vehicleId, plate: plate.trim(), vehicleType: type }, clientId);
      router.back();
    } catch (failed) {
      setError(reasonFor(failed));
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'Add a bus' }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TextField
          label="Number plate"
          value={plate}
          onChange={(text) => setPlate(text.toUpperCase())}
          placeholder="For example, BAF 2314"
          maxLength={20}
          autoCapitalize="characters"
        />
        <Text style={styles.label}>Type of bus</Text>
        <Choice options={BUS_TYPES} value={type} onChange={setType} />
        {error ? (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
      </ScrollView>

      <BottomActions>
        <Button label={saving ? 'Saving...' : 'Add bus'} disabled={plate.trim() === '' || saving} onPress={save} />
      </BottomActions>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: space(4), paddingBottom: space(8) },
  label: { fontSize: 15, fontWeight: '600', color: colors.text, marginBottom: space(1.5) },
  error: { fontSize: 14, lineHeight: 20, color: colors.owes },
});
