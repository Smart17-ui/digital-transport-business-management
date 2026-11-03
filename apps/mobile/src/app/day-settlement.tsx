import { parseKwacha, type SettlementPayment, type SettlementState } from '@dt/domain';
import { randomUUID } from 'expo-crypto';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { DayActivity } from '@/components/day-activity';
import { MoneyField } from '@/components/form';
import { BottomActions, Button, Card, MoneyRow, Note, Pill, SectionTitle } from '@/components/ui';
import { formatDay, kwacha } from '@/lib/arrangements';
import { useAuth } from '@/lib/auth';
import { costCategoryLabel, fetchDaySettlement, useScreenData } from '@/lib/business';
import { reasonFor, sendCommand } from '@/lib/commands';
import { colors, radius, space } from '@/lib/theme';

const STATE_PILL: Record<SettlementState, { label: string; tone: 'ok' | 'waiting' | 'neutral' }> = {
  nothing_owed: { label: 'Nothing owed', tone: 'ok' },
  settled: { label: 'Settled', tone: 'ok' },
  part_paid: { label: 'Part paid', tone: 'waiting' },
  claimed: { label: 'Payment to confirm', tone: 'waiting' },
  unpaid: { label: 'Not paid yet', tone: 'waiting' },
};

const PAYMENT_STATUS: Record<SettlementPayment['status'], string> = {
  claimed: 'Waiting to be confirmed',
  confirmed: 'Confirmed',
  rejected: 'Not received',
  reversed: 'Undone',
};

function verdict(remaining: number, isOwner: boolean): string {
  if (remaining > 0) return isOwner ? 'Your driver still owes you' : 'You still owe the owner';
  if (remaining < 0) return isOwner ? 'You still owe your driver' : 'The owner still owes you';
  return 'Nothing left to pay';
}

export default function DaySettlement() {
  const params = useLocalSearchParams<{ day: string; plate: string }>();
  const { account } = useAuth();
  const isOwner = account?.business?.role === 'owner';
  const load = useCallback(() => fetchDaySettlement(params.day), [params.day]);
  const { data, failed, refreshing, reload } = useScreenData(load);

  const [answering, setAnswering] = useState<'part' | 'reject' | null>(null);
  const [undoing, setUndoing] = useState<SettlementPayment | null>(null);
  const [partText, setPartText] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Reused only for the same answer, so a retry after lost signal repeats it and a change of mind is a new command.
  const attempt = useRef({ key: '', clientId: randomUUID() });

  const decide = async (payment: SettlementPayment, accept: boolean, confirmedAmount: number | null) => {
    const businessId = account?.business?.id;
    if (!businessId) return;
    const key = JSON.stringify([payment.id, accept, confirmedAmount]);
    if (attempt.current.key !== key) attempt.current = { key, clientId: randomUUID() };
    setError(null);
    setSaving(true);
    try {
      await sendCommand(
        'decide_payment',
        businessId,
        { paymentId: payment.id, accept, confirmedAmount, reason: accept ? null : reason.trim() || null },
        attempt.current.clientId,
      );
      setAnswering(null);
      setPartText('');
      setReason('');
      await reload();
    } catch (failure) {
      setError(reasonFor(failure));
    }
    setSaving(false);
  };

  const undo = async (payment: SettlementPayment) => {
    const businessId = account?.business?.id;
    if (!businessId) return;
    const key = JSON.stringify([payment.id, 'undo', reason.trim()]);
    if (attempt.current.key !== key) attempt.current = { key, clientId: randomUUID() };
    setError(null);
    setSaving(true);
    try {
      await sendCommand('reverse_payment', businessId, { paymentId: payment.id, reason: reason.trim() }, attempt.current.clientId);
      setUndoing(null);
      setReason('');
      await reload();
    } catch (failure) {
      setError(reasonFor(failure));
    }
    setSaving(false);
  };

  const title = <Stack.Screen options={{ title: 'Settlement' }} />;
  if (!data) {
    return (
      <View style={styles.centre}>
        {title}
        {failed ? (
          <>
            <Text style={styles.message}>Could not load the settlement. It needs signal. Check yours and try again.</Text>
            <Button variant="secondary" label="Try again" onPress={reload} />
          </>
        ) : (
          <Text style={styles.message}>Loading...</Text>
        )}
      </View>
    );
  }

  const { statement, payments, position, tripDay, entries, costs, allocation } = data;
  const closed = tripDay.endedAt !== null;
  // Only the newest finished day carries the running balance. An older day shows what is left of that day
  // once later payments are counted, and paying from it could pay the same debt twice.
  const older = closed && data.latestClosedId !== params.day;
  const remaining = older ? (allocation.left[params.day] ?? 0) : position.remaining;
  const iOwe = isOwner ? remaining < 0 : remaining > 0;
  const iWasPaidBy = (payer: SettlementPayment['payer']) => (isOwner ? payer === 'driver' : payer === 'owner');
  const claimed = payments.find((p) => p.status === 'claimed');
  const iAnswerClaim = !!claimed && iWasPaidBy(claimed.payer);
  const canPay = closed && !older && iOwe && !claimed;
  const olderPill =
    remaining !== 0
      ? ({ label: 'Not fully paid', tone: 'waiting' } as const)
      : ({ label: statement.owedForDay === 0 ? 'Nothing owed' : 'Paid up', tone: 'ok' } as const);
  const partAmount = (() => {
    try {
      return parseKwacha(partText);
    } catch {
      return 0;
    }
  })();
  const partValid = !!claimed && partAmount > 0 && partAmount <= claimed.amount;

  const reversed = new Set([...entries.map((e) => e.reversesId), ...costs.map((c) => c.reversesId)]);
  const entryLabel = (kind: string) => (kind === 'takings' ? 'Takings collected' : 'Handed to you');
  const correctable = isOwner
    ? [
        ...entries
          .filter((e) => e.amount > 0 && e.status !== 'pending' && !reversed.has(e.id))
          .sort((a, b) => Number(b.status === 'disputed') - Number(a.status === 'disputed'))
          .map((e) => ({
            id: e.id,
            type: 'income',
            amount: e.amount,
            label: entryLabel(e.kind),
            note: e.status === 'disputed' ? 'Disputed. Correct it to settle the day.' : null,
          })),
        ...costs
          .filter((c) => c.amount > 0 && !reversed.has(c.id))
          .map((c) => ({ id: c.id, type: 'expense', amount: c.amount, label: costCategoryLabel(c.category), note: null })),
      ]
    : [];

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {title}
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} />}
      >
        <View style={styles.heading}>
          <Text style={styles.detail}>
            {params.plate} · {formatDay(tripDay.serviceDate)}
          </Text>
          {statement.provisional ? (
            <Pill label="Not final yet" tone="waiting" />
          ) : (
            <Pill {...(older ? olderPill : STATE_PILL[position.state])} />
          )}
        </View>

        <Card style={styles.headline}>
          <Text style={styles.verdict}>{verdict(remaining, isOwner)}</Text>
          <Text style={styles.amount} adjustsFontSizeToFit numberOfLines={1}>
            {kwacha(Math.abs(remaining))}
          </Text>
        </Card>

        {!closed ? <Note>The day is still running, so these figures will change.</Note> : null}
        {older ? (
          <Note>
            This is what is left from this day, counting later payments against the oldest money owed first.{' '}
            {allocation.balance === 0
              ? 'Across all days, nothing is owed now.'
              : allocation.balance > 0
                ? `Across all days, ${isOwner ? 'your driver owes you' : 'you owe the owner'} ${kwacha(allocation.balance)} now.`
                : `Across all days, ${isOwner ? 'you owe your driver' : 'the owner owes you'} ${kwacha(-allocation.balance)} now.`}
          </Note>
        ) : null}
        {statement.unconfirmedIncomeIds.length > 0 ? (
          <Note>
            {statement.unconfirmedIncomeIds.length === 1
              ? '1 entry has not been agreed yet, and it is not counted below.'
              : `${statement.unconfirmedIncomeIds.length} entries have not been agreed yet, and they are not counted below.`}
          </Note>
        ) : null}

        <SectionTitle>How it was worked out</SectionTitle>
        <Card style={styles.rows}>
          <MoneyRow label="Confirmed takings" value={kwacha(statement.grossIncome)} />
          <MoneyRow label="Costs the owner bears" value={kwacha(statement.expensesBorneByOwner)} />
          <MoneyRow label="Costs the driver bears" value={kwacha(statement.expensesBorneByDriver)} />
          <MoneyRow
            label="The owner's part of the day"
            note={statement.targetApplies ? undefined : 'The bus was off the road, so no fixed amount applied.'}
            value={kwacha(statement.ownerShare)}
            strong
          />
          <MoneyRow label="The driver's part of the day" value={kwacha(statement.driverShare)} strong />
          <MoneyRow label="The owner already has" value={kwacha(statement.ownerNetCash)} />
          <MoneyRow label="Left owing from this day" value={kwacha(statement.owedForDay)} />
          {older ? (
            <MoneyRow
              label="Still unpaid from this day"
              note="Above zero: the driver owes. Below zero: the owner owes."
              value={kwacha(remaining)}
              strong
              last
            />
          ) : (
            <>
              {statement.arrearsBroughtForward !== 0 ? (
                <MoneyRow label="From earlier days" value={kwacha(statement.arrearsBroughtForward)} />
              ) : null}
              {position.paid !== 0 ? <MoneyRow label="Payments confirmed" value={kwacha(position.paid)} /> : null}
              <MoneyRow
                label="Still to pay"
                note="Above zero: the driver owes. Below zero: the owner owes."
                value={kwacha(remaining)}
                strong
                last
              />
            </>
          )}
        </Card>

        {payments.length > 0 ? (
          <>
            <SectionTitle>Payments</SectionTitle>
            <Card style={styles.rows}>
              {payments.map((p, i) => (
                <View key={p.id}>
                  <MoneyRow
                    label={p.payer === 'driver' ? 'Driver paid the owner' : 'Owner paid the driver'}
                    note={data.paymentReasons[p.id] ? `${PAYMENT_STATUS[p.status]}: ${data.paymentReasons[p.id]}` : PAYMENT_STATUS[p.status]}
                    value={kwacha(p.confirmedAmount ?? p.amount)}
                    last={i === payments.length - 1 && !(p.status === 'confirmed' && iWasPaidBy(p.payer))}
                  />
                  {p.status === 'confirmed' && iWasPaidBy(p.payer) && !undoing ? (
                    <View style={styles.undo}>
                      <Button
                        compact
                        variant="secondary"
                        label="Undo this confirmation"
                        onPress={() => {
                          setReason('');
                          setError(null);
                          setUndoing(p);
                        }}
                      />
                    </View>
                  ) : null}
                </View>
              ))}
            </Card>
          </>
        ) : null}

        {remaining !== 0 && closed ? <Note>Anything not paid carries forward to the next day as money still owed.</Note> : null}

        {undoing ? (
          <View style={styles.answer}>
            <Text style={styles.label}>Why are you undoing this?</Text>
            <TextInput
              style={styles.input}
              value={reason}
              onChangeText={setReason}
              placeholder="For example, I tapped yes by mistake"
              placeholderTextColor={colors.muted}
              maxLength={300}
              multiline
              autoFocus
              accessibilityLabel="Why are you undoing this"
            />
            <Text style={styles.small}>
              {kwacha(undoing.confirmedAmount ?? undoing.amount)} will count as owed again. The other person can see this and
              your reason, and the record stays in the history.
            </Text>
          </View>
        ) : null}
        {answering === 'part' ? (
          <View style={styles.answer}>
            <MoneyField label="How much did you receive? (K)" value={partText} onChange={setPartText} />
          </View>
        ) : null}
        {answering === 'reject' ? (
          <View style={styles.answer}>
            <Text style={styles.label}>Tell them why (optional)</Text>
            <TextInput
              style={styles.input}
              value={reason}
              onChangeText={setReason}
              placeholder="For example, no cash was handed over"
              placeholderTextColor={colors.muted}
              maxLength={300}
              multiline
              accessibilityLabel="Reason"
            />
          </View>
        ) : null}
        {error ? (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}

        {correctable.length > 0 ? (
          <>
            <SectionTitle>Fix a mistake</SectionTitle>
            <Card style={styles.rows}>
              {correctable.map((item, i) => (
                <View key={item.id} style={[styles.correctRow, i > 0 && styles.divider]}>
                  <View style={styles.flex}>
                    <Text style={styles.correctLabel}>
                      {item.label}: {kwacha(item.amount)}
                    </Text>
                    {item.note ? <Text style={styles.correctNote}>{item.note}</Text> : null}
                  </View>
                  <Button
                    compact
                    variant="secondary"
                    label="Correct"
                    onPress={() =>
                      router.push({
                        pathname: '/correct-entry',
                        params: { id: item.id, type: item.type, amount: String(item.amount), label: item.label },
                      })
                    }
                  />
                </View>
              ))}
            </Card>
          </>
        ) : null}

        {entries.length + costs.length > 0 ? (
          <>
            <SectionTitle>Everything recorded</SectionTitle>
            <DayActivity viewer={isOwner ? 'owner' : 'driver'} entries={entries} costs={costs} />
          </>
        ) : null}
      </ScrollView>

      {undoing ? (
        <BottomActions>
          <Button
            label={saving ? 'Undoing...' : 'Undo this confirmation'}
            disabled={reason.trim() === '' || saving}
            onPress={() => undo(undoing)}
          />
          <Button variant="secondary" label="Go back" disabled={saving} onPress={() => setUndoing(null)} />
        </BottomActions>
      ) : iAnswerClaim && claimed ? (
        <BottomActions>
          {answering === 'part' ? (
            <>
              <Button
                label={saving ? 'Sending...' : partValid ? `I received ${kwacha(partAmount)}` : `Enter up to ${kwacha(claimed.amount)}`}
                disabled={!partValid || saving}
                onPress={() => decide(claimed, true, partAmount)}
              />
              <Button variant="secondary" label="Go back" disabled={saving} onPress={() => setAnswering(null)} />
            </>
          ) : answering === 'reject' ? (
            <>
              <Button label={saving ? 'Sending...' : 'I did not receive this'} disabled={saving} onPress={() => decide(claimed, false, null)} />
              <Button variant="secondary" label="Go back" disabled={saving} onPress={() => setAnswering(null)} />
            </>
          ) : (
            <>
              <Button
                label={saving ? 'Sending...' : `Yes, I received ${kwacha(claimed.amount)}`}
                disabled={saving}
                onPress={() => decide(claimed, true, claimed.amount)}
              />
              <Button variant="secondary" label="I received a different amount" disabled={saving} onPress={() => setAnswering('part')} />
              <Button variant="secondary" label="I did not receive this" disabled={saving} onPress={() => setAnswering('reject')} />
            </>
          )}
        </BottomActions>
      ) : null}

      {canPay && !undoing ? (
        <BottomActions>
          <Button
            label="Record a payment"
            onPress={() =>
              router.push({
                pathname: '/pay',
                params: { day: params.day, owed: String(Math.abs(remaining)), to: isOwner ? 'your driver' : 'the owner' },
              })
            }
          />
        </BottomActions>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centre: { flex: 1, justifyContent: 'center', gap: space(3), padding: space(6) },
  message: { fontSize: 15, lineHeight: 22, color: colors.text, textAlign: 'center' },
  content: { padding: space(4), paddingBottom: space(8) },
  heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space(2), marginBottom: space(3) },
  detail: { flexShrink: 1, fontSize: 14, color: colors.muted },
  headline: { alignItems: 'center', paddingVertical: space(5) },
  verdict: { fontSize: 16, fontWeight: '600', color: colors.muted, textAlign: 'center' },
  amount: { fontSize: 44, fontWeight: '800', color: colors.text, marginTop: space(1), fontVariant: ['tabular-nums'] },
  rows: { paddingVertical: space(1) },
  answer: { marginTop: space(5) },
  undo: { alignItems: 'flex-start', paddingBottom: space(3) },
  small: { fontSize: 13, lineHeight: 19, color: colors.muted, marginTop: space(2) },
  label: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: space(1.5) },
  input: {
    minHeight: 88,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.muted,
    borderRadius: radius.control,
    padding: space(3),
    fontSize: 16,
    color: colors.text,
    textAlignVertical: 'top',
  },
  error: { fontSize: 14, lineHeight: 20, color: colors.owes, marginTop: space(3) },
  correctRow: { flexDirection: 'row', alignItems: 'center', gap: space(3), paddingVertical: space(3) },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  correctLabel: { fontSize: 15, fontWeight: '600', color: colors.text },
  correctNote: { fontSize: 13, lineHeight: 18, color: colors.owes, marginTop: 2 },
});
