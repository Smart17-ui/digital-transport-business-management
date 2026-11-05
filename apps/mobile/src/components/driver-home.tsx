import {
  applyQueuedDayCommands,
  applyQueuedEntries,
  currentDayForVehicle,
  estimateSettlement,
  lastFinishedDayForVehicle,
  summariseDay,
  type DayCost,
  type DayEntry,
  type DayView,
} from '@dt/domain';
import { router, Stack } from 'expo-router';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DayActivity } from '@/components/day-activity';
import { callPhone, DayStatusPill, dayDetail, HomeHeader, initialsOf, QuickLinks, type Business } from '@/components/home-parts';
import { Text } from '@/components/text';
import { Avatar, Button, Card, EmptyState, ListRow, LoadError, Note, ScreenLoading, Section } from '@/components/ui';
import {
  describeCosts,
  describeTerms,
  formatDay,
  kwacha,
  localDate,
  termsAreReadable,
  type ArrangementRecord,
} from '@/lib/arrangements';
import { useDriverOverview } from '@/lib/business';
import { reasonForCode } from '@/lib/commands';
import { useCommandQueue } from '@/lib/queue';
import { colors, radius, space, themedStyles, type } from '@/lib/theme';

const REFUSED_TITLE: Record<string, string> = {
  start_day: 'Your day could not be started',
  end_day: 'Your day could not be ended',
  record_handover: 'Your cash entry was not accepted',
  log_expense: 'Your cost was not accepted',
  report_day: 'Your report was not accepted',
};

function openReport(vehicleId: string, plate: string) {
  router.push({ pathname: '/report-day', params: { bus: vehicleId, plate } });
}

/** Where the driver stands if everything so far is confirmed. It works with no signal, so it is always an estimate. */
function estimateLine(arrangement: ArrangementRecord, day: DayView, entries: DayEntry[], costs: DayCost[], arrears: number): string | null {
  if (!termsAreReadable(arrangement.type, arrangement.terms)) return null;
  const { whoOwesWhom, amountOwed } = estimateSettlement({ day, entries, costs, arrangement, arrearsBroughtForward: arrears });
  if (whoOwesWhom === 'nobody') return 'If this is all confirmed, nothing is owed.';
  return whoOwesWhom === 'driver_owes_owner'
    ? `If this is all confirmed, you owe the owner ${kwacha(amountOwed)}.`
    : `If this is all confirmed, the owner owes you ${kwacha(amountOwed)}.`;
}

function openSettlement(day: DayView, plate: string) {
  router.push({ pathname: '/day-settlement', params: { day: day.id, plate } });
}

function RunningDay(props: {
  day: DayView;
  vehicleId: string;
  plate: string;
  entries: DayEntry[];
  costs: DayCost[];
  estimate: string | null;
}) {
  const { day, vehicleId, plate } = props;
  const summary = summariseDay(props.entries, props.costs, day.id);
  const record = (kind: 'takings' | 'remittance') => router.push({ pathname: '/record-cash', params: { day: day.id, kind } });
  const entries = props.entries.filter((e) => e.tripDayId === day.id);
  const costs = props.costs.filter((c) => c.tripDayId === day.id);

  return (
    <>
      <View style={styles.hero}>
        <View style={styles.heroTop}>
          <Text style={styles.heroLabel}>Cash you should have</Text>
          <DayStatusPill day={day} />
        </View>
        <Text style={styles.heroAmount} adjustsFontSizeToFit numberOfLines={1}>
          {kwacha(summary.cashInHand)}
        </Text>
        <Text style={styles.heroNote}>
          {kwacha(summary.takings)} collected − {kwacha(summary.costsFromCash)} spent − {kwacha(summary.handedOver)} to owner
        </Text>
        <Text style={styles.heroNote}>{dayDetail(day)}</Text>
        {props.estimate ? <Text style={styles.heroEstimate}>{props.estimate}</Text> : null}
      </View>

      <View style={styles.actions}>
        <Button label="Record takings" icon="plus" onPress={() => record('takings')} />
        <View style={styles.actionRow}>
          <View style={styles.flex}>
            <Button variant="secondary" label="Give cash" icon="wallet" onPress={() => record('remittance')} />
          </View>
          <View style={styles.flex}>
            <Button
              variant="secondary"
              label="Add cost"
              icon="receipt"
              onPress={() => router.push({ pathname: '/add-cost', params: { day: day.id, bus: vehicleId } })}
            />
          </View>
        </View>
      </View>

      <Section title="Today">
        <Card style={styles.activityCard}>
          {entries.length + costs.length === 0 ? (
            <Text style={styles.muted}>Nothing recorded yet.</Text>
          ) : (
            <DayActivity viewer="driver" entries={entries} costs={costs} />
          )}
        </Card>
      </Section>

      <View style={styles.endDay}>
        {day.unsent ? null : <Button variant="secondary" label="See cashing so far" onPress={() => openSettlement(day, plate)} />}
        <Button variant="secondary" label="Report a problem" onPress={() => openReport(vehicleId, plate)} />
        <Button
          variant="secondary"
          label="End day"
          onPress={() => router.push({ pathname: '/end-day', params: { day: day.id, plate, start: String(day.odometerStart) } })}
        />
      </View>
    </>
  );
}

function IdleBus(props: {
  plate: string;
  vehicleId: string;
  day: DayView | null;
  last: DayView | null;
  canStart: boolean;
  entries: DayEntry[];
  costs: DayCost[];
}) {
  const { plate, day, last } = props;
  const settlementDay = day ?? last;
  return (
    <>
      <Card style={styles.busCard}>
        <View style={styles.heroTop}>
          <Text style={styles.plate}>{plate}</Text>
          {day ? <DayStatusPill day={day} /> : null}
        </View>
        <Text style={styles.muted}>{day ? dayDetail(day) : 'Ready when you are. Read the odometer, then start your day.'}</Text>
        {!day && props.canStart ? (
          <View style={styles.startAction}>
            <Button
              label="Start day"
              onPress={() => router.push({ pathname: '/start-day', params: { bus: props.vehicleId, plate } })}
            />
          </View>
        ) : null}
      </Card>
      <Card style={styles.list}>
        {settlementDay && !settlementDay.unsent ? (
          <ListRow
            first
            title={day ? 'See cashing' : 'Last cashing'}
            detail={formatDay(settlementDay.serviceDate)}
            onPress={() => openSettlement(settlementDay, plate)}
          />
        ) : null}
        <ListRow
          first={!settlementDay || settlementDay.unsent}
          title="Report a problem"
          detail="Sick, a breakdown or the bus off the road"
          onPress={() => openReport(props.vehicleId, plate)}
        />
      </Card>
      {day ? (
        <Section title="Today">
          <Card style={styles.activityCard}>
            <DayActivity
              viewer="driver"
              entries={props.entries.filter((e) => e.tripDayId === day.id)}
              costs={props.costs.filter((c) => c.tripDayId === day.id)}
            />
          </Card>
        </Section>
      ) : null}
    </>
  );
}

export function DriverHome({ business, userId }: { business: Business; userId: string }) {
  const insets = useSafeAreaInsets();
  const { data: overview, failed, refreshing, reload } = useDriverOverview(business.id, userId);
  const { waiting, refused, dismissRefused } = useCommandQueue(userId, reload);
  const arrangements = overview?.arrangements ?? [];
  const offers = arrangements.filter((a) => a.status === 'proposed');
  const agreed = arrangements.filter((a) => a.status === 'active');
  const plateOf = (vehicleId: string) => overview?.buses.find((b) => b.id === vehicleId)?.plate ?? 'Your bus';
  const days = applyQueuedDayCommands(overview?.days ?? [], waiting);
  const { entries, costs } = applyQueuedEntries(overview?.entries ?? [], overview?.costs ?? [], waiting);
  // One person drives one bus at a time.
  const running = days.some((d) => d.odometerEnd === null);
  const toCheck = overview?.paymentsToCheck ?? [];

  return (
    <ScrollView
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space(6) }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} />}
    >
      <Stack.Screen options={{ headerShown: false }} />
      <HomeHeader business={business} roleLabel="Driver" />
      {failed ? <LoadError message="Could not load your business. Check your signal and try again." onRetry={reload} /> : null}
      {!overview && !failed ? <ScreenLoading /> : null}
      {overview?.saved ? <Note>No signal. This is what was last loaded, and you can still record your day.</Note> : null}
      {waiting.length > 0 ? (
        <Note>
          {waiting.length === 1 ? '1 entry is' : `${waiting.length} entries are`} saved on this phone and will send when you have
          signal.
        </Note>
      ) : null}
      {refused.map((c) => (
        <Card key={c.clientId} style={styles.refused}>
          <Text style={styles.refusedTitle}>{REFUSED_TITLE[c.type] ?? 'Your entry was not accepted'}</Text>
          <Text style={styles.refusedText}>{reasonForCode(c.refusedCode!)}</Text>
          <Button compact variant="secondary" label="OK" onPress={() => dismissRefused(c.clientId)} />
        </Card>
      ))}

      {toCheck.length > 0 ? (
        <Section title="Needs you">
          <Card style={styles.list}>
            {toCheck.map((payment, i) => (
              <ListRow
                key={payment.id}
                first={i === 0}
                title={`The owner says they paid you ${kwacha(payment.amount)}`}
                detail={`For ${formatDay(payment.serviceDate)}`}
                right={
                  <Button
                    compact
                    label="Check"
                    onPress={() =>
                      router.push({ pathname: '/day-settlement', params: { day: payment.tripDayId, plate: plateOf(payment.vehicleId) } })
                    }
                  />
                }
              />
            ))}
          </Card>
        </Section>
      ) : null}

      {offers.length > 0 ? (
        <Section title="New offers">
          <Card style={styles.list}>
            {offers.map((a, i) => (
              <ListRow
                key={a.id}
                first={i === 0}
                title={plateOf(a.vehicleId)}
                detail={describeTerms(a.type, a.terms, 'driver')}
                onPress={() => router.push({ pathname: '/offer', params: { id: a.id } })}
              />
            ))}
          </Card>
        </Section>
      ) : null}

      {agreed.map((a) => {
        const plate = plateOf(a.vehicleId);
        const day = currentDayForVehicle(days, a.vehicleId, localDate());
        const arrears = (overview?.balances ?? []).filter((b) => b.id !== day?.id).reduce((total, b) => total + b.left, 0);
        return (
          <View key={a.id} style={styles.bus}>
            {day?.odometerEnd === null ? (
              <RunningDay
                day={day}
                vehicleId={a.vehicleId}
                plate={plate}
                entries={entries}
                costs={costs}
                estimate={estimateLine(a, day, entries, costs, arrears)}
              />
            ) : (
              <IdleBus
                plate={plate}
                vehicleId={a.vehicleId}
                day={day}
                last={lastFinishedDayForVehicle(days, a.vehicleId)}
                canStart={!running}
                entries={entries}
                costs={costs}
              />
            )}
            <Section title="Your agreement">
              <Card>
                <Text style={styles.agreementPlate}>{plate}</Text>
                <Text style={styles.agreement}>{describeTerms(a.type, a.terms, 'driver')}</Text>
                <Text style={styles.agreement}>{describeCosts(a.fuelBearer, a.otherCostsBearer, 'driver')}</Text>
              </Card>
            </Section>
          </View>
        );
      })}

      {overview && offers.length === 0 && agreed.length === 0 ? (
        <View style={styles.bus}>
          <EmptyState
            title={`You have joined ${business.name}`}
            detail="Your owner still needs to give you a bus and agree how the money is split. Pull down to check for an offer."
          />
        </View>
      ) : null}

      <QuickLinks />

      {overview?.owner ? (
        <Section title="Your owner">
          <Card style={styles.owner}>
            <ListRow
              first
              leading={<Avatar initials={initialsOf(overview.owner.name ?? business.name)} />}
              title={overview.owner.name ?? 'Your owner'}
              detail={[business.name, overview.owner.phone ? `+${overview.owner.phone}` : null].filter(Boolean).join(' · ')}
              right={
                overview.owner.phone ? (
                  <Button compact variant="secondary" label="Call" onPress={() => callPhone(overview.owner?.phone as string)} />
                ) : undefined
              }
            />
          </Card>
        </Section>
      ) : null}
    </ScrollView>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: space(4) },
  list: { padding: 0, overflow: 'hidden', marginTop: space(3) },
  owner: { padding: 0, overflow: 'hidden' },
  bus: { marginTop: space(5) },
  hero: { backgroundColor: colors.hero, borderRadius: radius.card, padding: space(5) },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space(2) },
  heroLabel: { ...type.small, color: colors.onDarkMuted },
  heroAmount: { ...type.display, color: colors.onDark, marginTop: space(1), fontVariant: ['tabular-nums'] },
  heroNote: { ...type.small, color: colors.onDarkMuted, marginTop: space(1) },
  heroEstimate: { ...type.small, fontWeight: '600', color: colors.onDark, marginTop: space(3) },
  actions: { gap: space(2), marginTop: space(3) },
  actionRow: { flexDirection: 'row', gap: space(2) },
  activityCard: { paddingVertical: space(1) },
  muted: { ...type.small, color: colors.muted, marginTop: space(1) },
  endDay: { gap: space(2), marginTop: space(4) },
  busCard: { gap: space(1) },
  plate: { ...type.title, color: colors.text },
  startAction: { marginTop: space(4) },
  agreementPlate: { ...type.heading, color: colors.text },
  agreement: { ...type.small, color: colors.muted, marginTop: space(1) },
  refused: { gap: space(2), marginTop: space(4), alignItems: 'flex-start' },
  refusedTitle: { ...type.heading, color: colors.owes },
  refusedText: { ...type.body, color: colors.text },
}));
