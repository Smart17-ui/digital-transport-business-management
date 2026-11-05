import { randomUUID } from 'expo-crypto';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '@/components/text';
import { BottomActions, Button, Card, LoadError, MoneyRow, ScreenLoading } from '@/components/ui';
import { kwacha } from '@/lib/arrangements';
import { useAuth } from '@/lib/auth';
import { costCategoryLabel, fetchCostToCheck, useScreenData } from '@/lib/business';
import { reasonFor, sendCommand } from '@/lib/commands';
import { colors, radius, space, themedStyles, type } from '@/lib/theme';

export default function CheckCost() {
  const { cost: costId } = useLocalSearchParams<{ cost: string }>();
  const { account } = useAuth();
  const load = useCallback(() => fetchCostToCheck(costId), [costId]);
  const { data, failed, reload } = useScreenData(load);

  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // One per answer, so a retry after lost signal repeats that answer and a change of mind is a new command.
  const attempt = useRef({ approve: randomUUID(), reject: randomUUID() });

  const cost = data?.cost;
  const open = cost?.status === 'pending';
  const driver = data?.driverName ?? 'The driver';

  const decide = async (accept: boolean) => {
    const businessId = account?.business?.id;
    if (!businessId) return;
    setError(null);
    setSaving(true);
    try {
      await sendCommand(
        'decide_expense',
        businessId,
        { expenseId: costId, accept, reason: accept ? null : reason.trim() },
        accept ? attempt.current.approve : attempt.current.reject,
      );
      router.back();
    } catch (failure) {
      setError(reasonFor(failure));
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'Check cost' }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {failed && !data ? <LoadError message="Could not load this cost. Check your signal and try again." onRetry={reload} /> : null}
        {!data && !failed ? <ScreenLoading /> : null}
        {data && !open ? <Text style={styles.line}>This cost has already been answered.</Text> : null}

        {cost && open ? (
          <>
            <Text style={styles.line}>{driver} spent</Text>
            <Text style={styles.amount} adjustsFontSizeToFit numberOfLines={1}>
              {kwacha(cost.amount)}
            </Text>
            <Card style={styles.rows}>
              <MoneyRow label="For" value={costCategoryLabel(cost.category)} />
              {cost.litres ? <MoneyRow label="Litres" value={String(cost.litres)} /> : null}
              {data?.plate ? <MoneyRow label="Bus" value={data.plate} /> : null}
              <MoneyRow label="If you approve" value={cost.borneBy === 'owner' ? 'Comes off what you get' : 'The driver bears it'} last={!cost.note} />
              {cost.note ? <MoneyRow label="Note" value={cost.note} last /> : null}
            </Card>

            {rejecting ? (
              <View style={styles.reject}>
                <Text style={styles.label}>Why are you rejecting it?</Text>
                <TextInput
                  style={styles.input}
                  value={reason}
                  onChangeText={setReason}
                  placeholder="For example, this amount is too high"
                  placeholderTextColor={colors.muted}
                  maxLength={300}
                  multiline
                  autoFocus
                  accessibilityLabel="Why are you rejecting it"
                />
                <Text style={styles.small}>A rejected cost does not come off the cashing. {driver} will see your reason.</Text>
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

      {cost && open ? (
        <BottomActions>
          {rejecting ? (
            <>
              <Button
                label={saving ? 'Sending...' : 'Reject this cost'}
                disabled={reason.trim() === '' || saving}
                onPress={() => decide(false)}
              />
              <Button variant="secondary" label="Go back" disabled={saving} onPress={() => setRejecting(false)} />
            </>
          ) : (
            <>
              <Button label={saving ? 'Sending...' : `Approve ${kwacha(cost.amount)}`} disabled={saving} onPress={() => decide(true)} />
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
  line: { ...type.body, color: colors.muted, textAlign: 'center', marginTop: space(4) },
  amount: { ...type.display, color: colors.text, textAlign: 'center', marginTop: space(1), marginBottom: space(5), fontVariant: ['tabular-nums'] },
  rows: { paddingVertical: space(1) },
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
  small: { ...type.small, color: colors.muted, marginTop: space(2) },
  error: { ...type.small, color: colors.owes, marginTop: space(3), textAlign: 'center' },
}));
