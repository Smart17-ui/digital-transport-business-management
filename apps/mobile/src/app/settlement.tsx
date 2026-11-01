import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { BottomActions, Button, Card, MoneyRow, Note, Pill, ProgressBar, SectionTitle } from '@/components/ui';
import { busById, money, OWNER, TODAY, useSample, type Audience, type BusDay } from '@/lib/sample';
import { colors, space } from '@/lib/theme';

export default function Settlement() {
  const params = useLocalSearchParams<{ bus: string; as: Audience }>();
  const { dayFor, entriesFor } = useSample();
  const audience: Audience = params.as === 'driver' ? 'driver' : 'owner';
  const bus = busById(params.bus);
  const day = dayFor(bus.id, audience);
  const isDriver = audience === 'driver';
  const driverName = bus.driver ?? 'Driver';
  const pending = entriesFor(bus.id, audience).find((e) => e.kind === 'remittance' && e.status === 'pending');
  const settled = day.left === 0 && day.waitingToConfirm === 0;

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ title: isDriver ? 'Your day' : 'Daily settlement' }} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.heading}>
          <Text style={styles.detail}>{bus.plate} · {driverName} · {TODAY}</Text>
          {settled ? <Pill label="Settled" tone="ok" /> : <Pill label="Not final yet" tone="waiting" />}
        </View>

        <Card>
          <Text style={styles.verdict}>{verdict(day, isDriver, driverName)}</Text>
          <Text style={styles.amount} adjustsFontSizeToFit numberOfLines={1}>
            {money(Math.abs(day.left))}
          </Text>
          <ProgressBar part={day.handedOver} whole={day.owedTotal} />
          <View style={styles.progressText}>
            <Text style={styles.detail}>
              {money(day.handedOver)} of {money(day.owedTotal)} handed over
            </Text>
            {day.waitingToConfirm > 0 ? (
              <Text style={styles.waiting}>{money(day.waitingToConfirm)} waiting to confirm</Text>
            ) : null}
          </View>
        </Card>

        <SectionTitle>How {money(day.owedTotal)} was worked out</SectionTitle>
        <Card style={styles.rows}>
          <Breakdown day={day} isDriver={isDriver} />
        </Card>

        <SectionTitle>Where the takings went</SectionTitle>
        <Card style={styles.rows}>
          <MoneyRow label="Takings so far" value={money(day.takings)} strong />
          <MoneyRow label="To the owner" value={money(day.owedTotal)} />
          {day.costsPaidFromCash > 0 ? <MoneyRow label="Costs paid from the cash" value={money(day.costsPaidFromCash)} /> : null}
          <MoneyRow label={isDriver ? 'You keep' : `${driverName} keeps`} value={money(day.driverKeeps)} last />
        </Card>

        {day.left > 0 ? <Note>Anything not paid today moves to tomorrow as money still owed.</Note> : null}
      </ScrollView>

      {isDriver && day.left > 0 ? (
        <BottomActions>
          <Button
            label={`Pay ${money(day.left)} to the owner`}
            onPress={() => router.push({ pathname: '/handover', params: { kind: 'remittance' } })}
          />
        </BottomActions>
      ) : null}
      {!isDriver && pending ? (
        <BottomActions>
          <Button
            label={`Check ${money(pending.amount)} from ${driverName}`}
            onPress={() => router.push({ pathname: '/confirm', params: { entry: pending.id } })}
          />
        </BottomActions>
      ) : null}
    </View>
  );
}

function verdict(day: BusDay, isDriver: boolean, driverName: string): string {
  if (day.left > 0) return isDriver ? `You still owe ${OWNER}` : `${driverName} still owes you`;
  if (day.left < 0) return isDriver ? `${OWNER} owes you` : `You owe ${driverName}`;
  return 'Nothing left to pay';
}

function Breakdown({ day, isDriver }: { day: BusDay; isDriver: boolean }) {
  const { bus } = day;
  const start =
    bus.type === 'revenue_share' ? (
      <MoneyRow
        label={`Owner's ${(bus.terms['ownerShareBasisPoints'] ?? 0) / 100}% of takings`}
        value={money(day.statement.ownerShare + day.statement.expensesBorneByOwner)}
      />
    ) : (
      <MoneyRow label="Daily target" value={money(bus.terms['dailyTarget'] ?? 0)} />
    );
  return (
    <>
      {start}
      {bus.expenses.map((x) => (
        <MoneyRow
          key={x.id}
          label={x.label}
          note={isDriver ? "You paid, it is the owner's cost" : "Driver paid, it is your cost"}
          value={`- ${money(x.amount)}`}
          color={colors.owed}
        />
      ))}
      {bus.arrears > 0 ? (
        <MoneyRow label="Short from Sat 31 Oct" value={`+ ${money(bus.arrears)}`} color={colors.owes} />
      ) : null}
      <MoneyRow label="Owed for today" value={money(day.owedTotal)} strong last />
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: space(4), paddingBottom: space(8) },
  heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space(2), marginBottom: space(3) },
  detail: { flexShrink: 1, fontSize: 14, color: colors.muted },
  verdict: { fontSize: 16, fontWeight: '600', color: colors.muted },
  amount: { fontSize: 44, fontWeight: '800', color: colors.text, marginTop: space(1), marginBottom: space(3), fontVariant: ['tabular-nums'] },
  progressText: { gap: space(1), marginTop: space(2) },
  waiting: { fontSize: 14, fontWeight: '600', color: colors.waiting },
  rows: { paddingVertical: space(1) },
});
