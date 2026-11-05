import { randomUUID } from 'expo-crypto';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '@/components/text';
import { BottomActions, Button, Card, LoadError, MoneyRow, ScreenLoading } from '@/components/ui';
import { formatDay } from '@/lib/arrangements';
import { useAuth } from '@/lib/auth';
import { fetchReportToCheck, reportKindLabel, useScreenData } from '@/lib/business';
import { reasonFor, sendCommand } from '@/lib/commands';
import { colors, radius, space, themedStyles, type } from '@/lib/theme';

export default function CheckReport() {
  const { report: reportId } = useLocalSearchParams<{ report: string }>();
  const { account } = useAuth();
  const load = useCallback(() => fetchReportToCheck(reportId), [reportId]);
  const { data, failed, reload } = useScreenData(load);

  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // One per answer, so a retry after lost signal repeats that answer and a change of mind is a new command.
  const attempt = useRef({ accept: randomUUID(), reject: randomUUID() });

  const report = data?.report;
  const open = report?.status === 'pending';
  const driver = data?.driverName ?? 'The driver';

  const decide = async (accept: boolean) => {
    const businessId = account?.business?.id;
    if (!businessId) return;
    setError(null);
    setSaving(true);
    try {
      await sendCommand(
        'decide_report',
        businessId,
        { reportId, accept, reason: accept ? null : reason.trim() },
        accept ? attempt.current.accept : attempt.current.reject,
      );
      router.back();
    } catch (failure) {
      setError(reasonFor(failure));
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'Check report' }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {failed && !data ? <LoadError message="Could not load this report. Check your signal and try again." onRetry={reload} /> : null}
        {!data && !failed ? <ScreenLoading /> : null}
        {data && !open ? <Text style={styles.small}>This report has already been answered.</Text> : null}

        {report && open ? (
          <>
            <Card style={styles.rows}>
              <MoneyRow label="Driver" value={driver} />
              <MoneyRow label="Bus" value={data?.plate ?? ''} />
              <MoneyRow label="Day" value={formatDay(report.serviceDate)} />
              <MoneyRow label="What happened" value={reportKindLabel(report.kind)} last />
            </Card>
            <Card style={styles.details}>
              <Text style={styles.body}>{report.reason}</Text>
            </Card>
            <Text style={styles.small}>
              If you accept, nothing more is owed for this day. Whatever {driver} gave you stands.
            </Text>

            {rejecting ? (
              <View style={styles.reject}>
                <Text style={styles.label}>Why are you rejecting it?</Text>
                <TextInput
                  style={styles.input}
                  value={reason}
                  onChangeText={setReason}
                  placeholder="For example, the mechanic did not confirm this"
                  placeholderTextColor={colors.muted}
                  maxLength={300}
                  multiline
                  autoFocus
                  accessibilityLabel="Why are you rejecting it"
                />
              </View>
            ) : null}

            {error ? (
              <Text style={styles.error} accessibilityRole="alert">
                {error}
              </Text>
            ) : null}
          </>
        ) : null}
      </ScrollView>

      {report && open ? (
        <BottomActions>
          {rejecting ? (
            <>
              <Button
                label={saving ? 'Sending...' : 'Reject this report'}
                disabled={reason.trim() === '' || saving}
                onPress={() => decide(false)}
              />
              <Button variant="secondary" label="Go back" disabled={saving} onPress={() => setRejecting(false)} />
            </>
          ) : (
            <>
              <Button label={saving ? 'Sending...' : 'Accept'} disabled={saving} onPress={() => decide(true)} />
              <Button variant="secondary" label="Reject" disabled={saving} onPress={() => setRejecting(true)} />
            </>
          )}
        </BottomActions>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1, padding: space(4), paddingBottom: space(8) },
  rows: { paddingVertical: space(1) },
  details: { marginTop: space(3) },
  body: { ...type.body, color: colors.text },
  small: { ...type.small, color: colors.muted, marginTop: space(3) },
  reject: { marginTop: space(5) },
  label: { ...type.body, fontWeight: '600', color: colors.text, marginBottom: space(1.5) },
  input: {
    minHeight: 88,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.control,
    padding: space(3),
    fontSize: 16,
    color: colors.text,
    textAlignVertical: 'top',
  },
  error: { ...type.small, color: colors.owes, marginTop: space(3) },
}));
