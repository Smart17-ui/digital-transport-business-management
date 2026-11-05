import { parseKwacha, type SettlementPayment, type SettlementState } from '@dt/domain';
import { randomUUID } from 'expo-crypto';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { DayActivity } from '@/components/day-activity';
import { MoneyField } from '@/components/form';
import { daySentNote } from '@/components/home-parts';
import { Text, TextInput } from '@/components/text';
import { BottomActions, Button, Card, ListRow, MoneyRow, Note, Pill, ScreenLoading, SectionTitle } from '@/components/ui';
import { formatDay, formatDaySpan, kwacha } from '@/lib/arrangements';
import { useAuth } from '@/lib/auth';
import { costCategoryLabel, fetchDaySettlement, useScreenData } from '@/lib/business';
import { reasonFor, sendCommand } from '@/lib/commands';
import { colors, radius, space, themedStyles, type } from '@/lib/theme';

const STATE_PILL: Record<SettlementState, { label: string; tone: 'ok' | 'waiting' | 'neutral' }> = {
  nothing_owed: { label: 'Nothing owed', tone: 'ok' },
  settled: { label: 'Paid', tone: 'ok' },
  part_paid: { label: 'Part paid', tone: 'waiting' },
  claimed: { label: 'To confirm', tone: 'waiting' },
  unpaid: { label: 'Not paid', tone: 'waiting' },
};

const PAYMENT_STATUS: Record<SettlementPayment['status'], string> = {
  claimed: 'Waiting to be confirmed',
  confirmed: 'Confirmed',
  rejected: 'Not received',
  reversed: 'Undone',
};

function verdict(remaining: number, isOwner: boolean): string {
  if (remaining > 0) return isOwner ? 'Your driver owes you' : 'You owe the owner';
  if (remaining < 0) return isOwner ? 'You owe your driver' : 'The owner owes you';
  return 'Nothing to pay';
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
  const [showEntries, setShowEntries] = useState(false);
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

  const title = <Stack.Screen options={{ title: 'Cashing' }} />;
  if (!data) {
    return (
      <View style={styles.centre}>
        {title}
        {failed ? (
          <>
            <Text style={styles.message}>Could not load the cashing. Check your signal and try again. If your signal is fine, the problem is on our side.</Text>
            <Button variant="secondary" label="Try again" onPress={reload} />
          </>
        ) : (
          <ScreenLoading />
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
      ? ({ label: 'Part paid', tone: 'waiting' } as const)
      : ({ label: statement.owedForDay === 0 ? 'Nothing owed' : 'Paid', tone: 'ok' } as const);
  const totalCosts = statement.expensesBorneByOwner + statement.expensesBorneByDriver;
  // What was due and what has come in, including money from earlier days, so the two always differ by what is left.
  const due = older ? statement.ownerShare : statement.ownerShare + statement.arrearsBroughtForward;
  const received = due - remaining;
  const progress = due > 0 ? Math.min(Math.max(received / due, 0), 1) : remaining === 0 ? 1 : 0;
  const paymentLabel = (p: SettlementPayment) => {
    if (p.payer === 'driver') return isOwner ? 'Your driver paid you' : 'You paid the owner';
    return isOwner ? 'You paid your driver' : 'The owner paid you';
  };
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
            disputed: e.status === 'disputed',
          })),
        ...costs
          .filter((c) => c.amount > 0 && c.status !== 'pending' && !reversed.has(c.id))
          .map((c) => ({ id: c.id, type: 'expense', amount: c.amount, label: costCategoryLabel(c.category), disputed: false })),
      ]
    : [];
  // A dispute stops the day being final, so it stays in view. Everything else waits until someone asks.
  const toFix = correctable.filter((item) => item.disputed);
  const correctRows = (items: typeof correctable) =>
    items.map((item, i) => (
      <View key={item.id} style={[styles.correctRow, i > 0 && styles.divider]}>
        <Text style={[styles.flex, styles.correctLabel]}>
          {item.label}: {kwacha(item.amount)}
        </Text>
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
    ));

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {title}
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} />}
      >
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <View style={styles.flex}>
              <Text style={styles.heroPlate}>{params.plate}</Text>
              <Text style={styles.heroDate}>
                {[formatDay(tripDay.serviceDate), formatDaySpan(data.times.startedAt, data.times.endedAt)].filter(Boolean).join(' · ')}
              </Text>
            </View>
            {statement.provisional ? (
              <Pill label="Not final yet" tone="waiting" />
            ) : (
              <Pill {...(older ? olderPill : STATE_PILL[position.state])} />
            )}
          </View>

          <Text style={styles.verdict}>{verdict(remaining, isOwner)}</Text>
          <Text style={styles.amount} adjustsFontSizeToFit numberOfLines={1}>
            {kwacha(Math.abs(remaining))}
          </Text>

          <View style={styles.track} accessibilityLabel={`${Math.round(progress * 100)}% of the cashing received`}>
            <View style={[styles.fill, { width: `${progress * 100}%` }]} />
          </View>
          <View style={styles.heroStats}>
            <HeroStat label="Cashing due" value={kwacha(due)} />
            <HeroStat label="Received" value={kwacha(received)} />
          </View>
        </View>

        {isOwner && daySentNote(data.times) ? <Note>{daySentNote(data.times)}</Note> : null}
        {statement.excused ? <Note>Report accepted: nothing more is owed for this day.</Note> : null}
        {!closed ? <Note>The day is still running, so this will change.</Note> : null}
        {older ? (
          <Note>
            Later payments are counted here.{' '}
            {allocation.balance === 0
              ? 'In total, nothing is owed now.'
              : `In total now: ${verdict(allocation.balance, isOwner).toLowerCase()} ${kwacha(Math.abs(allocation.balance))}.`}
          </Note>
        ) : null}
        {statement.unconfirmedIncomeIds.length > 0 ? (
          <Note>
            {statement.unconfirmedIncomeIds.length === 1
              ? '1 entry is not agreed yet, so it is not counted.'
              : `${statement.unconfirmedIncomeIds.length} entries are not agreed yet, so they are not counted.`}
          </Note>
        ) : null}
        {statement.pendingExpenseIds.length > 0 ? (
          <Note>
            {statement.pendingExpenseIds.length === 1
              ? '1 cost is not approved yet, so it is not counted.'
              : `${statement.pendingExpenseIds.length} costs are not approved yet, so they are not counted.`}
          </Note>
        ) : null}

        {toFix.length > 0 ? (
          <>
            <SectionTitle>Disputed: correct to finish the day</SectionTitle>
            <Card style={styles.rows}>{correctRows(toFix)}</Card>
          </>
        ) : null}

        <SectionTitle>How it adds up</SectionTitle>
        <Card style={styles.rows}>
          <MoneyRow label="Takings" value={kwacha(statement.grossIncome)} />
          {totalCosts !== 0 ? <MoneyRow label="Costs" value={`- ${kwacha(totalCosts)}`} /> : null}
          <MoneyRow
            label="Cashing due"
            note={statement.targetApplies ? undefined : 'Bus off the road: no fixed amount today.'}
            value={kwacha(statement.ownerShare)}
          />
          <MoneyRow label={isOwner ? 'Driver keeps' : 'You keep'} value={kwacha(statement.driverShare)} />
          <MoneyRow label={isOwner ? 'You received' : 'Owner received'} value={kwacha(statement.ownerNetCash)} />
          {!older && statement.arrearsBroughtForward !== 0 ? (
            <MoneyRow
              label={statement.arrearsBroughtForward > 0 ? 'Owed by the driver from before' : 'Owed by the owner from before'}
              value={kwacha(Math.abs(statement.arrearsBroughtForward))}
            />
          ) : null}
          {!older && position.paid !== 0 ? <MoneyRow label="Paid since" value={kwacha(Math.abs(position.paid))} /> : null}
          <MoneyRow label={verdict(remaining, isOwner)} value={kwacha(Math.abs(remaining))} strong last />
        </Card>

        {payments.length > 0 ? (
          <>
            <SectionTitle>Payments</SectionTitle>
            <Card style={styles.rows}>
              {payments.map((p, i) => (
                <View key={p.id}>
                  <MoneyRow
                    label={paymentLabel(p)}
                    note={data.paymentReasons[p.id] ? `${PAYMENT_STATUS[p.status]}: ${data.paymentReasons[p.id]}` : PAYMENT_STATUS[p.status]}
                    value={kwacha(p.confirmedAmount ?? p.amount)}
                    last={i === payments.length - 1 && !(p.status === 'confirmed' && iWasPaidBy(p.payer))}
                  />
                  {p.status === 'confirmed' && iWasPaidBy(p.payer) && !undoing ? (
                    <View style={styles.undo}>
                      <Button
                        compact
                        variant="secondary"
                        label="Undo"
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

        {remaining !== 0 && closed && !older ? <Note>Anything not paid moves to the next day.</Note> : null}

        {undoing ? (
          <View style={styles.answer}>
            <Text style={styles.label}>Why?</Text>
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
              {kwacha(undoing.confirmedAmount ?? undoing.amount)} will be owed again. The other person will see your reason.
            </Text>
          </View>
        ) : null}
        {answering === 'part' ? (
          <View style={styles.answer}>
            <MoneyField label="How much did you get? (K)" value={partText} onChange={setPartText} />
          </View>
        ) : null}
        {answering === 'reject' ? (
          <View style={styles.answer}>
            <Text style={styles.label}>Why? (optional)</Text>
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

        {entries.length + costs.length > 0 ? (
          <Card style={styles.toggle}>
            <ListRow
              first
              title={showEntries ? 'Hide entries' : 'See all entries'}
              onPress={() => setShowEntries(!showEntries)}
            />
          </Card>
        ) : null}
        {showEntries ? (
          <>
            <Card style={styles.rows}>
              <DayActivity viewer={isOwner ? 'owner' : 'driver'} entries={entries} costs={costs} />
            </Card>
            {correctable.length > toFix.length ? (
              <>
                <SectionTitle>Fix a mistake</SectionTitle>
                <Card style={styles.rows}>{correctRows(correctable.filter((item) => !item.disputed))}</Card>
              </>
            ) : null}
          </>
        ) : null}
      </ScrollView>

      {undoing ? (
        <BottomActions>
          <Button
            label={saving ? 'Undoing...' : 'Undo payment'}
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
                label={saving ? 'Sending...' : partValid ? `I got ${kwacha(partAmount)}` : `Enter up to ${kwacha(claimed.amount)}`}
                disabled={!partValid || saving}
                onPress={() => decide(claimed, true, partAmount)}
              />
              <Button variant="secondary" label="Go back" disabled={saving} onPress={() => setAnswering(null)} />
            </>
          ) : answering === 'reject' ? (
            <>
              <Button label={saving ? 'Sending...' : 'I did not get it'} disabled={saving} onPress={() => decide(claimed, false, null)} />
              <Button variant="secondary" label="Go back" disabled={saving} onPress={() => setAnswering(null)} />
            </>
          ) : (
            <>
              <Button
                label={saving ? 'Sending...' : `Yes, I got ${kwacha(claimed.amount)}`}
                disabled={saving}
                onPress={() => decide(claimed, true, claimed.amount)}
              />
              <Button variant="secondary" label="I got a different amount" disabled={saving} onPress={() => setAnswering('part')} />
              <Button variant="secondary" label="I did not get it" disabled={saving} onPress={() => setAnswering('reject')} />
            </>
          )}
        </BottomActions>
      ) : null}

      {canPay && !undoing ? (
        <BottomActions>
          <Button
            label="I paid"
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

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.flex}>
      <Text style={styles.heroStatLabel}>{label}</Text>
      <Text style={styles.heroStatValue} adjustsFontSizeToFit numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  flex: { flex: 1 },
  centre: { flex: 1, justifyContent: 'center', gap: space(3), padding: space(6) },
  message: { fontSize: 15, lineHeight: 22, color: colors.text, textAlign: 'center' },
  content: { padding: space(4), paddingBottom: space(8) },
  hero: { backgroundColor: colors.hero, borderRadius: radius.card, padding: space(5) },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', gap: space(3) },
  heroPlate: { ...type.heading, color: colors.onDark },
  heroDate: { ...type.small, color: colors.onDarkMuted, marginTop: 2 },
  verdict: { ...type.small, color: colors.onDarkMuted, marginTop: space(5) },
  amount: { ...type.display, color: colors.onDark, marginTop: space(1), fontVariant: ['tabular-nums'] },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.onDarkMuted, overflow: 'hidden', marginTop: space(4) },
  fill: { height: '100%', borderRadius: 3, backgroundColor: colors.primary },
  heroStats: { flexDirection: 'row', gap: space(3), marginTop: space(3) },
  heroStatLabel: { ...type.small, color: colors.onDarkMuted },
  heroStatValue: { ...type.heading, color: colors.onDark, marginTop: 2, fontVariant: ['tabular-nums'] },
  rows: { paddingVertical: space(1) },
  toggle: { padding: 0, overflow: 'hidden', marginTop: space(5), marginBottom: space(3) },
  answer: { marginTop: space(5) },
  undo: { alignItems: 'flex-start', paddingBottom: space(3) },
  small: { fontSize: 13, lineHeight: 19, color: colors.muted, marginTop: space(2) },
  label: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: space(1.5) },
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
  error: { fontSize: 14, lineHeight: 20, color: colors.owes, marginTop: space(3) },
  correctRow: { flexDirection: 'row', alignItems: 'center', gap: space(3), paddingVertical: space(3) },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  correctLabel: { fontSize: 15, fontWeight: '600', color: colors.text },
}));
