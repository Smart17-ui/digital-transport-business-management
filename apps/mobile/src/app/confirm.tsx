import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Icon } from '@/components/icons';
import { Avatar, BottomActions, Button, Card, MoneyRow } from '@/components/ui';
import { busById, CONDUCTOR, money, useSample } from '@/lib/sample';
import { colors, radius, space } from '@/lib/theme';

export default function ConfirmHandover() {
  const params = useLocalSearchParams<{ entry: string }>();
  const { entryById, dayFor, decide } = useSample();
  const [disputing, setDisputing] = useState(false);
  const [reason, setReason] = useState('');

  const entry = entryById(params.entry);
  if (!entry || entry.status !== 'pending') {
    return (
      <View style={styles.gone}>
        <Stack.Screen options={{ title: 'Confirm cash' }} />
        <Text style={styles.line}>This entry has already been decided.</Text>
      </View>
    );
  }

  const bus = busById(entry.busId);
  const day = dayFor(bus.id, 'owner');
  const remittance = entry.kind === 'remittance';
  const decideAndLeave = (status: 'confirmed' | 'disputed', why: string | null) => {
    decide(entry.id, status, why);
    router.back();
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'Confirm cash' }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.people}>
          <Avatar initials={remittance ? 'JM' : 'PC'} />
          <Icon name="arrowRight" color={colors.muted} />
          <Avatar initials={remittance ? 'MB' : 'JM'} dark={remittance} />
        </View>
        <Text style={styles.line}>
          {remittance ? `${bus.driver} recorded handing you` : `${bus.driver} recorded taking from ${CONDUCTOR}`}
        </Text>
        <Text style={styles.amount} adjustsFontSizeToFit numberOfLines={1}>
          {money(entry.amount)}
        </Text>
        <Text style={styles.detail}>Cash · {bus.plate} · today at {entry.time}</Text>

        {remittance ? (
          <Card style={styles.summary}>
            <MoneyRow label="Already confirmed today" value={money(day.receivedByOwner)} />
            <MoneyRow label={`${bus.driver} owes for today`} value={money(day.owedTotal)} />
            <MoneyRow label="Left after this" value={money(day.left)} strong last />
          </Card>
        ) : null}

        <Text style={styles.small}>
          Once you confirm, this entry is locked. Mistakes can be corrected later with a reason.
        </Text>

        {disputing ? (
          <View style={styles.dispute}>
            <Text style={styles.disputeLabel}>What is wrong?</Text>
            <TextInput
              style={styles.input}
              value={reason}
              onChangeText={setReason}
              placeholder="For example, I only received K400"
              placeholderTextColor={colors.muted}
              maxLength={300}
              multiline
              autoFocus
            />
          </View>
        ) : null}
      </ScrollView>

      <BottomActions>
        {disputing ? (
          <>
            <Button
              label={`Send to ${bus.driver}`}
              disabled={reason.trim() === ''}
              onPress={() => decideAndLeave('disputed', reason.trim())}
            />
            <Button variant="secondary" label="Cancel" onPress={() => setDisputing(false)} />
          </>
        ) : (
          <>
            <Button label={`Yes, ${money(entry.amount)} is correct`} onPress={() => decideAndLeave('confirmed', null)} />
            <Button variant="secondary" label="No, something is wrong" onPress={() => setDisputing(true)} />
          </>
        )}
      </BottomActions>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gone: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space(6) },
  content: { padding: space(4), alignItems: 'center' },
  people: { flexDirection: 'row', alignItems: 'center', gap: space(3), marginVertical: space(4) },
  line: { fontSize: 17, color: colors.muted, textAlign: 'center' },
  amount: { fontSize: 56, fontWeight: '800', color: colors.text, marginVertical: space(1), fontVariant: ['tabular-nums'] },
  detail: { fontSize: 15, color: colors.muted },
  summary: { alignSelf: 'stretch', paddingVertical: space(1), marginTop: space(5) },
  small: { fontSize: 14, lineHeight: 20, color: colors.muted, textAlign: 'center', marginTop: space(4) },
  dispute: { alignSelf: 'stretch', marginTop: space(4) },
  disputeLabel: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: space(1.5) },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.muted,
    borderRadius: radius.control,
    padding: space(3),
    minHeight: 80,
    fontSize: 16,
    color: colors.text,
    textAlignVertical: 'top',
  },
});
