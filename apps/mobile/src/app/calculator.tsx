import { formatKwacha } from '@dt/domain';
import { Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Choice, MoneyField } from '@/components/form';
import { previewDay, type PreviewInput } from '@/lib/preview';
import { colors, space } from '@/lib/theme';

const ARRANGEMENTS = [
  { value: 'fixed_target', label: 'Fixed target' },
  { value: 'revenue_share', label: 'Share' },
  { value: 'salary', label: 'Salary' },
] as const;

const TERM_LABEL: Record<PreviewInput['type'], string> = {
  fixed_target: 'Daily target (K)',
  revenue_share: "Owner's share (%)",
  salary: 'Daily pay (K)',
};

export default function SettlementPreview() {
  const [input, setInput] = useState<PreviewInput>({
    type: 'fixed_target',
    term: '500',
    takings: '800',
    fuelFromCash: '200',
    ownerBearsFuel: true,
    handedToOwner: '',
  });
  const set = <K extends keyof PreviewInput>(key: K) => (value: PreviewInput[K]) =>
    setInput((current) => ({ ...current, [key]: value }));
  const result = useMemo(() => previewDay(input), [input]);

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'Settlement preview' }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.intro}>
          Try a day's numbers. This uses the same calculation the server will use to settle a real day.
        </Text>

        <Text style={styles.section}>Arrangement</Text>
        <Choice options={ARRANGEMENTS} value={input.type} onChange={set('type')} />
        <MoneyField label={TERM_LABEL[input.type]} value={input.term} onChange={set('term')} />

        <Text style={styles.section}>The day</Text>
        <MoneyField label="Takings collected (K)" value={input.takings} onChange={set('takings')} />
        <MoneyField
          label="Fuel bought from the cash (K)"
          value={input.fuelFromCash}
          onChange={set('fuelFromCash')}
        />
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Owner pays for fuel</Text>
          <Switch value={input.ownerBearsFuel} onValueChange={set('ownerBearsFuel')} />
        </View>
        <MoneyField
          label="Already handed to the owner today (K)"
          value={input.handedToOwner}
          onChange={set('handedToOwner')}
        />

        <View style={styles.card}>
          {result.ok ? (
            <>
              <Text style={styles.verdictLabel}>
                {result.statement.whoOwesWhom === 'driver_owes_owner'
                  ? 'Driver pays the owner'
                  : result.statement.whoOwesWhom === 'owner_owes_driver'
                    ? 'Owner pays the driver'
                    : 'Nothing owed'}
              </Text>
              <Text
                style={[
                  styles.verdictAmount,
                  { color: result.statement.whoOwesWhom === 'owner_owes_driver' ? colors.owed : colors.owes },
                ]}
              >
                {formatKwacha(result.statement.amountOwed)}
              </Text>
              <Line label="Takings" value={result.statement.grossIncome} />
              <Line label="Costs the owner bears" value={-result.statement.expensesBorneByOwner} />
              <Line label="Costs the driver bears" value={-result.statement.expensesBorneByDriver} />
              <Line label="Owner's share" value={result.statement.ownerShare} strong />
              <Line label="Driver's share" value={result.statement.driverShare} strong />
            </>
          ) : (
            <Text style={styles.error}>{result.reason}</Text>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Line({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <View style={styles.line}>
      <Text style={[styles.lineLabel, strong && styles.strong]}>{label}</Text>
      <Text style={[styles.lineValue, strong && styles.strong]}>{formatKwacha(value)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: space(4), paddingBottom: space(12) },
  intro: { fontSize: 15, color: colors.muted, marginBottom: space(5), lineHeight: 21 },
  section: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: space(2),
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: space(4),
  },
  switchLabel: { fontSize: 15, fontWeight: '600', color: colors.text },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space(4),
    marginTop: space(2),
  },
  verdictLabel: { fontSize: 15, color: colors.muted, fontWeight: '600' },
  verdictAmount: { fontSize: 36, fontWeight: '800', marginBottom: space(3) },
  line: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: space(1.5) },
  lineLabel: { fontSize: 15, color: colors.muted },
  lineValue: { fontSize: 15, color: colors.text, fontVariant: ['tabular-nums'] },
  strong: { color: colors.text, fontWeight: '700' },
  error: { fontSize: 15, color: colors.owes },
});
