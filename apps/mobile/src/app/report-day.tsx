import { randomUUID } from 'expo-crypto';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { Choice, TextField } from '@/components/form';
import { Text } from '@/components/text';
import { BottomActions, Button } from '@/components/ui';
import { localDate } from '@/lib/arrangements';
import { useAuth } from '@/lib/auth';
import { REPORT_KINDS, type ReportKind } from '@/lib/business';
import { enqueue } from '@/lib/queue';
import { colors, space, themedStyles, type } from '@/lib/theme';

export default function ReportDay() {
  const { bus, plate } = useLocalSearchParams<{ bus: string; plate: string }>();
  const { userId, account } = useAuth();
  const today = localDate();
  const yesterday = localDate(new Date(Date.now() - 86_400_000));
  const [date, setDate] = useState(today);
  const [kind, setKind] = useState<ReportKind | null>(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const newReport = useRef({ reportId: randomUUID(), clientId: randomUUID() });
  const ready = !!kind && reason.trim() !== '' && !saving;

  const save = async () => {
    const businessId = account?.business?.id;
    if (!userId || !businessId || !kind) return;
    setSaving(true);
    await enqueue(
      userId,
      'report_day',
      businessId,
      { reportId: newReport.current.reportId, vehicleId: bus, serviceDate: date, kind, reason: reason.trim() },
      newReport.current.clientId,
    );
    router.back();
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'Report a problem' }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.intro}>
          Tell your owner what happened on {plate}. If they accept it, nothing more is owed for that day.
        </Text>
        <Text style={styles.label}>Which day?</Text>
        <Choice
          options={[
            { value: today, label: 'Today' },
            { value: yesterday, label: 'Yesterday' },
          ]}
          value={date}
          onChange={setDate}
        />
        <Text style={styles.label}>What happened?</Text>
        <Choice wrap options={REPORT_KINDS} value={kind} onChange={setKind} />
        <TextField
          label="Give the details"
          value={reason}
          onChange={setReason}
          placeholder="For example, gearbox failed at noon"
          maxLength={300}
          hint="Say who can confirm it, such as the mechanic."
        />
      </ScrollView>
      <BottomActions>
        <Button label={saving ? 'Saving...' : 'Send to owner'} disabled={!ready} onPress={save} />
      </BottomActions>
    </KeyboardAvoidingView>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: space(4), paddingBottom: space(8) },
  intro: { ...type.body, color: colors.muted, marginBottom: space(5) },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: colors.text, marginBottom: space(1.5) },
}));
